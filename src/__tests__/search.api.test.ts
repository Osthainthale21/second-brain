import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import http from 'http';
import app from '../app';
import { VaultService, vaultService } from '../services/vault.service';

describe('Search API', () => {
  let server: http.Server;
  let baseUrl: string;
  let testVaultPath: string;

  beforeAll(async () => {
    testVaultPath = path.join(os.tmpdir(), `vault-search-api-${Date.now()}`);
    const testService = new VaultService(testVaultPath);
    await testService.init();
    Object.assign(vaultService, testService);

    // Seed data
    await testService.create({
      title: 'React Hooks Guide',
      content: 'useState, useEffect, useContext are fundamental React hooks for managing state and side effects.',
      tags: ['react', 'frontend'],
    });
    await testService.create({
      title: 'Node.js Streams',
      content: 'Streams in Node.js allow processing data piece by piece without loading everything into memory.',
      tags: ['nodejs', 'backend'],
    });

    server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Invalid address');
    baseUrl = `http://localhost:${address.port}`;
  });

  afterAll(async () => {
    server.close();
    await fs.rm(testVaultPath, { recursive: true, force: true });
  });

  describe('POST /api/search', () => {
    it('should search notes by query', async () => {
      const res = await fetch(`${baseUrl}/api/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'react hooks' }),
      });

      const body = (await res.json()) as {
        success: boolean;
        data: { note: { frontmatter: { title: string } }; score: number }[];
        meta: { query: string; count: number };
      };

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.length).toBeGreaterThan(0);
      expect(body.meta.query).toBe('react hooks');

      const titles = body.data.map((r) => r.note.frontmatter.title);
      expect(titles).toContain('React Hooks Guide');
    });

    it('should return 400 if query is missing', async () => {
      const res = await fetch(`${baseUrl}/api/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
    });

    it('should return empty array for non-matching query', async () => {
      const res = await fetch(`${baseUrl}/api/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'quantum computing entanglement' }),
      });

      const body = (await res.json()) as {
        data: unknown[];
      };

      expect(res.status).toBe(200);
      expect(body.data).toHaveLength(0);
    });
  });

  describe('GET /api/search/status', () => {
    it('should return search engine status', async () => {
      const res = await fetch(`${baseUrl}/api/search/status`);
      const body = (await res.json()) as {
        success: boolean;
        data: { chromadb: { available: boolean; embeddedNotes: number } };
      };

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(typeof body.data.chromadb.available).toBe('boolean');
      expect(typeof body.data.chromadb.embeddedNotes).toBe('number');
    });
  });
});
