import { Request, Response, NextFunction } from 'express';
import path from 'path';
import { backupService } from '../services/backup.service';
import { exportService } from '../services/export.service';
import { embeddingService } from '../services/embedding.service';
import { graphService } from '../services/graph.service';
import { whisperService } from '../services/whisper.service';
import { telegramService } from '../services/telegram.service';
import { notionIntegration } from '../integrations/notion.integration';
import { gdriveIntegration } from '../integrations/gdrive.integration';
import { gcalendarIntegration } from '../integrations/gcalendar.integration';
import { canvaIntegration } from '../integrations/canva.integration';
import { cloudflareIntegration } from '../integrations/cloudflare.integration';

export class AdminController {
  // ─── Health Check (Deep) ──────────────────────────────────────────

  async healthDeep(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const services = {
        chromadb: { available: embeddingService.isAvailable(), embeddedNotes: 0 },
        neo4j: { available: graphService.isAvailable() },
        whisper: { available: whisperService.isAvailable() },
        telegram: { available: telegramService.isAvailable() },
        notion: { available: notionIntegration.isAvailable() },
        googleDrive: { available: gdriveIntegration.isAvailable() },
        googleCalendar: { available: gcalendarIntegration.isAvailable() },
        canva: { available: canvaIntegration.isAvailable() },
        cloudflare: cloudflareIntegration.getStatus(),
      };

      if (embeddingService.isAvailable()) {
        services.chromadb.embeddedNotes = await embeddingService.getCount();
      }

      const stats = await backupService.getVaultStats();

      const allServicesUp = Object.values(services).every(
        (s) => typeof s === 'object' && 'available' in s ? s.available : true,
      );

      res.json({
        success: true,
        data: {
          status: allServicesUp ? 'healthy' : 'degraded',
          timestamp: new Date().toISOString(),
          vault: stats,
          services,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  // ─── Backup ───────────────────────────────────────────────────────

  async createBackup(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { label } = req.body || {};
      const backup = await backupService.createBackup(label);
      res.status(201).json({ success: true, data: backup });
    } catch (err) {
      next(err);
    }
  }

  async listBackups(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const backups = await backupService.listBackups();
      res.json({ success: true, data: backups });
    } catch (err) {
      next(err);
    }
  }

  async restoreBackup(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { backupName } = req.body;
      if (!backupName) {
        res.status(400).json({ success: false, error: 'backupName is required' });
        return;
      }
      const result = await backupService.restoreBackup(backupName);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async deleteBackup(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const name = req.params.name as string;
      await backupService.deleteBackup(name);
      res.json({ success: true, message: `Backup "${name}" deleted` });
    } catch (err) {
      next(err);
    }
  }

  async getVaultStats(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const stats = await backupService.getVaultStats();
      res.json({ success: true, data: stats });
    } catch (err) {
      next(err);
    }
  }

  // ─── Export ───────────────────────────────────────────────────────

  async exportNote(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { noteId, format } = req.body;
      if (!noteId) {
        res.status(400).json({ success: false, error: 'noteId is required' });
        return;
      }

      let result;
      switch (format) {
        case 'json':
          result = await exportService.exportAsJson(noteId);
          break;
        case 'html':
          result = await exportService.exportAsHtml(noteId);
          break;
        default:
          result = await exportService.exportAsMarkdown(noteId);
          break;
      }

      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async exportBulk(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { format, tags, status } = req.body || {};
      const result = await exportService.exportBulk({ format, tags, status });
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async downloadExport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const fileName = req.params.fileName as string;
      const exports = await exportService.listExports();
      const found = exports.find((e) => e.fileName === fileName);

      if (!found) {
        res.status(404).json({ success: false, error: 'Export file not found' });
        return;
      }

      res.download(found.filePath, found.fileName);
    } catch (err) {
      next(err);
    }
  }

  async listExports(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const exports = await exportService.listExports();
      res.json({ success: true, data: exports });
    } catch (err) {
      next(err);
    }
  }

  async deleteExport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const fileName = req.params.fileName as string;
      await exportService.deleteExport(fileName);
      res.json({ success: true, message: `Export "${fileName}" deleted` });
    } catch (err) {
      next(err);
    }
  }
}

export const adminController = new AdminController();
