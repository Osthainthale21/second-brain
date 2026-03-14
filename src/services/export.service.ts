import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import archiver from 'archiver';
import { config } from '../config';
import { vaultService } from './vault.service';
import { logger } from '../utils/logger';
import { Note } from '../models/Note';

/**
 * ExportService - Export notes in various formats
 *
 * Formats:
 * - Markdown (.md) - single note or bulk
 * - JSON (.json) - structured data with frontmatter
 * - ZIP (.zip) - bulk export with folder structure
 * - HTML (.html) - rendered markdown
 */
export class ExportService {
  private get exportDir(): string {
    return config.exportPath;
  }

  async init(): Promise<void> {
    await fs.mkdir(this.exportDir, { recursive: true });
  }

  /**
   * Export a single note as Markdown
   */
  async exportAsMarkdown(noteId: string): Promise<ExportResult> {
    await this.init();
    const note = await vaultService.getById(noteId);
    const fileName = `${this.sanitize(note.frontmatter.title)}.md`;
    const filePath = path.join(this.exportDir, fileName);

    // Read original file to preserve frontmatter
    const originalContent = await fs.readFile(note.filePath, 'utf-8');
    await fs.writeFile(filePath, originalContent, 'utf-8');

    logger.info(`[Export] Markdown: ${fileName}`);
    return { format: 'markdown', fileName, filePath, size: Buffer.byteLength(originalContent) };
  }

  /**
   * Export a single note as JSON
   */
  async exportAsJson(noteId: string): Promise<ExportResult> {
    await this.init();
    const note = await vaultService.getById(noteId);
    const fileName = `${this.sanitize(note.frontmatter.title)}.json`;
    const filePath = path.join(this.exportDir, fileName);

    const jsonData = {
      metadata: note.frontmatter,
      content: note.content,
      exportedAt: new Date().toISOString(),
    };

    const jsonStr = JSON.stringify(jsonData, null, 2);
    await fs.writeFile(filePath, jsonStr, 'utf-8');

    logger.info(`[Export] JSON: ${fileName}`);
    return { format: 'json', fileName, filePath, size: Buffer.byteLength(jsonStr) };
  }

  /**
   * Export a single note as HTML
   */
  async exportAsHtml(noteId: string): Promise<ExportResult> {
    await this.init();
    const note = await vaultService.getById(noteId);
    const fileName = `${this.sanitize(note.frontmatter.title)}.html`;
    const filePath = path.join(this.exportDir, fileName);

    const html = this.renderHtml(note);
    await fs.writeFile(filePath, html, 'utf-8');

    logger.info(`[Export] HTML: ${fileName}`);
    return { format: 'html', fileName, filePath, size: Buffer.byteLength(html) };
  }

  /**
   * Bulk export — all notes (or filtered) as ZIP
   */
  async exportBulk(options?: {
    format?: 'markdown' | 'json' | 'html';
    tags?: string[];
    status?: string;
  }): Promise<ExportResult> {
    await this.init();

    const format = options?.format || 'markdown';
    const { notes } = await vaultService.getAll({ limit: 100000 });

    let filtered = notes;
    if (options?.tags?.length) {
      filtered = filtered.filter((n) =>
        options.tags!.some((t) => n.frontmatter.tags.includes(t)),
      );
    }
    if (options?.status) {
      filtered = filtered.filter((n) => n.frontmatter.status === options.status);
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const zipName = `export-${format}-${timestamp}.zip`;
    const zipPath = path.join(this.exportDir, zipName);

    return new Promise<ExportResult>((resolve, reject) => {
      const output = fsSync.createWriteStream(zipPath);
      const archive = archiver('zip', { zlib: { level: 6 } });

      output.on('close', () => {
        const size = archive.pointer();
        logger.info(`[Export] Bulk ZIP: ${zipName} (${filtered.length} notes, ${this.formatBytes(size)})`);
        resolve({ format: 'zip', fileName: zipName, filePath: zipPath, size, noteCount: filtered.length });
      });

      archive.on('error', reject);
      archive.pipe(output);

      for (const note of filtered) {
        const name = this.sanitize(note.frontmatter.title);

        switch (format) {
          case 'json': {
            const json = JSON.stringify({
              metadata: note.frontmatter,
              content: note.content,
            }, null, 2);
            archive.append(json, { name: `${name}.json` });
            break;
          }
          case 'html': {
            const html = this.renderHtml(note);
            archive.append(html, { name: `${name}.html` });
            break;
          }
          default: {
            // Read original .md file
            if (note.filePath) {
              archive.file(note.filePath, { name: `${name}.md` });
            }
            break;
          }
        }
      }

      archive.finalize();
    });
  }

  /**
   * List existing exports
   */
  async listExports(): Promise<ExportResult[]> {
    await this.init();

    try {
      const files = await fs.readdir(this.exportDir);
      const exports: ExportResult[] = [];

      for (const file of files) {
        const filePath = path.join(this.exportDir, file);
        const stats = await fs.stat(filePath);
        const ext = path.extname(file).slice(1);

        exports.push({
          format: ext as ExportResult['format'],
          fileName: file,
          filePath,
          size: stats.size,
        });
      }

      return exports.sort((a, b) => b.size - a.size);
    } catch {
      return [];
    }
  }

  /**
   * Delete an export file
   */
  async deleteExport(fileName: string): Promise<void> {
    const filePath = path.join(this.exportDir, fileName);
    await fs.unlink(filePath);
    logger.info(`[Export] Deleted: ${fileName}`);
  }

  // ─── Private Helpers ──────────────────────────────────────────────

  private renderHtml(note: Note): string {
    const tags = note.frontmatter.tags.map((t) => `<span class="tag">#${t}</span>`).join(' ');
    const contentHtml = this.markdownToHtml(note.content);

    return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(note.frontmatter.title)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; color: #333; line-height: 1.6; }
    h1 { border-bottom: 2px solid #eee; padding-bottom: 10px; }
    .meta { color: #666; font-size: 0.9em; margin-bottom: 20px; }
    .tag { background: #e3f2fd; color: #1565c0; padding: 2px 8px; border-radius: 4px; font-size: 0.85em; }
    pre { background: #f5f5f5; padding: 16px; border-radius: 8px; overflow-x: auto; }
    code { background: #f0f0f0; padding: 2px 6px; border-radius: 3px; }
    blockquote { border-left: 4px solid #ddd; margin-left: 0; padding-left: 16px; color: #666; }
  </style>
</head>
<body>
  <h1>${this.escapeHtml(note.frontmatter.title)}</h1>
  <div class="meta">
    <div>${tags}</div>
    <div>Created: ${note.frontmatter.created_at} | Source: ${note.frontmatter.source || 'N/A'}</div>
  </div>
  <div class="content">${contentHtml}</div>
</body>
</html>`;
  }

  private markdownToHtml(md: string): string {
    return md
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
      .replace(/^---$/gm, '<hr>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/^/, '<p>')
      .replace(/$/, '</p>');
  }

  private escapeHtml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  private sanitize(str: string): string {
    return str.replace(/[^a-zA-Z0-9ก-๙\s_-]/g, '').replace(/\s+/g, '-').substring(0, 100);
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  }
}

export interface ExportResult {
  format: string;
  fileName: string;
  filePath: string;
  size: number;
  noteCount?: number;
}

export const exportService = new ExportService();
