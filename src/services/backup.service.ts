import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import archiver from 'archiver';
import { config } from '../config';
import { logger } from '../utils/logger';

/**
 * BackupService - Vault backup & restore
 *
 * Features:
 * - Create ZIP backup of entire vault
 * - Auto-backup on schedule (daily)
 * - Restore from backup ZIP
 * - Rotate old backups (keep N most recent)
 * - List available backups
 */
export class BackupService {
  private maxBackups: number;

  constructor() {
    this.maxBackups = 30;
  }

  private get backupDir(): string {
    return path.resolve(config.vaultPath, '..', 'backups');
  }

  async init(): Promise<void> {
    await fs.mkdir(this.backupDir, { recursive: true });
    logger.info(`[Backup] Backup directory: ${this.backupDir}`);
  }

  /**
   * Create a full ZIP backup of the vault
   */
  async createBackup(label?: string): Promise<BackupInfo> {
    await this.init();

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const name = label
      ? `backup-${timestamp}-${this.sanitize(label)}.zip`
      : `backup-${timestamp}.zip`;
    const backupPath = path.join(this.backupDir, name);

    return new Promise<BackupInfo>((resolve, reject) => {
      const output = fsSync.createWriteStream(backupPath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', async () => {
        const stats = await fs.stat(backupPath);
        const info: BackupInfo = {
          name,
          path: backupPath,
          size: stats.size,
          sizeHuman: this.formatBytes(stats.size),
          createdAt: new Date().toISOString(),
          noteCount: await this.countFiles(config.vaultPath, '.md'),
        };

        logger.info(`[Backup] Created: ${name} (${info.sizeHuman}, ${info.noteCount} notes)`);

        // Rotate old backups
        await this.rotateBackups();

        resolve(info);
      });

      archive.on('error', (err) => {
        logger.error('[Backup] Archive error', err);
        reject(err);
      });

      archive.pipe(output);

      // Add vault directory (excluding backups and temp)
      archive.glob('**/*.md', {
        cwd: config.vaultPath,
        ignore: ['.tmp/**'],
        dot: true, // Include .inbox and other dot directories
      });

      archive.finalize();
    });
  }

  /**
   * Restore vault from a backup ZIP
   * WARNING: This will OVERWRITE existing files!
   */
  async restoreBackup(backupName: string): Promise<RestoreResult> {
    const backupPath = path.join(this.backupDir, backupName);

    // Verify backup exists
    try {
      await fs.access(backupPath);
    } catch {
      throw new Error(`Backup not found: ${backupName}`);
    }

    // Create a safety backup first
    const safetyBackup = await this.createBackup('pre-restore');
    logger.info(`[Backup] Safety backup created before restore: ${safetyBackup.name}`);

    // Extract using dynamic import of extract-zip or manual process
    // For simplicity, we'll use archiver's extract capability
    const AdmZip = await this.loadAdmZip();
    if (!AdmZip) {
      // Fallback: just copy the zip info without extracting
      throw new Error('Restore requires adm-zip package. Run: npm install adm-zip');
    }

    const zip = new AdmZip(backupPath);
    const entries = zip.getEntries();

    let restored = 0;
    for (const entry of entries) {
      if (entry.isDirectory) continue;

      const targetPath = path.join(config.vaultPath, entry.entryName);
      const targetDir = path.dirname(targetPath);
      await fs.mkdir(targetDir, { recursive: true });
      await fs.writeFile(targetPath, entry.getData());
      restored++;
    }

    logger.info(`[Backup] Restored ${restored} files from ${backupName}`);

    return {
      backupName,
      filesRestored: restored,
      safetyBackup: safetyBackup.name,
    };
  }

  /**
   * List all available backups
   */
  async listBackups(): Promise<BackupInfo[]> {
    await this.init();

    try {
      const files = await fs.readdir(this.backupDir);
      const backups: BackupInfo[] = [];

      for (const file of files) {
        if (!file.endsWith('.zip')) continue;

        const filePath = path.join(this.backupDir, file);
        const stats = await fs.stat(filePath);

        backups.push({
          name: file,
          path: filePath,
          size: stats.size,
          sizeHuman: this.formatBytes(stats.size),
          createdAt: stats.birthtime.toISOString(),
          noteCount: 0, // Don't count inside ZIP for performance
        });
      }

      // Sort newest first
      backups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return backups;
    } catch {
      return [];
    }
  }

  /**
   * Delete a specific backup
   */
  async deleteBackup(backupName: string): Promise<void> {
    const backupPath = path.join(this.backupDir, backupName);
    await fs.unlink(backupPath);
    logger.info(`[Backup] Deleted: ${backupName}`);
  }

  /**
   * Get vault statistics
   */
  async getVaultStats(): Promise<VaultStats> {
    const noteCount = await this.countFiles(config.vaultPath, '.md');
    const totalSize = await this.getDirSize(config.vaultPath);
    const backups = await this.listBackups();

    return {
      noteCount,
      totalSize,
      totalSizeHuman: this.formatBytes(totalSize),
      vaultPath: config.vaultPath,
      backupCount: backups.length,
      latestBackup: backups[0] || null,
    };
  }

  // ─── Private Helpers ──────────────────────────────────────────────

  private async rotateBackups(): Promise<void> {
    const backups = await this.listBackups();

    if (backups.length > this.maxBackups) {
      const toDelete = backups.slice(this.maxBackups);
      for (const backup of toDelete) {
        await this.deleteBackup(backup.name);
        logger.info(`[Backup] Rotated old backup: ${backup.name}`);
      }
    }
  }

  private async countFiles(dir: string, ext: string): Promise<number> {
    let count = 0;
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory() && entry.name !== '.tmp') {
          count += await this.countFiles(fullPath, ext);
        } else if (entry.isFile() && entry.name.endsWith(ext)) {
          count++;
        }
      }
    } catch {
      // directory doesn't exist
    }
    return count;
  }

  private async getDirSize(dir: string): Promise<number> {
    let size = 0;
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory() && entry.name !== '.tmp') {
          size += await this.getDirSize(fullPath);
        } else if (entry.isFile()) {
          const stats = await fs.stat(fullPath);
          size += stats.size;
        }
      }
    } catch {
      // directory doesn't exist
    }
    return size;
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  }

  private sanitize(str: string): string {
    return str.replace(/[^a-zA-Z0-9-_]/g, '').substring(0, 50);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async loadAdmZip(): Promise<any> {
    try {
      const mod = await import('adm-zip');
      return mod.default || mod;
    } catch {
      return null;
    }
  }
}

// Types
export interface BackupInfo {
  name: string;
  path: string;
  size: number;
  sizeHuman: string;
  createdAt: string;
  noteCount: number;
}

export interface RestoreResult {
  backupName: string;
  filesRestored: number;
  safetyBackup: string;
}

export interface VaultStats {
  noteCount: number;
  totalSize: number;
  totalSizeHuman: string;
  vaultPath: string;
  backupCount: number;
  latestBackup: BackupInfo | null;
}

export const backupService = new BackupService();
