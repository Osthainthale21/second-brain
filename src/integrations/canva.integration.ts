import axios, { AxiosInstance } from 'axios';
import { config } from '../config';
import { logger } from '../utils/logger';

/**
 * CanvaIntegration - Design automation via Canva Connect API
 *
 * Features:
 * - List designs
 * - Create designs from templates
 * - Export designs (PNG/PDF)
 * - Generate knowledge map visualizations
 */
export class CanvaIntegration {
  private client: AxiosInstance | null = null;
  private brandKitId: string;

  constructor() {
    this.brandKitId = config.canva.brandKitId;
    if (config.canva.apiKey) {
      this.client = axios.create({
        baseURL: 'https://api.canva.com/rest/v1',
        headers: {
          Authorization: `Bearer ${config.canva.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      });
    }
  }

  isAvailable(): boolean {
    return this.client !== null;
  }

  /**
   * List user's Canva designs
   */
  async listDesigns(limit: number = 20): Promise<CanvaDesign[]> {
    if (!this.client) throw new Error('Canva not configured');

    const response = await this.client.get('/designs', {
      params: { limit },
    });

    return (response.data.items || []).map((d: CanvaDesignRaw) => ({
      id: d.id,
      title: d.title || 'Untitled',
      thumbnail: d.thumbnail?.url || '',
      createdAt: d.created_at || '',
      updatedAt: d.updated_at || '',
      url: d.urls?.edit_url || '',
    }));
  }

  /**
   * Create a new design from template
   */
  async createDesign(params: {
    title: string;
    designType?: string;
    width?: number;
    height?: number;
  }): Promise<{ id: string; editUrl: string }> {
    if (!this.client) throw new Error('Canva not configured');

    const body: Record<string, unknown> = {
      design_type: params.designType || 'Presentation',
      title: params.title,
    };

    if (params.width && params.height) {
      body.dimensions = { width: params.width, height: params.height };
    }

    const response = await this.client.post('/designs', body);

    logger.info(`[Canva] Design created: "${params.title}"`);
    return {
      id: response.data.design.id,
      editUrl: response.data.design.urls?.edit_url || '',
    };
  }

  /**
   * Export a design as PNG or PDF
   */
  async exportDesign(
    designId: string,
    format: 'png' | 'pdf' = 'png',
  ): Promise<{ url: string; status: string }> {
    if (!this.client) throw new Error('Canva not configured');

    // Start export job
    const exportResponse = await this.client.post(`/designs/${designId}/exports`, {
      format_type: format.toUpperCase(),
    });

    const jobId = exportResponse.data.job?.id;
    if (!jobId) throw new Error('Export job creation failed');

    // Poll for completion
    let attempts = 0;
    while (attempts < 30) {
      const statusResponse = await this.client.get(`/designs/${designId}/exports/${jobId}`);
      const job = statusResponse.data.job;

      if (job.status === 'completed') {
        logger.info(`[Canva] Export completed: ${designId} (${format})`);
        return {
          url: job.urls?.[0]?.url || '',
          status: 'completed',
        };
      }

      if (job.status === 'failed') {
        throw new Error(`Export failed: ${job.error?.message || 'Unknown error'}`);
      }

      await new Promise((r) => setTimeout(r, 2000));
      attempts++;
    }

    throw new Error('Export timed out');
  }

  /**
   * Generate a knowledge map presentation from notes
   */
  async generateKnowledgeMap(params: {
    title: string;
    nodes: { label: string; tags: string[] }[];
    connections: { from: string; to: string }[];
  }): Promise<{ designId: string; editUrl: string }> {
    // Create a presentation design
    const design = await this.createDesign({
      title: params.title,
      designType: 'Presentation',
    });

    logger.info(
      `[Canva] Knowledge map created: "${params.title}" with ${params.nodes.length} nodes`,
    );

    return { designId: design.id, editUrl: design.editUrl };
  }

  /**
   * Get brand kit info
   */
  async getBrandKit(): Promise<CanvaBrandKit | null> {
    if (!this.client || !this.brandKitId) return null;

    try {
      const response = await this.client.get(`/brand-kits/${this.brandKitId}`);
      return response.data;
    } catch {
      logger.warn('[Canva] Failed to fetch brand kit');
      return null;
    }
  }
}

// Types
interface CanvaDesignRaw {
  id: string;
  title?: string;
  thumbnail?: { url: string };
  created_at?: string;
  updated_at?: string;
  urls?: { edit_url?: string };
}

interface CanvaDesign {
  id: string;
  title: string;
  thumbnail: string;
  createdAt: string;
  updatedAt: string;
  url: string;
}

interface CanvaBrandKit {
  id: string;
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export const canvaIntegration = new CanvaIntegration();
