import { embeddingService } from './embedding.service';
import { graphService } from './graph.service';
import { vaultService } from './vault.service';
import { llmService } from './llm.service';
import { SearchResult, Note } from '../models/Note';
import { logger } from '../utils/logger';

export interface RAGResponse {
  answer: string;
  sources: SearchResult[];
  strategy: 'hybrid' | 'vector' | 'graph' | 'fallback';
}

export class RAGService {
  /**
   * Hybrid Search: combines Vector (semantic) + Graph (structural) results
   * Priority: hybrid > vector-only > graph-only > text-fallback
   */
  async search(
    query: string,
    options?: { limit?: number; tags?: string[] },
  ): Promise<SearchResult[]> {
    const limit = options?.limit || 10;
    const hasVector = embeddingService.isAvailable();
    const hasGraph = graphService.isAvailable();

    // Hybrid: both available
    if (hasVector && hasGraph) {
      return this.hybridSearch(query, limit, options?.tags);
    }

    // Vector only
    if (hasVector) {
      return this.vectorSearch(query, limit, options?.tags);
    }

    // Graph only (tag-based search)
    if (hasGraph && options?.tags && options.tags.length > 0) {
      return this.graphSearch(options.tags, limit);
    }

    // Fallback → full-text search ใน vault
    return this.fallbackSearch(query, limit);
  }

  async ask(query: string, options?: { limit?: number }): Promise<RAGResponse> {
    const limit = options?.limit || 5;
    const results = await this.search(query, { limit });

    const strategy = this.detectStrategy();

    if (results.length === 0) {
      return {
        answer: 'ไม่พบข้อมูลที่เกี่ยวข้องใน knowledge base',
        sources: [],
        strategy,
      };
    }

    const contexts = results.map((r) => ({
      title: r.note.frontmatter.title,
      content: r.note.content,
    }));

    const answer = await llmService.synthesizeAnswer(query, contexts);

    return { answer, sources: results, strategy };
  }

  // ─── Hybrid Search (Vector + Graph) ────────────────────────────────

  private async hybridSearch(
    query: string,
    limit: number,
    tags?: string[],
  ): Promise<SearchResult[]> {
    // Run both searches in parallel
    const [vectorResults, graphNeighborIds] = await Promise.all([
      this.vectorSearch(query, limit, tags),
      this.getGraphRelatedIds(query, limit),
    ]);

    // Merge: vector results get base score, graph results get bonus
    const resultMap = new Map<string, SearchResult>();

    for (const vr of vectorResults) {
      resultMap.set(vr.note.frontmatter.id, {
        ...vr,
        source: 'hybrid',
      });
    }

    // Boost notes that also appear in graph results
    for (const graphId of graphNeighborIds) {
      if (resultMap.has(graphId)) {
        // Note found in both: boost score by 20%
        const existing = resultMap.get(graphId)!;
        existing.score *= 1.2;
        existing.source = 'hybrid';
      } else {
        // Note only in graph: add with moderate score
        try {
          const note = await vaultService.getById(graphId);
          resultMap.set(graphId, { note, score: 0.3, source: 'graph' });
        } catch {
          // Note may have been deleted
        }
      }
    }

    return Array.from(resultMap.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Use graph to find related notes based on:
   * 1. Notes that share tags with top vector results
   * 2. Notes connected via LINKS_TO or RELATED_TO
   */
  private async getGraphRelatedIds(query: string, limit: number): Promise<string[]> {
    if (!graphService.isAvailable()) return [];

    try {
      // Extract potential tags from query
      const queryTerms = query.toLowerCase().split(/\s+/);
      const graphIds = await graphService.findByTags(queryTerms, false);
      return graphIds.slice(0, limit);
    } catch (err) {
      logger.warn('Graph search failed, continuing without graph', err);
      return [];
    }
  }

  // ─── Vector Search ─────────────────────────────────────────────────

  private async vectorSearch(
    query: string,
    limit: number,
    tags?: string[],
  ): Promise<SearchResult[]> {
    const chromaResults = await embeddingService.search(query, {
      nResults: limit,
      tags,
    });

    const results: SearchResult[] = [];

    for (let i = 0; i < chromaResults.ids.length; i++) {
      try {
        const note = await vaultService.getById(chromaResults.ids[i]);
        const distance = chromaResults.distances[i] || 0;
        const score = 1 / (1 + distance);

        results.push({ note, score, source: 'vector' });
      } catch {
        logger.warn(`Note ${chromaResults.ids[i]} found in ChromaDB but not in vault`);
      }
    }

    return results.sort((a, b) => b.score - a.score);
  }

  // ─── Graph Search ─────────────────────────────────────────────────

  private async graphSearch(tags: string[], limit: number): Promise<SearchResult[]> {
    const noteIds = await graphService.findByTags(tags, false);
    const results: SearchResult[] = [];

    for (const id of noteIds.slice(0, limit)) {
      try {
        const note = await vaultService.getById(id);
        results.push({ note, score: 0.5, source: 'graph' });
      } catch {
        // skip
      }
    }

    return results;
  }

  // ─── Fallback Text Search ─────────────────────────────────────────

  private async fallbackSearch(query: string, limit: number): Promise<SearchResult[]> {
    const { notes } = await vaultService.getAll({ limit: 10000 });
    const queryLower = query.toLowerCase();
    const queryTerms = queryLower.split(/\s+/);

    const scored: SearchResult[] = notes
      .map((note) => {
        const score = this.calculateTextScore(note, queryTerms, queryLower);
        return { note, score, source: 'vector' as const };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return scored;
  }

  private calculateTextScore(note: Note, terms: string[], fullQuery: string): number {
    const title = note.frontmatter.title.toLowerCase();
    const content = note.content.toLowerCase();
    const tags = note.frontmatter.tags.join(' ').toLowerCase();
    const combined = `${title} ${content} ${tags}`;

    let score = 0;

    if (combined.includes(fullQuery)) score += 5;

    for (const term of terms) {
      if (title.includes(term)) score += 3;
      if (tags.includes(term)) score += 2;
      if (content.includes(term)) score += 1;
    }

    return score;
  }

  private detectStrategy(): RAGResponse['strategy'] {
    const hasVector = embeddingService.isAvailable();
    const hasGraph = graphService.isAvailable();
    if (hasVector && hasGraph) return 'hybrid';
    if (hasVector) return 'vector';
    if (hasGraph) return 'graph';
    return 'fallback';
  }
}

export const ragService = new RAGService();
