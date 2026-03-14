import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { VaultService, vaultService } from '../services/vault.service';
import { RAGService } from '../services/rag.service';

describe('RAGService - Fallback Search (without ChromaDB)', () => {
  let service: RAGService;
  let vault: VaultService;
  let testVaultPath: string;

  beforeAll(async () => {
    testVaultPath = path.join(os.tmpdir(), `vault-rag-test-${Date.now()}`);
    vault = new VaultService(testVaultPath);
    await vault.init();
    Object.assign(vaultService, vault);

    service = new RAGService();

    // Seed notes
    await vault.create({
      title: 'Introduction to Machine Learning',
      content:
        'Machine learning is a subset of artificial intelligence that enables systems to learn from data. Key concepts include supervised learning, unsupervised learning, and reinforcement learning.',
      tags: ['ai', 'ml', 'tutorial'],
    });
    await vault.create({
      title: 'TypeScript Best Practices',
      content:
        'TypeScript adds static typing to JavaScript. Use strict mode, avoid any type, prefer interfaces over type aliases for object shapes, and leverage generics for reusable code.',
      tags: ['typescript', 'programming'],
    });
    await vault.create({
      title: 'Neural Networks Deep Dive',
      content:
        'Neural networks are composed of layers of neurons. Deep learning uses multiple hidden layers to learn complex patterns. CNNs excel at image recognition while RNNs handle sequential data.',
      tags: ['ai', 'deep-learning', 'neural-networks'],
    });
    await vault.create({
      title: 'Docker and Containers',
      content:
        'Docker containers package applications with their dependencies. Key commands: docker build, docker run, docker-compose. Containers are lightweight alternatives to virtual machines.',
      tags: ['devops', 'docker'],
    });
    await vault.create({
      title: 'AI Ethics and Responsible Development',
      content:
        'AI systems must be developed responsibly. Key considerations: bias in training data, transparency, accountability, and fairness. Machine learning models can perpetuate societal biases.',
      tags: ['ai', 'ethics'],
    });
  });

  afterAll(async () => {
    await fs.rm(testVaultPath, { recursive: true, force: true });
  });

  describe('search', () => {
    it('should find notes matching query terms', async () => {
      const results = await service.search('machine learning');

      expect(results.length).toBeGreaterThan(0);
      // Top result should be ML-related
      const titles = results.map((r) => r.note.frontmatter.title);
      expect(titles).toContain('Introduction to Machine Learning');
    });

    it('should rank exact phrase matches higher', async () => {
      const results = await service.search('machine learning');

      // "Introduction to Machine Learning" should score higher than "AI Ethics" even though
      // both mention machine learning, because the title contains the exact phrase
      const mlNote = results.find(
        (r) => r.note.frontmatter.title === 'Introduction to Machine Learning',
      );
      const ethicsNote = results.find(
        (r) => r.note.frontmatter.title === 'AI Ethics and Responsible Development',
      );

      expect(mlNote).toBeDefined();
      expect(ethicsNote).toBeDefined();
      expect(mlNote!.score).toBeGreaterThan(ethicsNote!.score);
    });

    it('should return empty for unrelated queries', async () => {
      const results = await service.search('quantum physics black holes');
      expect(results.length).toBe(0);
    });

    it('should respect limit parameter', async () => {
      const results = await service.search('ai', { limit: 2 });
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should find notes by tag matches', async () => {
      const results = await service.search('typescript programming');

      expect(results.length).toBeGreaterThan(0);
      const found = results.find(
        (r) => r.note.frontmatter.title === 'TypeScript Best Practices',
      );
      expect(found).toBeDefined();
    });
  });

  describe('search result structure', () => {
    it('should return proper SearchResult shape', async () => {
      const results = await service.search('docker');

      expect(results.length).toBeGreaterThan(0);
      const result = results[0];

      expect(result.note).toBeDefined();
      expect(result.note.frontmatter.id).toBeDefined();
      expect(result.note.frontmatter.title).toBeDefined();
      expect(result.note.content).toBeDefined();
      expect(typeof result.score).toBe('number');
      expect(result.score).toBeGreaterThan(0);
      expect(result.source).toBe('vector');
    });
  });
});
