import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import http from 'http';
import app from '../app';
import { VaultService, vaultService } from '../services/vault.service';

describe('Ingest API', () => {
  let server: http.Server;
  let baseUrl: string;
  let testVaultPath: string;

  beforeAll(async () => {
    testVaultPath = path.join(os.tmpdir(), `vault-ingest-test-${Date.now()}`);
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

  describe('POST /api/ingest/text', () => {
    it('should create a note from text', async () => {
      const res = await fetch(`${baseUrl}/api/ingest/text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'This is a test note from the ingest API',
          title: 'Ingest Test Note',
          tags: ['test', 'ingest'],
          autoTag: false,
        }),
      });

      const body = (await res.json()) as {
        success: boolean;
        data: { frontmatter: { title: string; tags: string[] } };
      };

      expect(res.status).toBe(201);
      expect(body.success).toBe(true);
      expect(body.data.frontmatter.title).toBe('Ingest Test Note');
      expect(body.data.frontmatter.tags).toContain('test');
    });

    it('should auto-generate title from first line if not provided', async () => {
      const res = await fetch(`${baseUrl}/api/ingest/text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'First line becomes the title\nSecond line is content',
          autoTag: false,
        }),
      });

      const body = (await res.json()) as {
        success: boolean;
        data: { frontmatter: { title: string } };
      };

      expect(res.status).toBe(201);
      expect(body.data.frontmatter.title).toBe('First line becomes the title');
    });

    it('should return 400 if text is missing', async () => {
      const res = await fetch(`${baseUrl}/api/ingest/text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/ingest/url', () => {
    it('should scrape and create note from URL (requires network)', async () => {
      // Check network availability first
      try {
        await fetch('https://example.com', { signal: AbortSignal.timeout(5000) });
      } catch {
        return; // skip gracefully
      }

      const res = await fetch(`${baseUrl}/api/ingest/url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: 'https://example.com',
          tags: ['web-test'],
        }),
      });

      const body = (await res.json()) as {
        success: boolean;
        data: {
          note: { frontmatter: { title: string; tags: string[] } };
          scraped: { title: string; contentLength: number };
        };
      };

      expect(res.status).toBe(201);
      expect(body.success).toBe(true);
      expect(body.data.note.frontmatter.tags).toContain('web-test');
      expect(body.data.scraped.contentLength).toBeGreaterThan(0);
    }, 15000);

    it('should return 400 if url is missing', async () => {
      const res = await fetch(`${baseUrl}/api/ingest/url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/ingest/voice', () => {
    it('should return 503 if Whisper is not configured', async () => {
      const res = await fetch(`${baseUrl}/api/ingest/voice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileUrl: 'https://example.com/audio.ogg' }),
      });

      // Should be 503 since OPENAI_API_KEY is not set in test
      expect(res.status).toBe(503);
    });

    it('should return 400 if fileUrl is missing', async () => {
      const res = await fetch(`${baseUrl}/api/ingest/voice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
    });
  });
});
