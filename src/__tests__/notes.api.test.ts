import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import http from 'http';
import app from '../app';
import { VaultService, vaultService } from '../services/vault.service';

describe('Notes API', () => {
  let server: http.Server;
  let baseUrl: string;
  let testVaultPath: string;

  beforeAll(async () => {
    testVaultPath = path.join(os.tmpdir(), `vault-api-test-${Date.now()}`);
    // Override vault path for testing
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

  describe('POST /api/notes', () => {
    it('should create a note and return 201', async () => {
      const res = await fetch(`${baseUrl}/api/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'API Test Note',
          content: 'Created via API',
          tags: ['api', 'test'],
        }),
      });

      const body = (await res.json()) as {
        success: boolean;
        data: { frontmatter: { id: string; title: string; tags: string[] }; content: string };
      };

      expect(res.status).toBe(201);
      expect(body.success).toBe(true);
      expect(body.data.frontmatter.title).toBe('API Test Note');
      expect(body.data.frontmatter.tags).toEqual(['api', 'test']);
      expect(body.data.content).toBe('Created via API');
    });

    it('should return 400 if title is missing', async () => {
      const res = await fetch(`${baseUrl}/api/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'No title' }),
      });

      expect(res.status).toBe(400);
    });

    it('should return 400 if content is missing', async () => {
      const res = await fetch(`${baseUrl}/api/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'No content' }),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/notes', () => {
    it('should return all notes', async () => {
      const res = await fetch(`${baseUrl}/api/notes`);
      const body = (await res.json()) as {
        success: boolean;
        data: unknown[];
        meta: { total: number };
      };

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.meta.total).toBeGreaterThan(0);
    });

    it('should filter by tag', async () => {
      await fetch(`${baseUrl}/api/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Unique Tag Note', content: 'C', tags: ['unique-filter'] }),
      });

      const res = await fetch(`${baseUrl}/api/notes?tag=unique-filter`);
      const body = (await res.json()) as {
        data: { frontmatter: { tags: string[] } }[];
      };

      expect(res.status).toBe(200);
      expect(body.data.length).toBeGreaterThan(0);
      expect(body.data.every((n) => n.frontmatter.tags.includes('unique-filter'))).toBe(true);
    });
  });

  describe('GET /api/notes/:id', () => {
    it('should return a single note', async () => {
      const createRes = await fetch(`${baseUrl}/api/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Get By ID', content: 'Find me' }),
      });
      const created = (await createRes.json()) as {
        data: { frontmatter: { id: string } };
      };
      const id = created.data.frontmatter.id;

      const res = await fetch(`${baseUrl}/api/notes/${id}`);
      const body = (await res.json()) as {
        success: boolean;
        data: { frontmatter: { id: string; title: string } };
      };

      expect(res.status).toBe(200);
      expect(body.data.frontmatter.id).toBe(id);
      expect(body.data.frontmatter.title).toBe('Get By ID');
    });

    it('should return 404 for non-existent note', async () => {
      const res = await fetch(`${baseUrl}/api/notes/non-existent-id`);
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/notes/:id', () => {
    it('should update a note', async () => {
      const createRes = await fetch(`${baseUrl}/api/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Update Me', content: 'Old' }),
      });
      const created = (await createRes.json()) as {
        data: { frontmatter: { id: string } };
      };
      const id = created.data.frontmatter.id;

      const res = await fetch(`${baseUrl}/api/notes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Updated content', tags: ['updated'] }),
      });
      const body = (await res.json()) as {
        success: boolean;
        data: { frontmatter: { tags: string[] }; content: string };
      };

      expect(res.status).toBe(200);
      expect(body.data.content).toBe('Updated content');
      expect(body.data.frontmatter.tags).toEqual(['updated']);
    });
  });

  describe('DELETE /api/notes/:id', () => {
    it('should delete a note', async () => {
      const createRes = await fetch(`${baseUrl}/api/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Delete Me', content: 'Bye' }),
      });
      const created = (await createRes.json()) as {
        data: { frontmatter: { id: string } };
      };
      const id = created.data.frontmatter.id;

      const res = await fetch(`${baseUrl}/api/notes/${id}`, { method: 'DELETE' });
      const body = (await res.json()) as { success: boolean };

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);

      // Verify it's gone
      const getRes = await fetch(`${baseUrl}/api/notes/${id}`);
      expect(getRes.status).toBe(404);
    });
  });

  describe('GET /api/notes/tags', () => {
    it('should return tag counts', async () => {
      const res = await fetch(`${baseUrl}/api/notes/tags`);
      const body = (await res.json()) as {
        success: boolean;
        data: { tag: string; count: number }[];
      };

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
    });
  });
});
