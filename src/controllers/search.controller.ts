import { Request, Response, NextFunction } from 'express';
import { ragService } from '../services/rag.service';
import { embeddingService } from '../services/embedding.service';
import { graphService } from '../services/graph.service';

export class SearchController {
  async search(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { query, limit, tags } = req.body;

      if (!query || typeof query !== 'string') {
        res.status(400).json({ success: false, error: 'query is required' });
        return;
      }

      const results = await ragService.search(query, {
        limit: limit || 10,
        tags,
      });

      res.json({
        success: true,
        data: results,
        meta: {
          query,
          count: results.length,
          chromaAvailable: embeddingService.isAvailable(),
          neo4jAvailable: graphService.isAvailable(),
        },
      });
    } catch (err) {
      next(err);
    }
  }

  async ask(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { query, limit } = req.body;

      if (!query || typeof query !== 'string') {
        res.status(400).json({ success: false, error: 'query is required' });
        return;
      }

      const result = await ragService.ask(query, { limit: limit || 5 });

      res.json({
        success: true,
        data: {
          answer: result.answer,
          strategy: result.strategy,
          sources: result.sources.map((s) => ({
            id: s.note.frontmatter.id,
            title: s.note.frontmatter.title,
            score: s.score,
            source: s.source,
          })),
        },
        meta: { query },
      });
    } catch (err) {
      next(err);
    }
  }

  async status(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const chromaAvailable = embeddingService.isAvailable();
      const chromaCount = await embeddingService.getCount();
      const graphStats = await graphService.getStats();

      res.json({
        success: true,
        data: {
          chromadb: {
            available: chromaAvailable,
            embeddedNotes: chromaCount,
          },
          neo4j: {
            available: graphService.isAvailable(),
            ...graphStats,
          },
        },
      });
    } catch (err) {
      next(err);
    }
  }
}

export const searchController = new SearchController();
