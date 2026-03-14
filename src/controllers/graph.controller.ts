import { Request, Response, NextFunction } from 'express';
import { graphService } from '../services/graph.service';

export class GraphController {
  async getNeighbors(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id);
      const depth = parseInt(req.query.depth as string) || 2;

      if (!graphService.isAvailable()) {
        res.status(503).json({
          success: false,
          error: 'Neo4j graph service is not available',
        });
        return;
      }

      const neighbors = await graphService.getNeighbors(id, depth);

      res.json({
        success: true,
        data: neighbors,
        meta: { noteId: id, depth, count: neighbors.length },
      });
    } catch (err) {
      next(err);
    }
  }

  async getMap(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const tag = req.query.tag as string | undefined;

      if (!graphService.isAvailable()) {
        res.status(503).json({
          success: false,
          error: 'Neo4j graph service is not available',
        });
        return;
      }

      const map = await graphService.getMap({ limit, tag });

      res.json({
        success: true,
        data: map,
        meta: { nodeCount: map.nodes.length, edgeCount: map.edges.length },
      });
    } catch (err) {
      next(err);
    }
  }

  async findByTags(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { tags, matchAll } = req.body;

      if (!tags || !Array.isArray(tags) || tags.length === 0) {
        res.status(400).json({ success: false, error: 'tags array is required' });
        return;
      }

      if (!graphService.isAvailable()) {
        res.status(503).json({
          success: false,
          error: 'Neo4j graph service is not available',
        });
        return;
      }

      const noteIds = await graphService.findByTags(tags, matchAll || false);

      res.json({
        success: true,
        data: { noteIds },
        meta: { tags, matchAll: matchAll || false, count: noteIds.length },
      });
    } catch (err) {
      next(err);
    }
  }

  async addRelationship(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sourceId, targetId, relationship, properties } = req.body;

      if (!sourceId || !targetId) {
        res.status(400).json({
          success: false,
          error: 'sourceId and targetId are required',
        });
        return;
      }

      if (!graphService.isAvailable()) {
        res.status(503).json({
          success: false,
          error: 'Neo4j graph service is not available',
        });
        return;
      }

      await graphService.addRelationship(sourceId, targetId, relationship, properties);

      res.json({
        success: true,
        data: { sourceId, targetId, relationship: relationship || 'RELATED_TO' },
      });
    } catch (err) {
      next(err);
    }
  }

  async getStats(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const stats = await graphService.getStats();

      res.json({
        success: true,
        data: stats,
      });
    } catch (err) {
      next(err);
    }
  }
}

export const graphController = new GraphController();
