import { vaultService } from '../services/vault.service';
import { llmService } from '../services/llm.service';
import { Note, UpdateNoteDto } from '../models/Note';
import { logger } from '../utils/logger';

/**
 * InboxOrganizerAgent - จัดระเบียบโน้ตใน inbox อัตโนมัติ
 * ทำงาน: ทุก 1 ชั่วโมง (cron: 0 * * * *)
 *
 * ขั้นตอน:
 * 1. ดึงโน้ตที่ status = 'inbox'
 * 2. Auto-tag โน้ตที่ยังไม่มี tags
 * 3. จัดหมวดหมู่ (assign status: processed)
 * 4. สร้าง title ที่ดีขึ้นถ้า title ยาวเกินไปหรือสั้นเกินไป
 */
export class InboxOrganizerAgent {
  async run(): Promise<void> {
    const startTime = Date.now();
    logger.info('[InboxOrganizer] Starting...');

    try {
      const inboxNotes = await this.getInboxNotes();

      if (inboxNotes.length === 0) {
        logger.info('[InboxOrganizer] Inbox empty, skipping');
        return;
      }

      let organized = 0;

      for (const note of inboxNotes) {
        const wasOrganized = await this.organizeNote(note);
        if (wasOrganized) organized++;
      }

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      logger.info(`[InboxOrganizer] Done: ${organized}/${inboxNotes.length} notes organized in ${elapsed}s`);
    } catch (err) {
      logger.error('[InboxOrganizer] Failed', err);
    }
  }

  private async getInboxNotes() {
    const { notes } = await vaultService.getAll({ status: 'inbox', limit: 50 });
    return notes;
  }

  private async organizeNote(note: Note): Promise<boolean> {
    const updates: UpdateNoteDto = {};
    let changed = false;

    // 1. Auto-tag if no meaningful tags
    if (this.needsTagging(note.frontmatter.tags)) {
      try {
        const newTags = await llmService.generateTags(note.content, note.frontmatter.title);
        const existingTags = note.frontmatter.tags.filter(
          (t) => t !== 'inbox' && t !== 'untagged',
        );
        updates.tags = [...new Set([...existingTags, ...newTags])];
        changed = true;
      } catch {
        logger.warn(`[InboxOrganizer] Auto-tag failed for ${note.frontmatter.id}`);
      }
    }

    // 2. Improve title if too long or too short
    if (this.needsTitleImprovement(note.frontmatter.title)) {
      try {
        const betterTitle = await this.improveTitle(note.frontmatter.title, note.content);
        if (betterTitle && betterTitle !== note.frontmatter.title) {
          updates.title = betterTitle;
          changed = true;
        }
      } catch {
        logger.warn(`[InboxOrganizer] Title improvement failed for ${note.frontmatter.id}`);
      }
    }

    // 3. Mark as processed
    updates.status = 'processed';
    changed = true;

    if (changed) {
      await vaultService.update(note.frontmatter.id, updates);
      logger.info(
        `[InboxOrganizer] Organized: "${note.frontmatter.title}" → tags: [${(updates.tags || note.frontmatter.tags).join(', ')}]`,
      );
    }

    return changed;
  }

  private needsTagging(tags: string[]): boolean {
    const meaningfulTags = tags.filter(
      (t) => !['inbox', 'untagged', 'telegram', 'api', 'voice', 'web'].includes(t),
    );
    return meaningfulTags.length < 2;
  }

  private needsTitleImprovement(title: string): boolean {
    return title.length > 80 || title.length < 5;
  }

  private async improveTitle(currentTitle: string, content: string): Promise<string> {
    const prompt = `Given this note title and content, suggest a better, concise title (10-60 characters).
Return ONLY the new title text, nothing else.

Current title: "${currentTitle}"
Content: ${content.substring(0, 500)}`;

    const result = await llmService.chat(
      'You are a title editor. Return only the improved title, no quotes, no explanation.',
      prompt,
      { maxTokens: 100 },
    );

    return result.trim().replace(/^["']|["']$/g, ''); // Remove quotes if any
  }
}

export const inboxOrganizerAgent = new InboxOrganizerAgent();
