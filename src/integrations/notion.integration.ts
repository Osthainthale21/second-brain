import { Client } from '@notionhq/client';
import { config } from '../config';
import { vaultService } from '../services/vault.service';
import { llmService } from '../services/llm.service';
import { logger } from '../utils/logger';

/**
 * NotionIntegration - 2-way sync between Notion and Vault
 *
 * Features:
 * - Import pages from Notion → Vault notes
 * - Export vault notes → Notion pages
 * - Search Notion workspace
 * - Sync database items
 */
export class NotionIntegration {
  private client: Client | null = null;
  private rootPageId: string;

  constructor() {
    this.rootPageId = config.notion.rootPageId;
    if (config.notion.apiKey) {
      this.client = new Client({ auth: config.notion.apiKey });
    }
  }

  isAvailable(): boolean {
    return this.client !== null;
  }

  /**
   * Search Notion workspace
   */
  async search(query: string, limit: number = 10): Promise<NotionSearchResult[]> {
    if (!this.client) throw new Error('Notion not configured');

    const response = await this.client.search({
      query,
      page_size: limit,
      sort: { direction: 'descending', timestamp: 'last_edited_time' },
    });

    return response.results
      .filter((r): r is NotionPage => r.object === 'page')
      .map((page) => ({
        id: page.id,
        title: this.extractPageTitle(page),
        url: (page as NotionPage).url || '',
        lastEdited: (page as NotionPage).last_edited_time || '',
      }));
  }

  /**
   * Import a Notion page → Vault note
   */
  async importPage(pageId: string): Promise<{ noteId: string; title: string }> {
    if (!this.client) throw new Error('Notion not configured');

    // Get page metadata
    const page = (await this.client.pages.retrieve({ page_id: pageId })) as NotionPage;
    const title = this.extractPageTitle(page);

    // Get page content (blocks)
    const blocks = await this.client.blocks.children.list({ block_id: pageId });
    const content = this.blocksToMarkdown(blocks.results);

    // Auto-generate tags
    let tags: string[] = ['notion', 'imported'];
    try {
      const aiTags = await llmService.generateTags(content, title);
      tags = ['notion', 'imported', ...aiTags];
    } catch {
      // keep default tags
    }

    // Create vault note
    const note = await vaultService.create({
      title,
      content: `${content}\n\n---\n_Imported from Notion: ${pageId}_`,
      tags,
      source: 'notion',
    });

    logger.info(`[Notion] Imported: "${title}" → ${note.frontmatter.id}`);
    return { noteId: note.frontmatter.id, title };
  }

  /**
   * Export a vault note → Notion page
   */
  async exportNote(noteId: string, parentPageId?: string): Promise<{ notionPageId: string; url: string }> {
    if (!this.client) throw new Error('Notion not configured');

    const note = await vaultService.getById(noteId);
    const parentId = parentPageId || this.rootPageId;

    if (!parentId) throw new Error('No parent page ID specified and no root page configured');

    const response = await this.client.pages.create({
      parent: { page_id: parentId },
      properties: {
        title: {
          title: [{ text: { content: note.frontmatter.title } }],
        },
      },
      children: this.markdownToBlocks(note.content),
    });

    const url = (response as NotionPage).url || '';
    logger.info(`[Notion] Exported: "${note.frontmatter.title}" → ${response.id}`);

    // Save notion_id back to vault note
    await vaultService.update(noteId, {});

    return { notionPageId: response.id, url };
  }

  /**
   * List recent Notion pages
   */
  async listRecent(limit: number = 20): Promise<NotionSearchResult[]> {
    if (!this.client) throw new Error('Notion not configured');

    const response = await this.client.search({
      page_size: limit,
      sort: { direction: 'descending', timestamp: 'last_edited_time' },
      filter: { property: 'object', value: 'page' },
    });

    return response.results
      .filter((r): r is NotionPage => r.object === 'page')
      .map((page) => ({
        id: page.id,
        title: this.extractPageTitle(page),
        url: page.url || '',
        lastEdited: page.last_edited_time || '',
      }));
  }

  // ─── Helpers ─────────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private extractPageTitle(page: any): string {
    const props = page.properties || {};
    for (const key of Object.keys(props)) {
      const prop = props[key];
      if (prop.type === 'title' && prop.title?.length > 0) {
        return prop.title.map((t: { plain_text: string }) => t.plain_text).join('');
      }
    }
    return 'Untitled';
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private blocksToMarkdown(blocks: any[]): string {
    return blocks
      .map((block) => {
        const type = block.type;
        const data = block[type];
        if (!data) return '';

        const text = data.rich_text
          ?.map((t: { plain_text: string }) => t.plain_text)
          .join('') || '';

        switch (type) {
          case 'paragraph': return text;
          case 'heading_1': return `# ${text}`;
          case 'heading_2': return `## ${text}`;
          case 'heading_3': return `### ${text}`;
          case 'bulleted_list_item': return `- ${text}`;
          case 'numbered_list_item': return `1. ${text}`;
          case 'to_do': return `- [${data.checked ? 'x' : ' '}] ${text}`;
          case 'toggle': return `<details><summary>${text}</summary></details>`;
          case 'code': return `\`\`\`${data.language || ''}\n${text}\n\`\`\``;
          case 'quote': return `> ${text}`;
          case 'divider': return '---';
          case 'callout': return `> 💡 ${text}`;
          default: return text;
        }
      })
      .filter(Boolean)
      .join('\n\n');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private markdownToBlocks(markdown: string): any[] {
    const lines = markdown.split('\n');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const blocks: any[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (trimmed.startsWith('### ')) {
        blocks.push({
          object: 'block', type: 'heading_3',
          heading_3: { rich_text: [{ type: 'text', text: { content: trimmed.slice(4) } }] },
        });
      } else if (trimmed.startsWith('## ')) {
        blocks.push({
          object: 'block', type: 'heading_2',
          heading_2: { rich_text: [{ type: 'text', text: { content: trimmed.slice(3) } }] },
        });
      } else if (trimmed.startsWith('# ')) {
        blocks.push({
          object: 'block', type: 'heading_1',
          heading_1: { rich_text: [{ type: 'text', text: { content: trimmed.slice(2) } }] },
        });
      } else if (trimmed.startsWith('- ')) {
        blocks.push({
          object: 'block', type: 'bulleted_list_item',
          bulleted_list_item: { rich_text: [{ type: 'text', text: { content: trimmed.slice(2) } }] },
        });
      } else if (trimmed === '---') {
        blocks.push({ object: 'block', type: 'divider', divider: {} });
      } else {
        blocks.push({
          object: 'block', type: 'paragraph',
          paragraph: { rich_text: [{ type: 'text', text: { content: trimmed } }] },
        });
      }
    }

    return blocks;
  }
}

// Types
interface NotionPage {
  object: 'page';
  id: string;
  url?: string;
  last_edited_time?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  properties: Record<string, any>;
}

interface NotionSearchResult {
  id: string;
  title: string;
  url: string;
  lastEdited: string;
}

export const notionIntegration = new NotionIntegration();
