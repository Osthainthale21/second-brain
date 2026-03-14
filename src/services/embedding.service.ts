import { ChromaClient, Collection } from 'chromadb';
import { config } from '../config';
import { Note } from '../models/Note';
import { logger } from '../utils/logger';

export class EmbeddingService {
  private client: ChromaClient;
  private collection: Collection | null = null;
  private collectionName: string;
  private initialized = false;

  constructor() {
    this.client = new ChromaClient({ path: config.chroma.host });
    this.collectionName = config.chroma.collection;
  }

  async init(): Promise<void> {
    try {
      this.collection = await this.client.getOrCreateCollection({
        name: this.collectionName,
        metadata: { description: 'Second Brain note embeddings' },
      });
      this.initialized = true;
      logger.info(`ChromaDB collection "${this.collectionName}" ready`);
    } catch (err) {
      logger.warn('ChromaDB not available - vector search disabled', err);
      this.initialized = false;
    }
  }

  isAvailable(): boolean {
    return this.initialized && this.collection !== null;
  }

  async upsertNote(note: Note): Promise<void> {
    if (!this.isAvailable()) {
      logger.warn('ChromaDB not available, skipping embedding');
      return;
    }

    const document = `# ${note.frontmatter.title}\n\n${note.content}`;
    const metadata = {
      title: note.frontmatter.title,
      tags: note.frontmatter.tags.join(','),
      source: note.frontmatter.source || 'api',
      status: note.frontmatter.status || 'inbox',
      created_at: note.frontmatter.created_at,
      updated_at: note.frontmatter.updated_at,
    };

    await this.collection!.upsert({
      ids: [note.frontmatter.id],
      documents: [document],
      metadatas: [metadata],
    });

    logger.info(`Embedded note: ${note.frontmatter.id} (${note.frontmatter.title})`);
  }

  async deleteNote(noteId: string): Promise<void> {
    if (!this.isAvailable()) return;

    await this.collection!.delete({ ids: [noteId] });
    logger.info(`Removed embedding: ${noteId}`);
  }

  async search(
    query: string,
    options?: { nResults?: number; tags?: string[]; status?: string },
  ): Promise<{
    ids: string[];
    documents: string[];
    distances: number[];
    metadatas: Record<string, string>[];
  }> {
    if (!this.isAvailable()) {
      return { ids: [], documents: [], distances: [], metadatas: [] };
    }

    const nResults = options?.nResults || 10;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const whereConditions: any[] = [];
    if (options?.tags && options.tags.length > 0) {
      whereConditions.push({ tags: { $contains: options.tags[0] } });
    }
    if (options?.status) {
      whereConditions.push({ status: options.status });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const queryParams: any = { queryTexts: [query], nResults };
    if (whereConditions.length === 1) {
      queryParams.where = whereConditions[0];
    } else if (whereConditions.length > 1) {
      queryParams.where = { $and: whereConditions };
    }

    const results = await this.collection!.query(queryParams);

    const ids = (results.ids?.[0] || []) as string[];
    const documents = (results.documents?.[0] || []) as string[];
    const distances = (results.distances?.[0] || []) as number[];
    const metadatas = (results.metadatas?.[0] || []) as Record<string, string>[];

    return { ids, documents, distances, metadatas };
  }

  async getCount(): Promise<number> {
    if (!this.isAvailable()) return 0;
    return await this.collection!.count();
  }
}

export const embeddingService = new EmbeddingService();
