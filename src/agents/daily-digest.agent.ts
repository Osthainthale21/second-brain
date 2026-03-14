import { vaultService } from '../services/vault.service';
import { llmService } from '../services/llm.service';
import { logger } from '../utils/logger';

/**
 * DailyDigestAgent - สรุปสิ่งที่เรียนรู้ในแต่ละวันเป็น 1 โน้ต
 * ทำงาน: เที่ยงคืนทุกวัน (cron: 0 0 * * *)
 *
 * ขั้นตอน:
 * 1. ดึงโน้ตที่สร้าง/แก้ไขวันนี้
 * 2. ส่งให้ LLM สรุปเป็น Daily Digest
 * 3. สร้างโน้ตสรุปวันใหม่ใน vault
 */
export class DailyDigestAgent {
  async run(): Promise<void> {
    const startTime = Date.now();
    logger.info('[DailyDigest] Starting...');

    try {
      // 1. ดึงโน้ตวันนี้
      const todayNotes = await this.getTodaysNotes();

      if (todayNotes.length === 0) {
        logger.info('[DailyDigest] No notes created today, skipping');
        return;
      }

      // 2. สรุปด้วย LLM
      const digest = await this.generateDigest(todayNotes);

      // 3. สร้างโน้ตสรุป
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      await vaultService.create({
        title: `Daily Digest - ${today}`,
        content: digest,
        tags: ['daily-digest', 'auto-generated'],
        source: 'agent',
      });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      logger.info(`[DailyDigest] Done: ${todayNotes.length} notes summarized in ${elapsed}s`);
    } catch (err) {
      logger.error('[DailyDigest] Failed', err);
    }
  }

  private async getTodaysNotes() {
    const { notes } = await vaultService.getAll({ limit: 10000 });
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    return notes.filter((n) => {
      const created = new Date(n.frontmatter.created_at);
      const updated = new Date(n.frontmatter.updated_at);
      return (
        (created >= todayStart || updated >= todayStart) &&
        !n.frontmatter.tags.includes('daily-digest') // ไม่รวม digest เก่า
      );
    });
  }

  private async generateDigest(
    notes: { frontmatter: { title: string; tags: string[] }; content: string }[],
  ): Promise<string> {
    const notesSummary = notes
      .map((n, i) => {
        const tags = n.frontmatter.tags.map((t) => `#${t}`).join(' ');
        return `${i + 1}. "${n.frontmatter.title}" ${tags}\n${n.content.substring(0, 500)}`;
      })
      .join('\n\n---\n\n');

    const prompt = `You are summarizing today's knowledge capture. Create a structured daily digest in Markdown:

## 📊 Stats
- Notes count, topics covered

## 🔑 Key Insights
- Most important takeaways (3-5 bullet points)

## 🔗 Connections
- How today's notes relate to each other

## 💡 Action Items
- Any follow-ups or things to explore further

Today's notes:
${notesSummary}`;

    try {
      return await llmService.chat(
        'You are a personal knowledge management assistant. Create insightful daily digests in Markdown. Use Thai language for the summary if most notes are in Thai.',
        prompt,
        { maxTokens: 2048 },
      );
    } catch {
      // Fallback: simple list
      const lines = notes.map((n) => `- **${n.frontmatter.title}** (${n.frontmatter.tags.join(', ')})`);
      return `## Daily Digest\n\n${lines.join('\n')}\n\n_Auto-generated (LLM unavailable)_`;
    }
  }
}

export const dailyDigestAgent = new DailyDigestAgent();
