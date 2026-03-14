import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import http from 'http';
import app from '../app';
import { config } from '../config';
import { VaultService, vaultService } from '../services/vault.service';

describe('Admin API', () => {
  let server: http.Server;
  let baseUrl: string;
  let testVaultPath: string;
  let originalVaultPath: string;
  let originalExportPath: string;

  beforeAll(async () => {
    testVaultPath = path.join(os.tmpdir(), `vault-admin-test-${Date.now()}`);
    const testService = new VaultService(testVaultPath);
    await testService.init();
    Object.assign(vaultService, testService);

    // Override config paths so backup/export services use test vault
    originalVaultPath = config.vaultPath;
    originalExportPath = config.exportPath;
    (config as { vaultPath: string }).vaultPath = testVaultPath;
    (config as { exportPath: string }).exportPath = path.join(testVaultPath, 'exports');

    // Seed some notes
    await testService.create({
      title: 'Note for Backup Test',
      content: 'This note tests the backup system',
      tags: ['test', 'backup'],
    });
    await testService.create({
      title: 'Another Note',
      content: 'This is another note for export test',
      tags: ['test', 'export'],
    });

    server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Invalid address');
    baseUrl = `http://localhost:${address.port}`;
  });

  afterAll(async () => {
    server.close();
    // Restore original config
    (config as { vaultPath: string }).vaultPath = originalVaultPath;
    (config as { exportPath: string }).exportPath = originalExportPath;
    await fs.rm(testVaultPath, { recursive: true, force: true });
    const backupDir = path.resolve(testVaultPath, '..', 'backups');
    await fs.rm(backupDir, { recursive: true, force: true }).catch(() => {});
  });

  // ─── Health ───────────────────────────────────────────────────────

  describe('GET /api/admin/health', () => {
    it('should return deep health check', async () => {
      const res = await fetch(`${baseUrl}/api/admin/health`);
      const body = (await res.json()) as {
        success: boolean;
        data: {
          status: string;
          vault: { noteCount: number };
          services: Record<string, { available: boolean }>;
        };
      };

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(['healthy', 'degraded']).toContain(body.data.status);
      expect(body.data.vault.noteCount).toBeGreaterThanOrEqual(2);
      expect(body.data.services).toBeDefined();
    });
  });

  // ─── Vault Stats ──────────────────────────────────────────────────

  describe('GET /api/admin/vault/stats', () => {
    it('should return vault statistics', async () => {
      const res = await fetch(`${baseUrl}/api/admin/vault/stats`);
      const body = (await res.json()) as {
        success: boolean;
        data: { noteCount: number; totalSizeHuman: string };
      };

      expect(res.status).toBe(200);
      expect(body.data.noteCount).toBeGreaterThanOrEqual(2);
      expect(body.data.totalSizeHuman).toBeDefined();
    });
  });

  // ─── Backup ───────────────────────────────────────────────────────

  describe('Backup operations', () => {
    it('POST /api/admin/backup should create a backup', async () => {
      const res = await fetch(`${baseUrl}/api/admin/backup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: 'test' }),
      });
      const body = (await res.json()) as {
        success: boolean;
        data: { name: string; sizeHuman: string; noteCount: number };
      };

      expect(res.status).toBe(201);
      expect(body.success).toBe(true);
      expect(body.data.name).toContain('backup-');
      expect(body.data.name).toContain('test');
      expect(body.data.noteCount).toBeGreaterThanOrEqual(2);
    });

    it('GET /api/admin/backup should list backups', async () => {
      const res = await fetch(`${baseUrl}/api/admin/backup`);
      const body = (await res.json()) as {
        success: boolean;
        data: { name: string }[];
      };

      expect(res.status).toBe(200);
      expect(body.data.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── Export ───────────────────────────────────────────────────────

  describe('Export operations', () => {
    let testNoteId: string;

    beforeAll(async () => {
      // Get a note ID for export tests
      const res = await fetch(`${baseUrl}/api/notes`);
      const body = (await res.json()) as { data: { frontmatter: { id: string } }[] };
      testNoteId = body.data[0].frontmatter.id;
    });

    it('POST /api/admin/export/note (markdown) should export a note', async () => {
      const res = await fetch(`${baseUrl}/api/admin/export/note`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noteId: testNoteId, format: 'markdown' }),
      });
      const body = (await res.json()) as {
        success: boolean;
        data: { format: string; fileName: string; size: number };
      };

      expect(res.status).toBe(200);
      expect(body.data.format).toBe('markdown');
      expect(body.data.fileName).toContain('.md');
    });

    it('POST /api/admin/export/note (json) should export as JSON', async () => {
      const res = await fetch(`${baseUrl}/api/admin/export/note`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noteId: testNoteId, format: 'json' }),
      });
      const body = (await res.json()) as {
        success: boolean;
        data: { format: string; fileName: string };
      };

      expect(res.status).toBe(200);
      expect(body.data.format).toBe('json');
    });

    it('POST /api/admin/export/note (html) should export as HTML', async () => {
      const res = await fetch(`${baseUrl}/api/admin/export/note`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noteId: testNoteId, format: 'html' }),
      });
      const body = (await res.json()) as {
        success: boolean;
        data: { format: string; fileName: string };
      };

      expect(res.status).toBe(200);
      expect(body.data.format).toBe('html');
    });

    it('POST /api/admin/export/bulk should create a ZIP', async () => {
      const res = await fetch(`${baseUrl}/api/admin/export/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format: 'markdown' }),
      });
      const body = (await res.json()) as {
        success: boolean;
        data: { format: string; noteCount: number; fileName: string };
      };

      expect(res.status).toBe(200);
      expect(body.data.format).toBe('zip');
      expect(body.data.noteCount).toBeGreaterThanOrEqual(2);
    });

    it('POST /api/admin/export/note should return 400 without noteId', async () => {
      const res = await fetch(`${baseUrl}/api/admin/export/note`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it('GET /api/admin/export should list exports', async () => {
      const res = await fetch(`${baseUrl}/api/admin/export`);
      const body = (await res.json()) as {
        success: boolean;
        data: { fileName: string }[];
      };

      expect(res.status).toBe(200);
      expect(body.data.length).toBeGreaterThanOrEqual(1);
    });
  });
});
