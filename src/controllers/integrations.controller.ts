import { Request, Response, NextFunction } from 'express';
import { notionIntegration } from '../integrations/notion.integration';
import { gdriveIntegration } from '../integrations/gdrive.integration';
import { gcalendarIntegration } from '../integrations/gcalendar.integration';
import { canvaIntegration } from '../integrations/canva.integration';
import { cloudflareIntegration } from '../integrations/cloudflare.integration';

export class IntegrationsController {
  // ─── Status ───────────────────────────────────────────────────────

  async getStatus(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json({
        success: true,
        data: {
          notion: { available: notionIntegration.isAvailable() },
          googleDrive: { available: gdriveIntegration.isAvailable() },
          googleCalendar: { available: gcalendarIntegration.isAvailable() },
          canva: { available: canvaIntegration.isAvailable() },
          cloudflare: cloudflareIntegration.getStatus(),
        },
      });
    } catch (err) {
      next(err);
    }
  }

  // ─── Notion ───────────────────────────────────────────────────────

  async notionSearch(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { query, limit } = req.body;
      if (!query) { res.status(400).json({ success: false, error: 'query is required' }); return; }
      const results = await notionIntegration.search(query, limit);
      res.json({ success: true, data: results });
    } catch (err) { next(err); }
  }

  async notionImport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { pageId } = req.body;
      if (!pageId) { res.status(400).json({ success: false, error: 'pageId is required' }); return; }
      const result = await notionIntegration.importPage(pageId);
      res.status(201).json({ success: true, data: result });
    } catch (err) { next(err); }
  }

  async notionExport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { noteId, parentPageId } = req.body;
      if (!noteId) { res.status(400).json({ success: false, error: 'noteId is required' }); return; }
      const result = await notionIntegration.exportNote(noteId, parentPageId);
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  }

  async notionRecent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const results = await notionIntegration.listRecent(limit);
      res.json({ success: true, data: results });
    } catch (err) { next(err); }
  }

  // ─── Google Drive ─────────────────────────────────────────────────

  async gdriveSearch(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { query, limit } = req.body;
      if (!query) { res.status(400).json({ success: false, error: 'query is required' }); return; }
      const results = await gdriveIntegration.search(query, limit);
      res.json({ success: true, data: results });
    } catch (err) { next(err); }
  }

  async gdriveImport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { fileId } = req.body;
      if (!fileId) { res.status(400).json({ success: false, error: 'fileId is required' }); return; }
      const result = await gdriveIntegration.importFile(fileId);
      res.status(201).json({ success: true, data: result });
    } catch (err) { next(err); }
  }

  async gdriveRecent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const results = await gdriveIntegration.listRecent(limit);
      res.json({ success: true, data: results });
    } catch (err) { next(err); }
  }

  // ─── Google Calendar ──────────────────────────────────────────────

  async gcalUpcoming(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const events = await gcalendarIntegration.listUpcoming(limit);
      res.json({ success: true, data: events });
    } catch (err) { next(err); }
  }

  async gcalToday(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const events = await gcalendarIntegration.getTodaysEvents();
      res.json({ success: true, data: events });
    } catch (err) { next(err); }
  }

  async gcalCreateEvent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { title, description, startTime, endTime, attendees } = req.body;
      if (!title || !startTime || !endTime) {
        res.status(400).json({ success: false, error: 'title, startTime, endTime required' });
        return;
      }
      const event = await gcalendarIntegration.createEvent({ title, description, startTime, endTime, attendees });
      res.status(201).json({ success: true, data: event });
    } catch (err) { next(err); }
  }

  async gcalMeetingNote(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { eventId } = req.body;
      if (!eventId) { res.status(400).json({ success: false, error: 'eventId is required' }); return; }
      const result = await gcalendarIntegration.createMeetingNote(eventId);
      res.status(201).json({ success: true, data: result });
    } catch (err) { next(err); }
  }

  // ─── Canva ────────────────────────────────────────────────────────

  async canvaList(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const designs = await canvaIntegration.listDesigns(limit);
      res.json({ success: true, data: designs });
    } catch (err) { next(err); }
  }

  async canvaCreate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { title, designType, width, height } = req.body;
      if (!title) { res.status(400).json({ success: false, error: 'title is required' }); return; }
      const result = await canvaIntegration.createDesign({ title, designType, width, height });
      res.status(201).json({ success: true, data: result });
    } catch (err) { next(err); }
  }

  async canvaExport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { designId, format } = req.body;
      if (!designId) { res.status(400).json({ success: false, error: 'designId is required' }); return; }
      const result = await canvaIntegration.exportDesign(designId, format);
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  }

  // ─── Cloudflare ───────────────────────────────────────────────────

  async cfStatus(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json({ success: true, data: cloudflareIntegration.getStatus() });
    } catch (err) { next(err); }
  }

  async cfR2List(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const prefix = req.query.prefix as string;
      const objects = await cloudflareIntegration.r2List(prefix);
      res.json({ success: true, data: objects });
    } catch (err) { next(err); }
  }

  async cfD1Query(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sql, params } = req.body;
      if (!sql) { res.status(400).json({ success: false, error: 'sql is required' }); return; }
      const result = await cloudflareIntegration.d1Query(sql, params);
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  }

  async cfKvGet(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const key = req.params.key as string;
      const value = await cloudflareIntegration.kvGet(key);
      if (value === null) { res.status(404).json({ success: false, error: 'Key not found' }); return; }
      res.json({ success: true, data: { key, value } });
    } catch (err) { next(err); }
  }

  async cfKvSet(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { key, value, ttl } = req.body;
      if (!key || value === undefined) { res.status(400).json({ success: false, error: 'key and value required' }); return; }
      await cloudflareIntegration.kvSet(key, value, ttl);
      res.json({ success: true, message: `Key "${key}" saved` });
    } catch (err) { next(err); }
  }
}

export const integrationsController = new IntegrationsController();
