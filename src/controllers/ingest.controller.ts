import { Request, Response, NextFunction } from 'express';
import { vaultService } from '../services/vault.service';
import { scraperService } from '../services/scraper.service';
import { whisperService } from '../services/whisper.service';
import { llmService } from '../services/llm.service';

export class IngestController {
  /**
   * POST /api/ingest/url
   * Body: { url: string, tags?: string[] }
   * → Scrape URL, summarize, create note
   */
  async ingestUrl(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { url, tags } = req.body;

      if (!url || typeof url !== 'string') {
        res.status(400).json({ success: false, error: 'url is required' });
        return;
      }

      const scraped = await scraperService.scrapeAndSummarize(url);

      const noteContent = [
        scraped.summary ? `## Summary\n${scraped.summary}` : '',
        `## Content\n${scraped.content.substring(0, 5000)}`,
        `\n---\nSource: ${url}`,
      ]
        .filter(Boolean)
        .join('\n\n');

      const note = await vaultService.create({
        title: scraped.title,
        content: noteContent,
        tags: tags || scraped.suggestedTags || ['web', 'clipping'],
        source: 'web',
      });

      res.status(201).json({
        success: true,
        data: {
          note,
          scraped: {
            title: scraped.title,
            summary: scraped.summary,
            suggestedTags: scraped.suggestedTags,
            contentLength: scraped.content.length,
          },
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/ingest/text
   * Body: { text: string, title?: string, tags?: string[], autoTag?: boolean }
   * → Create note with optional auto-tagging
   */
  async ingestText(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { text, title, tags, autoTag } = req.body;

      if (!text || typeof text !== 'string') {
        res.status(400).json({ success: false, error: 'text is required' });
        return;
      }

      const noteTitle = title || text.split('\n')[0].substring(0, 80);

      let noteTags = tags || [];
      if (autoTag !== false) {
        try {
          const aiTags = await llmService.generateTags(text, noteTitle);
          noteTags = [...new Set([...noteTags, ...aiTags])];
        } catch {
          // Keep provided tags
        }
      }

      const note = await vaultService.create({
        title: noteTitle,
        content: text,
        tags: noteTags,
        source: 'api',
      });

      res.status(201).json({ success: true, data: note });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/ingest/voice
   * Body: { fileUrl: string, language?: string, tags?: string[] }
   * → Transcribe voice + create note
   */
  async ingestVoice(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { fileUrl, language, tags } = req.body;

      if (!fileUrl || typeof fileUrl !== 'string') {
        res.status(400).json({ success: false, error: 'fileUrl is required' });
        return;
      }

      if (!whisperService.isAvailable()) {
        res.status(503).json({
          success: false,
          error: 'Voice transcription not available (OPENAI_API_KEY not set)',
        });
        return;
      }

      const transcription = await whisperService.transcribeFromUrl(fileUrl, language);

      const noteTitle = transcription.substring(0, 80);

      let noteTags = tags || ['voice'];
      try {
        const aiTags = await llmService.generateTags(transcription, noteTitle);
        noteTags = [...new Set([...noteTags, ...aiTags])];
      } catch {
        // Keep provided tags
      }

      const note = await vaultService.create({
        title: noteTitle,
        content: `🎙 *Voice Note*\n\n${transcription}`,
        tags: noteTags,
        source: 'api',
      });

      res.status(201).json({
        success: true,
        data: {
          note,
          transcription,
        },
      });
    } catch (err) {
      next(err);
    }
  }
}

export const ingestController = new IngestController();
