import rateLimit from 'express-rate-limit';

/**
 * Rate Limiters for different endpoint categories
 *
 * Strategy:
 * - General API:    100 req/min (notes CRUD, search)
 * - LLM endpoints:  20 req/min  (ask, auto-tag — expensive AI calls)
 * - Ingest:         30 req/min  (URL scraping, voice)
 * - Admin:          10 req/min  (backup, restore)
 */

/** General API — 100 requests per minute */
export const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many requests. Limit: 100/minute',
  },
});

/** LLM-powered endpoints — 20 requests per minute (costly) */
export const llmLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many AI requests. Limit: 20/minute',
  },
});

/** Ingest endpoints — 30 requests per minute */
export const ingestLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many ingest requests. Limit: 30/minute',
  },
});

/** Admin endpoints — 10 requests per minute */
export const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many admin requests. Limit: 10/minute',
  },
});
