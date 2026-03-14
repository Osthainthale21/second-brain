import { Telegraf, Context } from 'telegraf';
import { message } from 'telegraf/filters';
import { config } from '../config';
import { vaultService } from './vault.service';
import { ragService } from './rag.service';
import { whisperService } from './whisper.service';
import { scraperService } from './scraper.service';
import { llmService } from './llm.service';
import { logger } from '../utils/logger';

/**
 * TelegramService - Telegram Bot for Second Brain
 *
 * Commands:
 *   /start              → Welcome message
 *   /search <query>     → Search notes
 *   /ask <question>     → Ask knowledge base (RAG)
 *   /recent             → Show recent notes
 *   /tags               → Show all tags
 *   /help               → Show help
 *
 * Auto-detect:
 *   Text message         → Create note
 *   URL in message       → Scrape + summarize + create note
 *   Voice message        → Transcribe (Whisper) + create note
 *   Photo with caption   → Create note with caption
 */
export class TelegramService {
  private bot: Telegraf | null = null;
  private initialized = false;

  async init(): Promise<void> {
    if (!config.telegram.botToken) {
      logger.warn('Telegram bot token not set - bot disabled');
      return;
    }

    try {
      this.bot = new Telegraf(config.telegram.botToken);
      this.registerCommands();
      this.registerHandlers();

      await this.bot.launch();
      this.initialized = true;
      logger.info('Telegram bot started');

      // Graceful shutdown
      process.once('SIGINT', () => this.bot?.stop('SIGINT'));
      process.once('SIGTERM', () => this.bot?.stop('SIGTERM'));
    } catch (err) {
      logger.error('Telegram bot failed to start', err);
      this.initialized = false;
    }
  }

  isAvailable(): boolean {
    return this.initialized;
  }

  async stop(): Promise<void> {
    if (this.bot) {
      this.bot.stop();
      this.initialized = false;
    }
  }

  // ─── Command Handlers ──────────────────────────────────────────────

  private registerCommands(): void {
    if (!this.bot) return;

    this.bot.command('start', (ctx) => this.handleStart(ctx));
    this.bot.command('help', (ctx) => this.handleHelp(ctx));
    this.bot.command('search', (ctx) => this.handleSearch(ctx));
    this.bot.command('ask', (ctx) => this.handleAsk(ctx));
    this.bot.command('recent', (ctx) => this.handleRecent(ctx));
    this.bot.command('tags', (ctx) => this.handleTags(ctx));
  }

  private registerHandlers(): void {
    if (!this.bot) return;

    // Voice messages → Whisper transcription
    this.bot.on(message('voice'), (ctx) => this.handleVoice(ctx));

    // Text messages (auto-detect URL vs plain text)
    this.bot.on(message('text'), (ctx) => this.handleText(ctx));
  }

  // ─── /start ────────────────────────────────────────────────────────

  private async handleStart(ctx: Context): Promise<void> {
    await ctx.reply(
      `🧠 *Second Brain Bot*\n\n` +
      `ส่งข้อความ ลิงก์ หรือเสียงพูดมาได้เลย!\n` +
      `ระบบจะจดบันทึกให้อัตโนมัติ\n\n` +
      `📝 ส่งข้อความ → สร้างโน้ต\n` +
      `🔗 ส่ง URL → ดึงเนื้อหา + สรุป\n` +
      `🎙 ส่งเสียง → แปลงเป็นข้อความ\n\n` +
      `พิมพ์ /help เพื่อดูคำสั่งทั้งหมด`,
      { parse_mode: 'Markdown' },
    );
  }

  // ─── /help ─────────────────────────────────────────────────────────

  private async handleHelp(ctx: Context): Promise<void> {
    await ctx.reply(
      `📖 *คำสั่งทั้งหมด*\n\n` +
      `/search <คำค้น> - ค้นหาโน้ต\n` +
      `/ask <คำถาม> - ถาม-ตอบจาก knowledge base\n` +
      `/recent - ดูโน้ตล่าสุด 5 รายการ\n` +
      `/tags - ดู tags ทั้งหมด\n` +
      `/help - แสดงข้อความนี้\n\n` +
      `💡 *วิธีใช้*\n` +
      `• ส่งข้อความธรรมดา → สร้างโน้ตใหม่\n` +
      `• ส่ง URL → ดึงเนื้อหา + สรุปอัตโนมัติ\n` +
      `• ส่งเสียงพูด → Whisper แปลงเป็นข้อความ`,
      { parse_mode: 'Markdown' },
    );
  }

  // ─── /search ───────────────────────────────────────────────────────

  private async handleSearch(ctx: Context): Promise<void> {
    const text = (ctx.message && 'text' in ctx.message) ? ctx.message.text : '';
    const query = text.replace('/search', '').trim();

    if (!query) {
      await ctx.reply('❌ กรุณาระบุคำค้น: /search <คำค้น>');
      return;
    }

    await ctx.reply('🔍 กำลังค้นหา...');

    try {
      const results = await ragService.search(query, { limit: 5 });

      if (results.length === 0) {
        await ctx.reply(`ไม่พบผลลัพธ์สำหรับ "${query}"`);
        return;
      }

      let response = `🔍 *ผลลัพธ์สำหรับ "${query}":*\n\n`;
      for (const r of results) {
        const tags = r.note.frontmatter.tags.map((t) => `#${t}`).join(' ');
        const preview = r.note.content.substring(0, 100).replace(/\n/g, ' ');
        response += `📝 *${r.note.frontmatter.title}*\n`;
        response += `${tags}\n`;
        response += `${preview}...\n`;
        response += `Score: ${(r.score * 100).toFixed(0)}%\n\n`;
      }

      await ctx.reply(response, { parse_mode: 'Markdown' });
    } catch (err) {
      logger.error('Telegram search error', err);
      await ctx.reply('❌ เกิดข้อผิดพลาดในการค้นหา');
    }
  }

  // ─── /ask ──────────────────────────────────────────────────────────

  private async handleAsk(ctx: Context): Promise<void> {
    const text = (ctx.message && 'text' in ctx.message) ? ctx.message.text : '';
    const question = text.replace('/ask', '').trim();

    if (!question) {
      await ctx.reply('❌ กรุณาระบุคำถาม: /ask <คำถาม>');
      return;
    }

    await ctx.reply('🤔 กำลังคิด...');

    try {
      const result = await ragService.ask(question, { limit: 5 });

      let response = `💡 *คำตอบ:*\n\n${result.answer}\n\n`;

      if (result.sources.length > 0) {
        response += `📚 *แหล่งอ้างอิง:*\n`;
        for (const s of result.sources) {
          response += `• ${s.note.frontmatter.title}\n`;
        }
      }

      response += `\n_Strategy: ${result.strategy}_`;

      await ctx.reply(response, { parse_mode: 'Markdown' });
    } catch (err) {
      logger.error('Telegram ask error', err);
      await ctx.reply('❌ เกิดข้อผิดพลาดในการตอบคำถาม');
    }
  }

  // ─── /recent ───────────────────────────────────────────────────────

  private async handleRecent(ctx: Context): Promise<void> {
    try {
      const { notes } = await vaultService.getAll({ limit: 5 });

      if (notes.length === 0) {
        await ctx.reply('📭 ยังไม่มีโน้ต');
        return;
      }

      let response = `📋 *โน้ตล่าสุด:*\n\n`;
      for (const note of notes) {
        const tags = note.frontmatter.tags.map((t) => `#${t}`).join(' ');
        const date = new Date(note.frontmatter.created_at).toLocaleDateString('th-TH');
        response += `📝 *${note.frontmatter.title}*\n`;
        response += `📅 ${date} ${tags}\n\n`;
      }

      await ctx.reply(response, { parse_mode: 'Markdown' });
    } catch (err) {
      logger.error('Telegram recent error', err);
      await ctx.reply('❌ เกิดข้อผิดพลาด');
    }
  }

  // ─── /tags ─────────────────────────────────────────────────────────

  private async handleTags(ctx: Context): Promise<void> {
    try {
      const { notes } = await vaultService.getAll({ limit: 10000 });
      const tagCounts = new Map<string, number>();

      for (const note of notes) {
        for (const tag of note.frontmatter.tags) {
          tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
        }
      }

      if (tagCounts.size === 0) {
        await ctx.reply('🏷 ยังไม่มี tags');
        return;
      }

      const sorted = Array.from(tagCounts.entries()).sort((a, b) => b[1] - a[1]);

      let response = `🏷 *Tags ทั้งหมด:*\n\n`;
      for (const [tag, count] of sorted) {
        response += `#${tag} (${count})\n`;
      }

      await ctx.reply(response, { parse_mode: 'Markdown' });
    } catch (err) {
      logger.error('Telegram tags error', err);
      await ctx.reply('❌ เกิดข้อผิดพลาด');
    }
  }

  // ─── Text Message Handler ─────────────────────────────────────────

  private async handleText(ctx: Context): Promise<void> {
    const text = (ctx.message && 'text' in ctx.message) ? ctx.message.text : '';
    if (!text) return;

    // Skip if it's a command
    if (text.startsWith('/')) return;

    // Detect URL
    const urlRegex = /https?:\/\/[^\s]+/g;
    const urls = text.match(urlRegex);

    if (urls && urls.length > 0) {
      await this.handleUrl(ctx, urls[0], text);
    } else {
      await this.handlePlainText(ctx, text);
    }
  }

  // ─── URL Handler ──────────────────────────────────────────────────

  private async handleUrl(ctx: Context, url: string, fullText: string): Promise<void> {
    await ctx.reply('🔗 กำลังดึงเนื้อหาจาก URL...');

    try {
      const scraped = await scraperService.scrapeAndSummarize(url);

      // Create note with scraped content
      const noteContent = [
        scraped.summary ? `## Summary\n${scraped.summary}` : '',
        `## Content\n${scraped.content.substring(0, 3000)}`,
        fullText !== url ? `## User Note\n${fullText.replace(url, '').trim()}` : '',
        `\n---\nSource: ${url}`,
      ]
        .filter(Boolean)
        .join('\n\n');

      const note = await vaultService.create({
        title: scraped.title,
        content: noteContent,
        tags: scraped.suggestedTags || ['web', 'clipping'],
        source: 'telegram',
      });

      const tags = note.frontmatter.tags.map((t) => `#${t}`).join(' ');
      await ctx.reply(
        `✅ *บันทึกจาก URL แล้ว!*\n\n` +
        `📝 ${note.frontmatter.title}\n` +
        `🏷 ${tags}\n` +
        (scraped.summary ? `\n💡 *สรุป:*\n${scraped.summary.substring(0, 300)}` : ''),
        { parse_mode: 'Markdown' },
      );
    } catch (err) {
      logger.error('Telegram URL handler error', err);
      await ctx.reply('❌ ไม่สามารถดึงเนื้อหาจาก URL ได้ บันทึกเป็นข้อความแทน');
      await this.handlePlainText(ctx, fullText);
    }
  }

  // ─── Plain Text Handler ────────────────────────────────────────────

  private async handlePlainText(ctx: Context, text: string): Promise<void> {
    try {
      // Use first line as title (max 80 chars)
      const lines = text.split('\n').filter((l) => l.trim().length > 0);
      const title = lines[0].substring(0, 80);
      const content = text;

      // Auto-generate tags with LLM
      let tags: string[] = ['telegram'];
      try {
        const aiTags = await llmService.generateTags(content, title);
        tags = ['telegram', ...aiTags];
      } catch {
        // Keep default tags
      }

      const note = await vaultService.create({
        title,
        content,
        tags,
        source: 'telegram',
      });

      const tagStr = note.frontmatter.tags.map((t) => `#${t}`).join(' ');
      await ctx.reply(
        `✅ *บันทึกโน้ตแล้ว!*\n\n` +
        `📝 ${note.frontmatter.title}\n` +
        `🏷 ${tagStr}`,
        { parse_mode: 'Markdown' },
      );
    } catch (err) {
      logger.error('Telegram text handler error', err);
      await ctx.reply('❌ ไม่สามารถบันทึกโน้ตได้');
    }
  }

  // ─── Voice Message Handler ────────────────────────────────────────

  private async handleVoice(ctx: Context): Promise<void> {
    if (!whisperService.isAvailable()) {
      await ctx.reply('❌ Voice-to-text ไม่พร้อมใช้งาน (ต้องตั้งค่า OPENAI_API_KEY)');
      return;
    }

    await ctx.reply('🎙 กำลังแปลงเสียงเป็นข้อความ...');

    try {
      const voice = ctx.message && 'voice' in ctx.message ? ctx.message.voice : null;
      if (!voice) {
        await ctx.reply('❌ ไม่พบไฟล์เสียง');
        return;
      }

      // Get file link from Telegram
      const fileLink = await ctx.telegram.getFileLink(voice.file_id);
      const fileUrl = fileLink.toString();

      // Transcribe with Whisper
      const transcription = await whisperService.transcribeFromUrl(fileUrl);

      if (!transcription) {
        await ctx.reply('❌ ไม่สามารถแปลงเสียงได้ ลองใหม่อีกครั้ง');
        return;
      }

      // Create note from transcription
      const title = transcription.substring(0, 80);

      let tags: string[] = ['telegram', 'voice'];
      try {
        const aiTags = await llmService.generateTags(transcription, title);
        tags = ['telegram', 'voice', ...aiTags];
      } catch {
        // Keep default tags
      }

      const note = await vaultService.create({
        title,
        content: `🎙 *Voice Note*\n\n${transcription}`,
        tags,
        source: 'telegram',
      });

      const tagStr = note.frontmatter.tags.map((t) => `#${t}`).join(' ');
      await ctx.reply(
        `✅ *บันทึกเสียงเป็นโน้ตแล้ว!*\n\n` +
        `📝 ${note.frontmatter.title}\n` +
        `🏷 ${tagStr}\n\n` +
        `📄 *ข้อความ:*\n${transcription.substring(0, 500)}`,
        { parse_mode: 'Markdown' },
      );
    } catch (err) {
      logger.error('Telegram voice handler error', err);
      await ctx.reply('❌ เกิดข้อผิดพลาดในการแปลงเสียง');
    }
  }
}

export const telegramService = new TelegramService();
