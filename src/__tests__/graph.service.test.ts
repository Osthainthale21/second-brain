import { GraphService } from '../services/graph.service';

describe('GraphService', () => {
  let service: GraphService;

  beforeAll(() => {
    service = new GraphService();
    // Don't init - Neo4j is not available in tests
  });

  describe('when Neo4j is not available', () => {
    it('isAvailable should return false', () => {
      expect(service.isAvailable()).toBe(false);
    });

    it('getNeighbors should return empty array', async () => {
      const result = await service.getNeighbors('test-id');
      expect(result).toEqual([]);
    });

    it('getMap should return empty graph', async () => {
      const result = await service.getMap();
      expect(result).toEqual({ nodes: [], edges: [] });
    });

    it('findByTags should return empty array', async () => {
      const result = await service.findByTags(['ai']);
      expect(result).toEqual([]);
    });

    it('getStats should return zeros', async () => {
      const result = await service.getStats();
      expect(result).toEqual({
        noteCount: 0,
        tagCount: 0,
        topicCount: 0,
        relationshipCount: 0,
      });
    });

    it('upsertNote should not throw', async () => {
      await expect(
        service.upsertNote({
          frontmatter: {
            id: 'test',
            title: 'Test',
            tags: ['test'],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          content: 'Test content',
          filePath: '/tmp/test.md',
        }),
      ).resolves.toBeUndefined();
    });

    it('deleteNote should not throw', async () => {
      await expect(service.deleteNote('test')).resolves.toBeUndefined();
    });

    it('addRelationship should not throw', async () => {
      await expect(
        service.addRelationship('a', 'b', 'RELATED_TO'),
      ).resolves.toBeUndefined();
    });

    it('addTopic should not throw', async () => {
      await expect(service.addTopic('test', 'ai')).resolves.toBeUndefined();
    });
  });

  describe('extractWikiLinks (via upsertNote behavior)', () => {
    // Testing indirectly through the service's graceful degradation
    it('should handle notes with [[wiki-links]] gracefully when offline', async () => {
      await expect(
        service.upsertNote({
          frontmatter: {
            id: 'wiki-test',
            title: 'Test Wiki Links',
            tags: ['test'],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          content: 'This links to [[Another Note]] and [[Yet Another]]',
          filePath: '/tmp/test.md',
        }),
      ).resolves.toBeUndefined();
    });
  });
});

describe('GraphService - Graph API routes', () => {
  let server: import('http').Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = (await import('../app')).default;
    server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Invalid');
    baseUrl = `http://localhost:${address.port}`;
  });

  afterAll(() => {
    server.close();
  });

  it('GET /api/graph/stats should return stats', async () => {
    const res = await fetch(`${baseUrl}/api/graph/stats`);
    const body = (await res.json()) as {
      success: boolean;
      data: { noteCount: number; tagCount: number };
    };

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(typeof body.data.noteCount).toBe('number');
    expect(typeof body.data.tagCount).toBe('number');
  });

  it('GET /api/graph/neighbors/:id should return 503 when Neo4j is unavailable', async () => {
    const res = await fetch(`${baseUrl}/api/graph/neighbors/fake-id`);
    expect(res.status).toBe(503);
  });

  it('GET /api/graph/map should return 503 when Neo4j is unavailable', async () => {
    const res = await fetch(`${baseUrl}/api/graph/map`);
    expect(res.status).toBe(503);
  });

  it('POST /api/graph/find-by-tags should validate input', async () => {
    const res = await fetch(`${baseUrl}/api/graph/find-by-tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });

  it('POST /api/graph/relationship should validate input', async () => {
    const res = await fetch(`${baseUrl}/api/graph/relationship`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });
});
