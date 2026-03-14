import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { config } from '../config';
import { logger } from '../utils/logger';

/**
 * Authentication Middleware
 *
 * Supports 3 modes:
 * 1. API Key (header: X-API-Key or Authorization: Bearer <key>)
 * 2. Master Key (for admin endpoints)
 * 3. Disabled (development mode when no keys configured)
 *
 * API keys are stored as SHA-256 hashes for security.
 */

interface AuthConfig {
  /** SHA-256 hashed API keys (comma-separated in env) */
  apiKeys: Set<string>;
  /** SHA-256 hashed master key for admin operations */
  masterKeyHash: string | null;
  /** Bypass auth entirely (dev mode) */
  disabled: boolean;
}

let authConfig: AuthConfig | null = null;

function getAuthConfig(): AuthConfig {
  if (authConfig) return authConfig;

  const rawKeys = config.auth.apiKeys;
  const masterKey = config.auth.masterKey;

  // If no keys configured → auth disabled (dev mode)
  const disabled = !rawKeys && !masterKey;

  const apiKeys = new Set<string>();
  if (rawKeys) {
    for (const key of rawKeys.split(',')) {
      const trimmed = key.trim();
      if (trimmed) {
        apiKeys.add(hashKey(trimmed));
      }
    }
  }

  // Master key also works as an API key
  const masterKeyHash = masterKey ? hashKey(masterKey) : null;
  if (masterKeyHash) {
    apiKeys.add(masterKeyHash);
  }

  authConfig = { apiKeys, masterKeyHash, disabled };

  if (disabled) {
    logger.warn('[Auth] No API keys configured — authentication DISABLED (dev mode)');
  } else {
    logger.info(`[Auth] ${apiKeys.size} API key(s) loaded, authentication enabled`);
  }

  return authConfig;
}

function hashKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

function extractKey(req: Request): string | null {
  // Check X-API-Key header
  const apiKeyHeader = req.headers['x-api-key'];
  if (apiKeyHeader && typeof apiKeyHeader === 'string') {
    return apiKeyHeader;
  }

  // Check Authorization: Bearer <key>
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  // Check query parameter (for webhooks, less secure)
  const queryKey = req.query.api_key;
  if (queryKey && typeof queryKey === 'string') {
    return queryKey;
  }

  return null;
}

/**
 * Standard API authentication
 * Allows access if:
 * - Auth is disabled (no keys configured)
 * - Valid API key or master key provided
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const cfg = getAuthConfig();

  if (cfg.disabled) {
    next();
    return;
  }

  const key = extractKey(req);
  if (!key) {
    res.status(401).json({
      success: false,
      error: 'Authentication required. Provide X-API-Key header or Authorization: Bearer <key>',
    });
    return;
  }

  const keyHash = hashKey(key);
  if (!cfg.apiKeys.has(keyHash)) {
    logger.warn(`[Auth] Invalid API key attempt from ${req.ip}`);
    res.status(403).json({
      success: false,
      error: 'Invalid API key',
    });
    return;
  }

  next();
}

/**
 * Master key authentication (for admin endpoints: backup, restore, etc.)
 */
export function requireMasterKey(req: Request, res: Response, next: NextFunction): void {
  const cfg = getAuthConfig();

  if (cfg.disabled) {
    next();
    return;
  }

  if (!cfg.masterKeyHash) {
    res.status(403).json({
      success: false,
      error: 'Master key not configured. Set AUTH_MASTER_KEY in .env',
    });
    return;
  }

  const key = extractKey(req);
  if (!key) {
    res.status(401).json({
      success: false,
      error: 'Master key required for admin operations',
    });
    return;
  }

  const keyHash = hashKey(key);
  if (keyHash !== cfg.masterKeyHash) {
    logger.warn(`[Auth] Invalid master key attempt from ${req.ip}`);
    res.status(403).json({
      success: false,
      error: 'Invalid master key',
    });
    return;
  }

  next();
}

/**
 * Reset auth config (for testing)
 */
export function resetAuthConfig(): void {
  authConfig = null;
}
