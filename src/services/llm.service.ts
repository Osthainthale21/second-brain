import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';
import { logger } from '../utils/logger';

export class LLMService {
  private client: Anthropic;
  private model: string;

  constructor() {
    this.client = new Anthropic({ apiKey: config.anthropic.apiKey });
    this.model = config.anthropic.model;
  }

  async chat(
    systemPrompt: string,
    userMessage: string,
    options?: { maxTokens?: number; temperature?: number },
  ): Promise<string> {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: options?.maxTokens || 2048,
        temperature: options?.temperature ?? 0.3,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      });

      const textBlock = response.content.find((block) => block.type === 'text');
      return textBlock?.text || '';
    } catch (err) {
      logger.error('LLM chat failed', err);
      throw err;
    }
  }

  async generateTags(content: string, title: string): Promise<string[]> {
    const prompt = `Analyze this note and suggest 3-5 relevant tags. Return ONLY a JSON array of lowercase tag strings, nothing else.

Title: ${title}
Content: ${content}`;

    try {
      const response = await this.chat('You are a tagging assistant. Return only valid JSON.', prompt);
      const tags = JSON.parse(response) as string[];
      return tags.map((t) => t.toLowerCase().trim());
    } catch {
      logger.warn('Failed to auto-generate tags, returning empty array');
      return [];
    }
  }

  async summarize(content: string, maxLength?: number): Promise<string> {
    const prompt = `Summarize the following content in ${maxLength || 200} characters or less. Be concise and capture the key points:\n\n${content}`;

    return this.chat('You are a concise summarizer.', prompt);
  }

  async synthesizeAnswer(query: string, contexts: { title: string; content: string }[]): Promise<string> {
    const contextText = contexts
      .map((c, i) => `[${i + 1}] "${c.title}":\n${c.content}`)
      .join('\n\n---\n\n');

    const prompt = `Based on the following notes from my knowledge base, answer the question.
If the notes don't contain enough information, say so honestly.
Reference the note titles when citing information.

Question: ${query}

Notes:
${contextText}`;

    return this.chat(
      'You are a knowledgeable assistant that answers questions based on the user\'s personal knowledge base. Be helpful, accurate, and cite your sources from the provided notes.',
      prompt,
      { maxTokens: 4096 },
    );
  }
}

export const llmService = new LLMService();
