import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  vaultPath: path.resolve(process.env.VAULT_PATH || './vault'),
  exportPath: path.resolve(process.env.EXPORT_PATH || './vault/exports'),

  auth: {
    apiKeys: process.env.AUTH_API_KEYS || '',
    masterKey: process.env.AUTH_MASTER_KEY || '',
  },

  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
  },

  chroma: {
    host: process.env.CHROMA_HOST || 'http://localhost:8000',
    collection: process.env.CHROMA_COLLECTION || 'second_brain',
  },

  neo4j: {
    uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
    user: process.env.NEO4J_USER || 'neo4j',
    password: process.env.NEO4J_PASSWORD || '',
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },

  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
  },

  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
  },

  notion: {
    apiKey: process.env.NOTION_API_KEY || '',
    rootPageId: process.env.NOTION_ROOT_PAGE_ID || '',
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    refreshToken: process.env.GOOGLE_REFRESH_TOKEN || '',
  },

  canva: {
    apiKey: process.env.CANVA_API_KEY || '',
    brandKitId: process.env.CANVA_BRAND_KIT_ID || '',
  },

  cloudflare: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID || '',
    apiToken: process.env.CLOUDFLARE_API_TOKEN || '',
    d1DatabaseId: process.env.CLOUDFLARE_D1_DATABASE_ID || '',
    kvNamespaceId: process.env.CLOUDFLARE_KV_NAMESPACE_ID || '',
    r2BucketName: process.env.CLOUDFLARE_R2_BUCKET_NAME || 'second-brain-exports',
  },
} as const;
