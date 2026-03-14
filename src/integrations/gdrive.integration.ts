import { google, drive_v3 } from 'googleapis';
import { config } from '../config';
import { vaultService } from '../services/vault.service';
import { llmService } from '../services/llm.service';
import { logger } from '../utils/logger';

/**
 * GoogleDriveIntegration - Import documents from Google Drive → Vault
 *
 * Features:
 * - Search Drive files
 * - Import Google Docs as Markdown notes
 * - Import PDF/text files
 * - List recent files
 */
export class GoogleDriveIntegration {
  private drive: drive_v3.Drive | null = null;

  constructor() {
    if (config.google.clientId && config.google.clientSecret && config.google.refreshToken) {
      const auth = new google.auth.OAuth2(
        config.google.clientId,
        config.google.clientSecret,
      );
      auth.setCredentials({ refresh_token: config.google.refreshToken });
      this.drive = google.drive({ version: 'v3', auth });
    }
  }

  isAvailable(): boolean {
    return this.drive !== null;
  }

  /**
   * Search Google Drive files
   */
  async search(query: string, limit: number = 10): Promise<DriveFileResult[]> {
    if (!this.drive) throw new Error('Google Drive not configured');

    const response = await this.drive.files.list({
      q: `fullText contains '${query.replace(/'/g, "\\'")}' and trashed = false`,
      pageSize: limit,
      fields: 'files(id, name, mimeType, modifiedTime, webViewLink, size)',
      orderBy: 'modifiedTime desc',
    });

    return (response.data.files || []).map((f) => ({
      id: f.id || '',
      name: f.name || '',
      mimeType: f.mimeType || '',
      modifiedTime: f.modifiedTime || '',
      webViewLink: f.webViewLink || '',
      size: parseInt(f.size || '0', 10),
    }));
  }

  /**
   * Import a Google Drive file → Vault note
   */
  async importFile(fileId: string): Promise<{ noteId: string; title: string }> {
    if (!this.drive) throw new Error('Google Drive not configured');

    // Get file metadata
    const meta = await this.drive.files.get({
      fileId,
      fields: 'id, name, mimeType, modifiedTime',
    });

    const fileName = meta.data.name || 'Untitled';
    const mimeType = meta.data.mimeType || '';

    let content: string;

    if (mimeType === 'application/vnd.google-apps.document') {
      // Google Docs → export as plain text
      const exported = await this.drive.files.export({
        fileId,
        mimeType: 'text/plain',
      });
      content = exported.data as string;
    } else if (mimeType === 'application/vnd.google-apps.spreadsheet') {
      // Google Sheets → export as CSV
      const exported = await this.drive.files.export({
        fileId,
        mimeType: 'text/csv',
      });
      content = `\`\`\`csv\n${exported.data as string}\n\`\`\``;
    } else if (mimeType === 'application/vnd.google-apps.presentation') {
      // Google Slides → export as plain text
      const exported = await this.drive.files.export({
        fileId,
        mimeType: 'text/plain',
      });
      content = exported.data as string;
    } else if (mimeType.startsWith('text/')) {
      // Text files → download directly
      const downloaded = await this.drive.files.get(
        { fileId, alt: 'media' },
        { responseType: 'text' },
      );
      content = downloaded.data as string;
    } else {
      content = `_Binary file imported from Google Drive_\nMIME Type: ${mimeType}\nFile ID: ${fileId}`;
    }

    // Auto-tag
    let tags: string[] = ['gdrive', 'imported'];
    try {
      const aiTags = await llmService.generateTags(content.substring(0, 2000), fileName);
      tags = ['gdrive', 'imported', ...aiTags];
    } catch {
      // keep defaults
    }

    const note = await vaultService.create({
      title: fileName,
      content: `${content}\n\n---\n_Imported from Google Drive: ${fileId}_`,
      tags,
      source: 'gdrive',
    });

    logger.info(`[GDrive] Imported: "${fileName}" → ${note.frontmatter.id}`);
    return { noteId: note.frontmatter.id, title: fileName };
  }

  /**
   * List recent Google Drive files
   */
  async listRecent(limit: number = 20): Promise<DriveFileResult[]> {
    if (!this.drive) throw new Error('Google Drive not configured');

    const response = await this.drive.files.list({
      pageSize: limit,
      fields: 'files(id, name, mimeType, modifiedTime, webViewLink, size)',
      orderBy: 'modifiedTime desc',
      q: 'trashed = false',
    });

    return (response.data.files || []).map((f) => ({
      id: f.id || '',
      name: f.name || '',
      mimeType: f.mimeType || '',
      modifiedTime: f.modifiedTime || '',
      webViewLink: f.webViewLink || '',
      size: parseInt(f.size || '0', 10),
    }));
  }
}

interface DriveFileResult {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  webViewLink: string;
  size: number;
}

export const gdriveIntegration = new GoogleDriveIntegration();
