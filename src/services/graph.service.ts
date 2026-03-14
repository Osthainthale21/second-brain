import neo4j, { Driver, Session } from 'neo4j-driver';
import { config } from '../config';
import { Note } from '../models/Note';
import { logger } from '../utils/logger';

// =====================================================================
// GraphService - Neo4j Knowledge Graph
// =====================================================================
// Node types:  (:Note), (:Tag), (:Topic)
// Relationships:
//   (:Note)-[:HAS_TAG]->(:Tag)
//   (:Note)-[:LINKS_TO]->(:Note)
//   (:Note)-[:RELATED_TO]->(:Note)   ← auto-discovered by agents
//   (:Note)-[:ABOUT]->(:Topic)       ← extracted by LLM
// =====================================================================

export interface GraphNode {
  id: string;
  label: string;
  type: 'note' | 'tag' | 'topic';
  properties: Record<string, unknown>;
}

export interface GraphEdge {
  source: string;
  target: string;
  relationship: string;
  properties: Record<string, unknown>;
}

export interface GraphMap {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphNeighbor {
  noteId: string;
  title: string;
  relationship: string;
  depth: number;
  sharedTags: string[];
}

export class GraphService {
  private driver: Driver | null = null;
  private initialized = false;

  async init(): Promise<void> {
    if (!config.neo4j.password) {
      logger.warn('Neo4j password not set - graph features disabled');
      return;
    }

    try {
      this.driver = neo4j.driver(
        config.neo4j.uri,
        neo4j.auth.basic(config.neo4j.user, config.neo4j.password),
      );

      // Verify connection
      await this.driver.verifyConnectivity();

      // Create indexes
      await this.runQuery('CREATE INDEX note_id IF NOT EXISTS FOR (n:Note) ON (n.id)');
      await this.runQuery('CREATE INDEX tag_name IF NOT EXISTS FOR (t:Tag) ON (t.name)');
      await this.runQuery('CREATE INDEX topic_name IF NOT EXISTS FOR (t:Topic) ON (t.name)');

      this.initialized = true;
      logger.info('Neo4j Knowledge Graph connected');
    } catch (err) {
      logger.warn('Neo4j not available - graph features disabled', err);
      this.initialized = false;
    }
  }

  isAvailable(): boolean {
    return this.initialized && this.driver !== null;
  }

  async close(): Promise<void> {
    if (this.driver) {
      await this.driver.close();
      this.initialized = false;
    }
  }

  // ─── CRUD Operations ──────────────────────────────────────────────

  async upsertNote(note: Note): Promise<void> {
    if (!this.isAvailable()) return;

    const { id, title, tags, created_at, updated_at, status, source } = note.frontmatter;

    // Upsert the Note node
    await this.runQuery(
      `MERGE (n:Note {id: $id})
       SET n.title = $title,
           n.status = $status,
           n.source = $source,
           n.created_at = $created_at,
           n.updated_at = $updated_at`,
      { id, title, status: status || 'inbox', source: source || 'api', created_at, updated_at },
    );

    // Remove old tag relationships and re-create
    await this.runQuery(
      `MATCH (n:Note {id: $id})-[r:HAS_TAG]->() DELETE r`,
      { id },
    );

    for (const tag of tags) {
      await this.runQuery(
        `MATCH (n:Note {id: $id})
         MERGE (t:Tag {name: $tag})
         MERGE (n)-[:HAS_TAG]->(t)`,
        { id, tag: tag.toLowerCase() },
      );
    }

    // Parse [[wiki-links]] from content and create LINKS_TO relationships
    const wikiLinks = this.extractWikiLinks(note.content);
    if (wikiLinks.length > 0) {
      // Remove old explicit links
      await this.runQuery(
        `MATCH (n:Note {id: $id})-[r:LINKS_TO]->() DELETE r`,
        { id },
      );

      for (const linkedTitle of wikiLinks) {
        await this.runQuery(
          `MATCH (n:Note {id: $id})
           MATCH (target:Note)
           WHERE toLower(target.title) = toLower($linkedTitle)
           MERGE (n)-[:LINKS_TO]->(target)`,
          { id, linkedTitle },
        );
      }
    }

    logger.info(`Graph: upserted note ${id} with ${tags.length} tags, ${wikiLinks.length} links`);
  }

  async deleteNote(noteId: string): Promise<void> {
    if (!this.isAvailable()) return;

    await this.runQuery(
      `MATCH (n:Note {id: $id}) DETACH DELETE n`,
      { id: noteId },
    );

    // Clean up orphan tags
    await this.runQuery(
      `MATCH (t:Tag) WHERE NOT (t)<-[:HAS_TAG]-() DELETE t`,
    );

    logger.info(`Graph: deleted note ${noteId}`);
  }

  // ─── Query Operations ─────────────────────────────────────────────

  async getNeighbors(noteId: string, depth: number = 2): Promise<GraphNeighbor[]> {
    if (!this.isAvailable()) return [];

    const result = await this.runQuery(
      `MATCH (origin:Note {id: $id})
       MATCH path = (origin)-[r*1..${Math.min(depth, 4)}]-(neighbor:Note)
       WHERE neighbor.id <> $id
       WITH neighbor,
            length(path) AS dist,
            [rel IN relationships(path) | type(rel)] AS rels
       OPTIONAL MATCH (origin)-[:HAS_TAG]->(t:Tag)<-[:HAS_TAG]-(neighbor)
       WITH neighbor, dist, rels, collect(DISTINCT t.name) AS sharedTags
       RETURN DISTINCT neighbor.id AS noteId,
              neighbor.title AS title,
              rels[0] AS relationship,
              dist AS depth,
              sharedTags
       ORDER BY dist ASC, size(sharedTags) DESC
       LIMIT 20`,
      { id: noteId },
    );

    return result.map((record) => ({
      noteId: record.noteId as string,
      title: record.title as string,
      relationship: record.relationship as string,
      depth: (record.depth as { low?: number })?.low ?? (record.depth as number),
      sharedTags: record.sharedTags as string[],
    }));
  }

  async getMap(options?: { limit?: number; tag?: string }): Promise<GraphMap> {
    if (!this.isAvailable()) return { nodes: [], edges: [] };

    const limit = options?.limit || 100;
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];

    // Get Note nodes
    let noteQuery = `MATCH (n:Note) RETURN n.id AS id, n.title AS title, n.status AS status LIMIT $limit`;
    const noteParams: Record<string, unknown> = { limit: neo4j.int(limit) };

    if (options?.tag) {
      noteQuery = `MATCH (n:Note)-[:HAS_TAG]->(t:Tag {name: $tag}) RETURN n.id AS id, n.title AS title, n.status AS status LIMIT $limit`;
      noteParams.tag = options.tag.toLowerCase();
    }

    const noteRecords = await this.runQuery(noteQuery, noteParams);
    const noteIds = new Set<string>();

    for (const record of noteRecords) {
      const id = record.id as string;
      noteIds.add(id);
      nodes.push({
        id,
        label: record.title as string,
        type: 'note',
        properties: { status: record.status },
      });
    }

    // Get Tag nodes connected to these notes
    if (noteIds.size > 0) {
      const tagRecords = await this.runQuery(
        `MATCH (n:Note)-[:HAS_TAG]->(t:Tag)
         WHERE n.id IN $ids
         RETURN DISTINCT t.name AS name, count(n) AS noteCount`,
        { ids: Array.from(noteIds) },
      );

      for (const record of tagRecords) {
        const tagName = record.name as string;
        nodes.push({
          id: `tag:${tagName}`,
          label: tagName,
          type: 'tag',
          properties: { noteCount: record.noteCount },
        });
      }

      // Get edges (HAS_TAG, LINKS_TO, RELATED_TO)
      const edgeRecords = await this.runQuery(
        `MATCH (n:Note)-[r]->(target)
         WHERE n.id IN $ids AND (target:Tag OR target:Note OR target:Topic)
         RETURN n.id AS source,
                CASE WHEN target:Tag THEN 'tag:' + target.name
                     WHEN target:Topic THEN 'topic:' + target.name
                     ELSE target.id END AS target,
                type(r) AS relationship`,
        { ids: Array.from(noteIds) },
      );

      for (const record of edgeRecords) {
        edges.push({
          source: record.source as string,
          target: record.target as string,
          relationship: record.relationship as string,
          properties: {},
        });
      }
    }

    return { nodes, edges };
  }

  async findByTags(tags: string[], matchAll: boolean = false): Promise<string[]> {
    if (!this.isAvailable()) return [];

    const lowerTags = tags.map((t) => t.toLowerCase());

    let query: string;
    if (matchAll) {
      // Note must have ALL specified tags
      query = `
        MATCH (n:Note)
        WHERE ALL(tag IN $tags WHERE (n)-[:HAS_TAG]->(:Tag {name: tag}))
        RETURN n.id AS id`;
    } else {
      // Note must have ANY of the specified tags
      query = `
        MATCH (n:Note)-[:HAS_TAG]->(t:Tag)
        WHERE t.name IN $tags
        RETURN DISTINCT n.id AS id`;
    }

    const result = await this.runQuery(query, { tags: lowerTags });
    return result.map((r) => r.id as string);
  }

  async addRelationship(
    sourceNoteId: string,
    targetNoteId: string,
    relationship: string = 'RELATED_TO',
    properties?: Record<string, unknown>,
  ): Promise<void> {
    if (!this.isAvailable()) return;

    const allowedRelationships = ['RELATED_TO', 'LINKS_TO', 'CONTRADICTS', 'SUPPORTS', 'EXTENDS'];
    const rel = allowedRelationships.includes(relationship) ? relationship : 'RELATED_TO';

    await this.runQuery(
      `MATCH (a:Note {id: $sourceId})
       MATCH (b:Note {id: $targetId})
       MERGE (a)-[r:${rel}]->(b)
       SET r += $props`,
      {
        sourceId: sourceNoteId,
        targetId: targetNoteId,
        props: properties || {},
      },
    );

    logger.info(`Graph: ${sourceNoteId} -[${rel}]-> ${targetNoteId}`);
  }

  async addTopic(noteId: string, topicName: string): Promise<void> {
    if (!this.isAvailable()) return;

    await this.runQuery(
      `MATCH (n:Note {id: $id})
       MERGE (t:Topic {name: $topic})
       MERGE (n)-[:ABOUT]->(t)`,
      { id: noteId, topic: topicName.toLowerCase() },
    );
  }

  async getStats(): Promise<{
    noteCount: number;
    tagCount: number;
    topicCount: number;
    relationshipCount: number;
  }> {
    if (!this.isAvailable()) {
      return { noteCount: 0, tagCount: 0, topicCount: 0, relationshipCount: 0 };
    }

    const result = await this.runQuery(`
      OPTIONAL MATCH (n:Note)
      WITH count(DISTINCT n) AS notes
      OPTIONAL MATCH (t:Tag)
      WITH notes, count(DISTINCT t) AS tags
      OPTIONAL MATCH (tp:Topic)
      WITH notes, tags, count(DISTINCT tp) AS topics
      OPTIONAL MATCH ()-[r]->()
      RETURN notes AS noteCount, tags AS tagCount, topics AS topicCount, count(r) AS relationshipCount
    `);

    if (result.length === 0) {
      return { noteCount: 0, tagCount: 0, topicCount: 0, relationshipCount: 0 };
    }

    const r = result[0];
    const toNum = (v: unknown): number => {
      if (typeof v === 'number') return v;
      if (v && typeof v === 'object' && 'low' in v) return (v as { low: number }).low;
      return 0;
    };

    return {
      noteCount: toNum(r.noteCount),
      tagCount: toNum(r.tagCount),
      topicCount: toNum(r.topicCount),
      relationshipCount: toNum(r.relationshipCount),
    };
  }

  // ─── Helpers ───────────────────────────────────────────────────────

  private extractWikiLinks(content: string): string[] {
    const regex = /\[\[([^\]]+)\]\]/g;
    const links: string[] = [];
    let match;
    while ((match = regex.exec(content)) !== null) {
      links.push(match[1].trim());
    }
    return links;
  }

  private async runQuery(
    query: string,
    params?: Record<string, unknown>,
  ): Promise<Record<string, unknown>[]> {
    if (!this.driver) throw new Error('Neo4j not connected');

    const session: Session = this.driver.session();
    try {
      const result = await session.run(query, params);
      return result.records.map((record) => {
        const obj: Record<string, unknown> = {};
        record.keys.forEach((key) => {
          obj[key as string] = record.get(key as string);
        });
        return obj;
      });
    } finally {
      await session.close();
    }
  }
}

export const graphService = new GraphService();
