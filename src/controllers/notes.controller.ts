import { Request, Response, NextFunction } from 'express';
import { vaultService } from '../services/vault.service';
import { CreateNoteDto, UpdateNoteDto } from '../models/Note';

export class NotesController {
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const dto: CreateNoteDto = {
        title: req.body.title,
        content: req.body.content,
        tags: req.body.tags,
        source: req.body.source || 'api',
      };

      const note = await vaultService.create(dto);

      res.status(201).json({
        success: true,
        data: note,
      });
    } catch (err) {
      next(err);
    }
  }

  async getAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tag = req.query.tag as string | undefined;
      const status = req.query.status as string | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
      const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : undefined;

      const result = await vaultService.getAll({ tag, status, limit, offset });

      res.json({
        success: true,
        data: result.notes,
        meta: {
          total: result.total,
          limit: limit || 50,
          offset: offset || 0,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const note = await vaultService.getById(req.params.id as string);

      res.json({
        success: true,
        data: note,
      });
    } catch (err) {
      next(err);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const dto: UpdateNoteDto = {
        title: req.body.title,
        content: req.body.content,
        tags: req.body.tags,
        status: req.body.status,
      };

      const note = await vaultService.update(req.params.id as string, dto);

      res.json({
        success: true,
        data: note,
      });
    } catch (err) {
      next(err);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await vaultService.delete(req.params.id as string);

      res.json({
        success: true,
        message: 'Note deleted successfully',
      });
    } catch (err) {
      next(err);
    }
  }

  async getTags(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tags = await vaultService.getTags();

      res.json({
        success: true,
        data: tags,
      });
    } catch (err) {
      next(err);
    }
  }
}

export const notesController = new NotesController();
