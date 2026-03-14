import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import matter from 'gray-matter';
import { config } from '../config';
import { Note, NoteFrontmatter, CreateNoteDto, UpdateNoteDto } from '../models/Note';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';

type NoteEventListener = (note: Note) => void | Promise<void>;

export class VaultService {
  private vaultPath: string;
  private inboxPath: string;
  private onChangeListeners: NoteEventListener[] = [];
  private onDeleteListeners: ((noteId: string) => void | Promise<void>)[] = [];

  constructor(vaultPath?: string) {
    this.vaultPath = vaultPath || config.vaultPath;
    this.inboxPath = path.join(this.vaultPath, '.inbox');
  }

  onChange(listener: NoteEventListener): void {
    this.onChangeListeners.push(listener);
  }

  onDelete(listener: (noteId: string) => void | Promise<void>): void {
    this.onDeleteListeners.push(listener);
  }

  private async emitChange(note: Note): Promise<void> {
    for (const listener of this.onChangeListeners) {
      try {
        await listener(note);
      } catch (err) {
        logger.warn('onChange listener error', err);
      }
    }
  }

  private async emitDelete(noteId: string): Promise<void> {
    for (const listener of this.onDeleteListeners) {
      try {
        await listener(noteId);
      } catch (err) {
        logger.warn('onDelete listener error', err);
      }
    }
  }

  async init(): Promise<void> {
    await fs.mkdir(this.vaultPath, { recursive: true });
    await fs.mkdir(this.inboxPath, { recursive: true });
    logger.info(`Vault initialized at ${this.vaultPath}`);
  }

  async create(dto: CreateNoteDto): Promise<Note> {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();

    const frontmatter: NoteFrontmatter = {
      id,
      title: dto.title,
      tags: dto.tags || [],
      created_at: now,
      updated_at: now,
      source: dto.source || 'api',
      status: 'inbox',
      links: [],
    };

    const fileContent = matter.stringify(dto.content, frontmatter);
    const fileName = this.sanitizeFileName(dto.title);
    const filePath = path.join(this.inboxPath, `${fileName}.md`);

    // ตรวจสอบว่าไฟล์ไม่ซ้ำ
    const uniquePath = await this.getUniquePath(filePath);
    await fs.writeFile(uniquePath, fileContent, 'utf-8');

    logger.info(`Note created: ${id} → ${uniquePath}`);

    const note: Note = {
      frontmatter,
      content: dto.content,
      filePath: uniquePath,
    };

    await this.emitChange(note);
    return note;
  }

  async getById(id: string): Promise<Note> {
    const files = await this.getAllMdFiles();

    for (const filePath of files) {
      const note = await this.parseNoteFile(filePath);
      if (note && note.frontmatter.id === id) {
        return note;
      }
    }

    throw new AppError(404, `Note not found: ${id}`);
  }

  async getAll(options?: {
    tag?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ notes: Note[]; total: number }> {
    const files = await this.getAllMdFiles();
    let notes: Note[] = [];

    for (const filePath of files) {
      const note = await this.parseNoteFile(filePath);
      if (note) notes.push(note);
    }

    // เรียงตามวันที่สร้างล่าสุด
    notes.sort(
      (a, b) =>
        new Date(b.frontmatter.created_at).getTime() -
        new Date(a.frontmatter.created_at).getTime(),
    );

    // Filter by tag
    if (options?.tag) {
      notes = notes.filter((n) => n.frontmatter.tags.includes(options.tag!));
    }

    // Filter by status
    if (options?.status) {
      notes = notes.filter((n) => n.frontmatter.status === options.status);
    }

    const total = notes.length;
    const offset = options?.offset || 0;
    const limit = options?.limit || 50;
    notes = notes.slice(offset, offset + limit);

    return { notes, total };
  }

  async update(id: string, dto: UpdateNoteDto): Promise<Note> {
    const existing = await this.getById(id);

    const updatedFrontmatter: NoteFrontmatter = {
      ...existing.frontmatter,
      title: dto.title ?? existing.frontmatter.title,
      tags: dto.tags ?? existing.frontmatter.tags,
      status: dto.status ?? existing.frontmatter.status,
      links: dto.links ?? existing.frontmatter.links,
      updated_at: new Date().toISOString(),
    };

    const updatedContent = dto.content ?? existing.content;
    const fileContent = matter.stringify(updatedContent, updatedFrontmatter);

    // ถ้าชื่อเปลี่ยน → rename ไฟล์
    let newPath = existing.filePath;
    if (dto.title && dto.title !== existing.frontmatter.title) {
      const dir = path.dirname(existing.filePath);
      const newFileName = this.sanitizeFileName(dto.title);
      newPath = path.join(dir, `${newFileName}.md`);
      newPath = await this.getUniquePath(newPath);

      await fs.unlink(existing.filePath);
    }

    await fs.writeFile(newPath, fileContent, 'utf-8');
    logger.info(`Note updated: ${id}`);

    const updatedNote: Note = {
      frontmatter: updatedFrontmatter,
      content: updatedContent,
      filePath: newPath,
    };

    await this.emitChange(updatedNote);
    return updatedNote;
  }

  async delete(id: string): Promise<void> {
    const note = await this.getById(id);
    await fs.unlink(note.filePath);
    logger.info(`Note deleted: ${id} → ${note.filePath}`);
    await this.emitDelete(id);
  }

  async getTags(): Promise<{ tag: string; count: number }[]> {
    const { notes } = await this.getAll({ limit: 10000 });
    const tagMap = new Map<string, number>();

    for (const note of notes) {
      for (const tag of note.frontmatter.tags) {
        tagMap.set(tag, (tagMap.get(tag) || 0) + 1);
      }
    }

    return Array.from(tagMap.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
  }

  // === Private Helpers ===

  private async parseNoteFile(filePath: string): Promise<Note | null> {
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      const { data, content } = matter(raw);

      if (!data.id || !data.title) return null;

      return {
        frontmatter: data as NoteFrontmatter,
        content: content.trim(),
        filePath,
      };
    } catch (err) {
      logger.warn(`Failed to parse note: ${filePath}`, err);
      return null;
    }
  }

  private async getAllMdFiles(dir?: string): Promise<string[]> {
    const targetDir = dir || this.vaultPath;
    const results: string[] = [];

    try {
      const entries = await fs.readdir(targetDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(targetDir, entry.name);

        if (entry.isDirectory() && !entry.name.startsWith('.') || entry.isDirectory() && entry.name === '.inbox') {
          const subFiles = await this.getAllMdFiles(fullPath);
          results.push(...subFiles);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          results.push(fullPath);
        }
      }
    } catch {
      // ถ้า directory ไม่มี ข้ามไป
    }

    return results;
  }

  private sanitizeFileName(title: string): string {
    return title
      .replace(/[<>:"/\\|?*]/g, '')
      .replace(/\s+/g, '-')
      .toLowerCase()
      .substring(0, 100);
  }

  private async getUniquePath(filePath: string): Promise<string> {
    let candidate = filePath;
    let counter = 1;

    while (await this.fileExists(candidate)) {
      const ext = path.extname(filePath);
      const base = filePath.slice(0, -ext.length);
      candidate = `${base}-${counter}${ext}`;
      counter++;
    }

    return candidate;
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

export const vaultService = new VaultService();
