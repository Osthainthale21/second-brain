import * as cron from 'node-cron';
import { dailyDigestAgent } from './daily-digest.agent';
import { autoLinkerAgent } from './auto-linker.agent';
import { inboxOrganizerAgent } from './inbox-organizer.agent';
import { logger } from '../utils/logger';

interface ScheduledJob {
  name: string;
  schedule: string;
  description: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  task: any;
  lastRun: string | null;
  isRunning: boolean;
}

/**
 * AgentScheduler - จัดการ background agents ทั้งหมด
 */
export class AgentScheduler {
  private jobs: Map<string, ScheduledJob> = new Map();
  private enabled = false;

  init(): void {
    // Register all agents with their cron schedules
    this.register('daily-digest', '0 0 * * *', 'สรุป Daily Digest เที่ยงคืนทุกวัน', () =>
      dailyDigestAgent.run(),
    );

    this.register('auto-linker', '0 */6 * * *', 'หา links อัตโนมัติทุก 6 ชม.', () =>
      autoLinkerAgent.run(),
    );

    this.register('inbox-organizer', '0 * * * *', 'จัดระเบียบ inbox ทุก 1 ชม.', () =>
      inboxOrganizerAgent.run(),
    );

    this.enabled = true;
    logger.info(`[Scheduler] ${this.jobs.size} agents registered and running`);
  }

  private register(
    name: string,
    schedule: string,
    description: string,
    fn: () => Promise<void>,
  ): void {
    const job: ScheduledJob = {
      name,
      schedule,
      description,
      task: null,
      lastRun: null,
      isRunning: false,
    };

    job.task = cron.schedule(schedule, async () => {
      if (job.isRunning) {
        logger.warn(`[Scheduler] ${name} is still running, skipping`);
        return;
      }

      job.isRunning = true;
      try {
        await fn();
        job.lastRun = new Date().toISOString();
      } catch (err) {
        logger.error(`[Scheduler] ${name} failed`, err);
      } finally {
        job.isRunning = false;
      }
    });

    this.jobs.set(name, job);
    logger.info(`[Scheduler] Registered: ${name} (${schedule}) - ${description}`);
  }

  /**
   * รัน agent ด้วยมือ (ไม่ต้องรอ cron)
   */
  async runNow(agentName: string): Promise<{ success: boolean; message: string }> {
    const job = this.jobs.get(agentName);
    if (!job) {
      return { success: false, message: `Agent "${agentName}" not found` };
    }

    if (job.isRunning) {
      return { success: false, message: `Agent "${agentName}" is already running` };
    }

    job.isRunning = true;
    try {
      switch (agentName) {
        case 'daily-digest':
          await dailyDigestAgent.run();
          break;
        case 'auto-linker':
          await autoLinkerAgent.run();
          break;
        case 'inbox-organizer':
          await inboxOrganizerAgent.run();
          break;
        default:
          return { success: false, message: `Unknown agent: ${agentName}` };
      }
      job.lastRun = new Date().toISOString();
      return { success: true, message: `Agent "${agentName}" completed` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      return { success: false, message: `Agent "${agentName}" failed: ${msg}` };
    } finally {
      job.isRunning = false;
    }
  }

  /**
   * ดูสถานะ agents ทั้งหมด
   */
  getStatus(): {
    enabled: boolean;
    agents: {
      name: string;
      schedule: string;
      description: string;
      lastRun: string | null;
      isRunning: boolean;
    }[];
  } {
    const agents = Array.from(this.jobs.values()).map((j) => ({
      name: j.name,
      schedule: j.schedule,
      description: j.description,
      lastRun: j.lastRun,
      isRunning: j.isRunning,
    }));

    return { enabled: this.enabled, agents };
  }

  stop(): void {
    for (const [name, job] of this.jobs) {
      if (job.task) {
        job.task.stop();
        logger.info(`[Scheduler] Stopped: ${name}`);
      }
    }
    this.enabled = false;
  }
}

export const agentScheduler = new AgentScheduler();
