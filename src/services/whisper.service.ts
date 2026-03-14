import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { config } from '../config';
import { logger } from '../utils/logger';

/**
 * WhisperService - Voice-to-text transcription via OpenAI Whisper API
 * Supports: .ogg, .mp3, .wav, .m4a, .webm (Telegram voice = .ogg)
 */
export class WhisperService {
  private client: OpenAI | null = null;
  private tempDir: string;

  constructor() {
    if (config.openai.apiKey) {
      this.client = new OpenAI({ apiKey: config.openai.apiKey });
    }
    this.tempDir = path.join(config.vaultPath, '.tmp');
  }

  isAvailable(): boolean {
    return this.client !== null;
  }

  async init(): Promise<void> {
    const fsPromises = await import('fs/promises');
    await fsPromises.mkdir(this.tempDir, { recursive: true });
    if (this.isAvailable()) {
      logger.info('Whisper voice-to-text service ready');
    } else {
      logger.warn('OpenAI API key not set - voice transcription disabled');
    }
  }

  /**
   * Download a file from URL and transcribe it
   */
  async transcribeFromUrl(fileUrl: string, language?: string): Promise<string> {
    if (!this.client) throw new Error('Whisper not available: OpenAI API key not set');

    const tempFile = path.join(this.tempDir, `voice_${Date.now()}.ogg`);

    try {
      // Download file
      const response = await axios.get(fileUrl, { responseType: 'stream' });
      const writer = fs.createWriteStream(tempFile);
      response.data.pipe(writer);

      await new Promise<void>((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });

      // Transcribe
      const text = await this.transcribeFile(tempFile, language);
      return text;
    } finally {
      // Cleanup temp file
      try {
        fs.unlinkSync(tempFile);
      } catch {
        // ignore
      }
    }
  }

  /**
   * Transcribe a local file
   */
  async transcribeFile(filePath: string, language?: string): Promise<string> {
    if (!this.client) throw new Error('Whisper not available');

    try {
      const transcription = await this.client.audio.transcriptions.create({
        file: fs.createReadStream(filePath),
        model: 'whisper-1',
        language: language || 'th', // default Thai
        response_format: 'text',
      });

      const text = typeof transcription === 'string'
        ? transcription
        : (transcription as unknown as { text: string }).text;

      logger.info(`Whisper transcribed ${path.basename(filePath)}: ${text.length} chars`);
      return text.trim();
    } catch (err) {
      logger.error('Whisper transcription failed', err);
      throw err;
    }
  }
}

export const whisperService = new WhisperService();
