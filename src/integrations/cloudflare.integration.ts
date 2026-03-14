import axios, { AxiosInstance } from 'axios';
import fs from 'fs';
import { config } from '../config';
import { logger } from '../utils/logger';

/**
 * CloudflareIntegration - Deploy and store with Cloudflare
 *
 * Features:
 * - R2: Upload/download vault exports (backups, PDFs)
 * - D1: Query structured metadata
 * - KV: Fast key-value cache for search results
 * - Workers: Deploy edge functions
 */
export class CloudflareIntegration {
  private client: AxiosInstance | null = null;
  private accountId: string;
  private d1DatabaseId: string;
  private kvNamespaceId: string;
  private r2BucketName: string;

  constructor() {
    this.accountId = config.cloudflare.accountId;
    this.d1DatabaseId = config.cloudflare.d1DatabaseId;
    this.kvNamespaceId = config.cloudflare.kvNamespaceId;
    this.r2BucketName = config.cloudflare.r2BucketName;

    if (config.cloudflare.apiToken && this.accountId) {
      this.client = axios.create({
        baseURL: `https://api.cloudflare.com/client/v4/accounts/${this.accountId}`,
        headers: {
          Authorization: `Bearer ${config.cloudflare.apiToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      });
    }
  }

  isAvailable(): boolean {
    return this.client !== null;
  }

  // ─── R2 (Object Storage) ──────────────────────────────────────────

  /**
   * Upload file to R2 bucket
   */
  async r2Upload(key: string, filePath: string, contentType?: string): Promise<{ key: string }> {
    if (!this.client) throw new Error('Cloudflare not configured');

    const fileStream = fs.createReadStream(filePath);

    await this.client.put(
      `/r2/buckets/${this.r2BucketName}/objects/${key}`,
      fileStream,
      {
        headers: {
          'Content-Type': contentType || 'application/octet-stream',
        },
      },
    );

    logger.info(`[CF R2] Uploaded: ${key}`);
    return { key };
  }

  /**
   * Download file from R2 bucket
   */
  async r2Download(key: string, destPath: string): Promise<void> {
    if (!this.client) throw new Error('Cloudflare not configured');

    const response = await this.client.get(
      `/r2/buckets/${this.r2BucketName}/objects/${key}`,
      { responseType: 'stream' },
    );

    const writer = fs.createWriteStream(destPath);
    response.data.pipe(writer);

    await new Promise<void>((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    logger.info(`[CF R2] Downloaded: ${key} → ${destPath}`);
  }

  /**
   * List objects in R2 bucket
   */
  async r2List(prefix?: string): Promise<R2Object[]> {
    if (!this.client) throw new Error('Cloudflare not configured');

    const params: Record<string, string> = {};
    if (prefix) params.prefix = prefix;

    const response = await this.client.get(
      `/r2/buckets/${this.r2BucketName}/objects`,
      { params },
    );

    return (response.data.result?.objects || []).map((o: R2ObjectRaw) => ({
      key: o.key,
      size: o.size,
      uploaded: o.uploaded,
    }));
  }

  /**
   * Delete object from R2
   */
  async r2Delete(key: string): Promise<void> {
    if (!this.client) throw new Error('Cloudflare not configured');

    await this.client.delete(`/r2/buckets/${this.r2BucketName}/objects/${key}`);
    logger.info(`[CF R2] Deleted: ${key}`);
  }

  // ─── D1 (SQL Database) ────────────────────────────────────────────

  /**
   * Query D1 database
   */
  async d1Query(sql: string, params?: unknown[]): Promise<D1QueryResult> {
    if (!this.client) throw new Error('Cloudflare not configured');
    if (!this.d1DatabaseId) throw new Error('D1 database ID not configured');

    const response = await this.client.post(
      `/d1/database/${this.d1DatabaseId}/query`,
      { sql, params: params || [] },
    );

    const result = response.data.result?.[0] || {};
    return {
      columns: result.results?.[0] ? Object.keys(result.results[0]) : [],
      rows: result.results || [],
      meta: {
        changes: result.meta?.changes || 0,
        duration: result.meta?.duration || 0,
      },
    };
  }

  /**
   * Initialize D1 schema for note metadata
   */
  async d1InitSchema(): Promise<void> {
    await this.d1Query(`
      CREATE TABLE IF NOT EXISTS notes_meta (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        tags TEXT,
        source TEXT,
        status TEXT DEFAULT 'inbox',
        created_at TEXT,
        updated_at TEXT,
        search_count INTEGER DEFAULT 0,
        last_accessed TEXT
      )
    `);

    await this.d1Query(`
      CREATE TABLE IF NOT EXISTS search_cache (
        query_hash TEXT PRIMARY KEY,
        query TEXT,
        results TEXT,
        created_at TEXT,
        ttl_seconds INTEGER DEFAULT 3600
      )
    `);

    logger.info('[CF D1] Schema initialized');
  }

  // ─── KV (Key-Value Store) ─────────────────────────────────────────

  /**
   * Set KV value
   */
  async kvSet(key: string, value: string, expirationTtl?: number): Promise<void> {
    if (!this.client) throw new Error('Cloudflare not configured');
    if (!this.kvNamespaceId) throw new Error('KV namespace ID not configured');

    const params: Record<string, number> = {};
    if (expirationTtl) params.expiration_ttl = expirationTtl;

    await this.client.put(
      `/storage/kv/namespaces/${this.kvNamespaceId}/values/${key}`,
      value,
      { params, headers: { 'Content-Type': 'text/plain' } },
    );
  }

  /**
   * Get KV value
   */
  async kvGet(key: string): Promise<string | null> {
    if (!this.client) throw new Error('Cloudflare not configured');
    if (!this.kvNamespaceId) throw new Error('KV namespace ID not configured');

    try {
      const response = await this.client.get(
        `/storage/kv/namespaces/${this.kvNamespaceId}/values/${key}`,
        { responseType: 'text' },
      );
      return response.data as string;
    } catch {
      return null;
    }
  }

  /**
   * Delete KV value
   */
  async kvDelete(key: string): Promise<void> {
    if (!this.client) throw new Error('Cloudflare not configured');
    if (!this.kvNamespaceId) throw new Error('KV namespace ID not configured');

    await this.client.delete(
      `/storage/kv/namespaces/${this.kvNamespaceId}/values/${key}`,
    );
  }

  /**
   * Get integration status
   */
  getStatus(): {
    available: boolean;
    services: { name: string; configured: boolean }[];
  } {
    return {
      available: this.isAvailable(),
      services: [
        { name: 'R2 (Object Storage)', configured: !!this.r2BucketName },
        { name: 'D1 (SQL Database)', configured: !!this.d1DatabaseId },
        { name: 'KV (Key-Value)', configured: !!this.kvNamespaceId },
      ],
    };
  }
}

// Types
interface R2ObjectRaw {
  key: string;
  size: number;
  uploaded: string;
}

interface R2Object {
  key: string;
  size: number;
  uploaded: string;
}

interface D1QueryResult {
  columns: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: any[];
  meta: { changes: number; duration: number };
}

export const cloudflareIntegration = new CloudflareIntegration();
