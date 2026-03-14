import axios from 'axios';
import * as cheerio from 'cheerio';
import { llmService } from './llm.service';
import { logger } from '../utils/logger';

export interface ScrapedContent {
  title: string;
  content: string;
  url: string;
  summary?: string;
  suggestedTags?: string[];
}

/**
 * ScraperService - Extract and summarize content from web URLs
 */
export class ScraperService {
  private readonly maxContentLength = 15000;
  private readonly timeout = 10000;

  async scrape(url: string): Promise<ScrapedContent> {
    try {
      const response = await axios.get(url, {
        timeout: this.timeout,
        headers: {
          'User-Agent': 'SecondBrain/1.0 (Knowledge Collector)',
          Accept: 'text/html,application/xhtml+xml',
        },
        maxRedirects: 5,
      });

      const html = response.data as string;
      const $ = cheerio.load(html);

      // Remove unwanted elements
      $('script, style, nav, footer, header, iframe, noscript, aside, .ad, .ads, .advertisement').remove();

      // Extract title
      const title = this.extractTitle($) || new URL(url).hostname;

      // Extract main content
      const content = this.extractContent($);

      // Truncate if too long
      const truncated = content.length > this.maxContentLength
        ? content.substring(0, this.maxContentLength) + '...'
        : content;

      logger.info(`Scraped: ${title} (${truncated.length} chars)`);

      return {
        title,
        content: truncated,
        url,
      };
    } catch (err) {
      logger.error(`Scrape failed for ${url}`, err);
      throw new Error(`Failed to scrape URL: ${url}`);
    }
  }

  async scrapeAndSummarize(url: string): Promise<ScrapedContent> {
    const scraped = await this.scrape(url);

    try {
      const [summary, suggestedTags] = await Promise.all([
        llmService.summarize(scraped.content, 300),
        llmService.generateTags(scraped.content, scraped.title),
      ]);

      scraped.summary = summary;
      scraped.suggestedTags = suggestedTags;
    } catch {
      logger.warn('LLM summarization failed, returning raw content');
    }

    return scraped;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private extractTitle($: any): string {
    return (
      $('meta[property="og:title"]').attr('content') ||
      $('meta[name="twitter:title"]').attr('content') ||
      $('h1').first().text().trim() ||
      $('title').text().trim() ||
      ''
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private extractContent($: any): string {
    // Try article/main content first
    const selectors = [
      'article',
      '[role="main"]',
      'main',
      '.post-content',
      '.article-content',
      '.entry-content',
      '.content',
      '#content',
    ];

    for (const selector of selectors) {
      const el = $(selector);
      if (el.length > 0) {
        const text = this.cleanText(el.text());
        if (text.length > 200) return text;
      }
    }

    // Fallback: extract from body paragraphs
    const paragraphs: string[] = [];
    $('p').each((_: unknown, el: unknown) => {
      const text = $(el).text().trim();
      if (text.length > 30) {
        paragraphs.push(text);
      }
    });

    if (paragraphs.length > 0) {
      return paragraphs.join('\n\n');
    }

    // Last resort: body text
    return this.cleanText($('body').text());
  }

  private cleanText(text: string): string {
    return text
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n\n')
      .trim();
  }
}

export const scraperService = new ScraperService();
