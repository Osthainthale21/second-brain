import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import http from 'http';
import app from '../app';
import { VaultService, vaultService } from '../services/vault.service';

describe('Integrations API', () => {
  let server: http.Server;
  let baseUrl: string;
  let testVaultPath: string;

  beforeAll(async () => {
    testVaultPath = path.join(os.tmpdir(), `vault-integrations-test-${Date.now()}`);
    const testService = new VaultService(testVaultPath);
    await testService.init();
    Object.assign(vaultService, testService);

    server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Invalid address');
    baseUrl = `http://localhost:${address.port}`;
  });

  afterAll(async () => {
    server.close();
    await fs.rm(testVaultPath, { recursive: true, force: true });
  });

  describe('GET /api/integrations/status', () => {
    it('should return all integration statuses', async () => {
      const res = await fetch(`${baseUrl}/api/integrations/status`);
      const body = (await res.json()) as {
        success: boolean;
        data: {
          notion: { available: boolean };
          googleDrive: { available: boolean };
          googleCalendar: { available: boolean };
          canva: { available: boolean };
          cloudflare: { available: boolean; services: { name: string; configured: boolean }[] };
        };
      };

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);

      // All should be unavailable in test (no API keys)
      expect(typeof body.data.notion.available).toBe('boolean');
      expect(typeof body.data.googleDrive.available).toBe('boolean');
      expect(typeof body.data.googleCalendar.available).toBe('boolean');
      expect(typeof body.data.canva.available).toBe('boolean');
      expect(typeof body.data.cloudflare.available).toBe('boolean');
      expect(body.data.cloudflare.services).toHaveLength(3);
    });
  });

  describe('Integration endpoints (without API keys)', () => {
    it('POST /api/integrations/notion/search should fail gracefully', async () => {
      const res = await fetch(`${baseUrl}/api/integrations/notion/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'test' }),
      });
      // Should return 500 since Notion is not configured
      expect(res.status).toBe(500);
    });

    it('POST /api/integrations/gdrive/search should fail gracefully', async () => {
      const res = await fetch(`${baseUrl}/api/integrations/gdrive/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'test' }),
      });
      expect(res.status).toBe(500);
    });

    it('POST /api/integrations/notion/search should return 400 without query', async () => {
      const res = await fetch(`${baseUrl}/api/integrations/notion/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it('POST /api/integrations/gdrive/import should return 400 without fileId', async () => {
      const res = await fetch(`${baseUrl}/api/integrations/gdrive/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it('POST /api/integrations/canva/designs should return 400 without title', async () => {
      const res = await fetch(`${baseUrl}/api/integrations/canva/designs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it('POST /api/integrations/gcal/events should return 400 without required fields', async () => {
      const res = await fetch(`${baseUrl}/api/integrations/gcal/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it('POST /api/integrations/cloudflare/d1/query should return 400 without sql', async () => {
      const res = await fetch(`${baseUrl}/api/integrations/cloudflare/d1/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it('POST /api/integrations/cloudflare/kv should return 400 without key/value', async () => {
      const res = await fetch(`${baseUrl}/api/integrations/cloudflare/kv`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it('GET /api/integrations/cloudflare/status should work without API key', async () => {
      const res = await fetch(`${baseUrl}/api/integrations/cloudflare/status`);
      const body = (await res.json()) as {
        success: boolean;
        data: { available: boolean };
      };
      expect(res.status).toBe(200);
      expect(body.data.available).toBe(false);
    });
  });
});
