import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { VaultService } from '../services/vault.service';

describe('VaultService', () => {
  let service: VaultService;
  let testVaultPath: string;

  beforeEach(async () => {
    testVaultPath = path.join(os.tmpdir(), `vault-test-${Date.now()}`);
    service = new VaultService(testVaultPath);
    await service.init();
  });

  afterEach(async () => {
    await fs.rm(testVaultPath, { recursive: true, force: true });
  });

  describe('create', () => {
    it('should create a note with frontmatter', async () => {
      const note = await service.create({
        title: 'Test Note',
        content: 'This is test content',
        tags: ['test', 'unit'],
      });

      expect(note.frontmatter.id).toBeDefined();
      expect(note.frontmatter.title).toBe('Test Note');
      expect(note.frontmatter.tags).toEqual(['test', 'unit']);
      expect(note.frontmatter.status).toBe('inbox');
      expect(note.frontmatter.source).toBe('api');
      expect(note.content).toBe('This is test content');
      expect(note.filePath).toContain('.md');
    });

    it('should create file on disk', async () => {
      const note = await service.create({
        title: 'Disk Note',
        content: 'Check disk',
      });

      const raw = await fs.readFile(note.filePath, 'utf-8');
      expect(raw).toContain('Disk Note');
      expect(raw).toContain('Check disk');
    });

    it('should handle duplicate file names', async () => {
      const note1 = await service.create({ title: 'Same Title', content: 'First' });
      const note2 = await service.create({ title: 'Same Title', content: 'Second' });

      expect(note1.filePath).not.toBe(note2.filePath);
      expect(note2.filePath).toContain('same-title-1.md');
    });

    it('should sanitize special characters in file names', async () => {
      const note = await service.create({
        title: 'Test: With <Special> "Chars"',
        content: 'Content',
      });

      const fileName = path.basename(note.filePath);
      expect(fileName).not.toContain(':');
      expect(fileName).not.toContain('<');
      expect(fileName).not.toContain('>');
      expect(fileName).not.toContain('"');
    });
  });

  describe('getById', () => {
    it('should retrieve a note by ID', async () => {
      const created = await service.create({
        title: 'Find Me',
        content: 'Hidden content',
        tags: ['findable'],
      });

      const found = await service.getById(created.frontmatter.id);

      expect(found.frontmatter.id).toBe(created.frontmatter.id);
      expect(found.frontmatter.title).toBe('Find Me');
      expect(found.content).toBe('Hidden content');
    });

    it('should throw 404 for non-existent ID', async () => {
      await expect(service.getById('non-existent-id')).rejects.toThrow('Note not found');
    });
  });

  describe('getAll', () => {
    it('should return all notes sorted by date (newest first)', async () => {
      await service.create({ title: 'First', content: 'A' });
      await service.create({ title: 'Second', content: 'B' });
      await service.create({ title: 'Third', content: 'C' });

      const result = await service.getAll();

      expect(result.notes).toHaveLength(3);
      expect(result.total).toBe(3);
      // newest first
      expect(result.notes[0].frontmatter.title).toBe('Third');
    });

    it('should filter by tag', async () => {
      await service.create({ title: 'Tagged', content: 'A', tags: ['important'] });
      await service.create({ title: 'Not Tagged', content: 'B', tags: ['other'] });

      const result = await service.getAll({ tag: 'important' });

      expect(result.notes).toHaveLength(1);
      expect(result.notes[0].frontmatter.title).toBe('Tagged');
    });

    it('should filter by status', async () => {
      const note = await service.create({ title: 'Inbox Note', content: 'A' });
      await service.update(note.frontmatter.id, { status: 'evergreen' });
      await service.create({ title: 'Still Inbox', content: 'B' });

      const result = await service.getAll({ status: 'evergreen' });

      expect(result.notes).toHaveLength(1);
      expect(result.notes[0].frontmatter.title).toBe('Inbox Note');
    });

    it('should support pagination', async () => {
      for (let i = 0; i < 5; i++) {
        await service.create({ title: `Note ${i}`, content: `Content ${i}` });
      }

      const page1 = await service.getAll({ limit: 2, offset: 0 });
      const page2 = await service.getAll({ limit: 2, offset: 2 });

      expect(page1.notes).toHaveLength(2);
      expect(page2.notes).toHaveLength(2);
      expect(page1.total).toBe(5);
    });
  });

  describe('update', () => {
    it('should update note content', async () => {
      const note = await service.create({ title: 'Original', content: 'Old content' });
      const updated = await service.update(note.frontmatter.id, { content: 'New content' });

      expect(updated.content).toBe('New content');
      expect(updated.frontmatter.title).toBe('Original');
      expect(new Date(updated.frontmatter.updated_at).getTime()).toBeGreaterThanOrEqual(
        new Date(note.frontmatter.updated_at).getTime(),
      );
    });

    it('should update tags', async () => {
      const note = await service.create({ title: 'Tags Test', content: 'C', tags: ['old'] });
      const updated = await service.update(note.frontmatter.id, { tags: ['new', 'updated'] });

      expect(updated.frontmatter.tags).toEqual(['new', 'updated']);
    });

    it('should update status', async () => {
      const note = await service.create({ title: 'Status Test', content: 'C' });
      const updated = await service.update(note.frontmatter.id, { status: 'processed' });

      expect(updated.frontmatter.status).toBe('processed');
    });

    it('should rename file when title changes', async () => {
      const note = await service.create({ title: 'Old Title', content: 'C' });
      const updated = await service.update(note.frontmatter.id, { title: 'New Title' });

      expect(updated.filePath).toContain('new-title');
      expect(updated.frontmatter.title).toBe('New Title');
    });
  });

  describe('delete', () => {
    it('should delete a note from disk', async () => {
      const note = await service.create({ title: 'Delete Me', content: 'Goodbye' });
      await service.delete(note.frontmatter.id);

      await expect(service.getById(note.frontmatter.id)).rejects.toThrow('Note not found');
    });

    it('should throw 404 when deleting non-existent note', async () => {
      await expect(service.delete('non-existent')).rejects.toThrow('Note not found');
    });
  });

  describe('getTags', () => {
    it('should return tag counts sorted by frequency', async () => {
      await service.create({ title: 'A', content: 'C', tags: ['ai', 'ml'] });
      await service.create({ title: 'B', content: 'C', tags: ['ai', 'web'] });
      await service.create({ title: 'C', content: 'C', tags: ['ai'] });

      const tags = await service.getTags();

      expect(tags[0]).toEqual({ tag: 'ai', count: 3 });
      expect(tags).toContainEqual({ tag: 'ml', count: 1 });
      expect(tags).toContainEqual({ tag: 'web', count: 1 });
    });
  });
});
