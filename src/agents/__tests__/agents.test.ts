import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { VaultService, vaultService } from '../../services/vault.service';
import { DailyDigestAgent } from '../daily-digest.agent';
import { AutoLinkerAgent } from '../auto-linker.agent';
import { InboxOrganizerAgent } from '../inbox-organizer.agent';
import { AgentScheduler } from '../scheduler';

describe('Autonomous Agents', () => {
  let vault: VaultService;
  let testVaultPath: string;

  beforeAll(async () => {
    testVaultPath = path.join(os.tmpdir(), `vault-agents-test-${Date.now()}`);
    vault = new VaultService(testVaultPath);
    await vault.init();
    Object.assign(vaultService, vault);
  });

  afterAll(async () => {
    await fs.rm(testVaultPath, { recursive: true, force: true });
  });

  describe('DailyDigestAgent', () => {
    it('should skip when no notes exist', async () => {
      const agent = new DailyDigestAgent();
      // Should not throw
      await agent.run();
    });

    it('should generate digest when notes exist', async () => {
      await vault.create({
        title: 'Test Note for Digest',
        content: 'Learning about TypeScript generics today',
        tags: ['typescript', 'learning'],
      });

      const agent = new DailyDigestAgent();
      await agent.run();

      // Check if digest note was created (will use fallback since no LLM)
      const { notes } = await vault.getAll({ limit: 100 });
      const digest = notes.find((n) => n.frontmatter.tags.includes('daily-digest'));
      expect(digest).toBeDefined();
      expect(digest!.frontmatter.title).toContain('Daily Digest');
    });
  });

  describe('AutoLinkerAgent', () => {
    it('should run without errors', async () => {
      await vault.create({
        title: 'AI Basics',
        content: 'Introduction to artificial intelligence',
        tags: ['ai', 'tutorial'],
      });
      await vault.create({
        title: 'ML Fundamentals',
        content: 'Machine learning is a subset of AI',
        tags: ['ai', 'ml'],
      });

      const agent = new AutoLinkerAgent();
      await agent.run();
      // Should not throw even without ChromaDB
    });
  });

  describe('InboxOrganizerAgent', () => {
    it('should run without errors on inbox notes', async () => {
      await vault.create({
        title: 'Inbox Note',
        content: 'This is a raw note in inbox',
        tags: [],
      });

      const agent = new InboxOrganizerAgent();
      await agent.run();
      // Should process without errors (will use fallback since no LLM)
    });
  });

  describe('AgentScheduler', () => {
    let scheduler: AgentScheduler;

    afterEach(() => {
      if (scheduler) scheduler.stop();
    });

    it('should register all agents', () => {
      scheduler = new AgentScheduler();
      scheduler.init();

      const status = scheduler.getStatus();
      expect(status.enabled).toBe(true);
      expect(status.agents).toHaveLength(3);

      const names = status.agents.map((a) => a.name);
      expect(names).toContain('daily-digest');
      expect(names).toContain('auto-linker');
      expect(names).toContain('inbox-organizer');
    });

    it('should return status for all agents', () => {
      scheduler = new AgentScheduler();
      scheduler.init();

      const status = scheduler.getStatus();
      for (const agent of status.agents) {
        expect(agent.name).toBeDefined();
        expect(agent.schedule).toBeDefined();
        expect(agent.description).toBeDefined();
        expect(agent.isRunning).toBe(false);
        expect(agent.lastRun).toBeNull();
      }
    });

    it('should run agent manually via runNow', async () => {
      scheduler = new AgentScheduler();
      scheduler.init();

      const result = await scheduler.runNow('daily-digest');
      expect(result.success).toBe(true);
      expect(result.message).toContain('completed');
    });

    it('should return error for unknown agent', async () => {
      scheduler = new AgentScheduler();
      scheduler.init();

      const result = await scheduler.runNow('non-existent');
      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });
  });
});
