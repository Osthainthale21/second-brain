import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import fs from 'fs';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yaml';
import { errorHandler } from './middleware/errorHandler';
import { requireAuth } from './middleware/auth';
import { generalLimiter, llmLimiter, ingestLimiter } from './middleware/rateLimiter';
import notesRouter from './routes/notes.routes';
import searchRouter from './routes/search.routes';
import graphRouter from './routes/graph.routes';
import ingestRouter from './routes/ingest.routes';
import agentsRouter from './routes/agents.routes';
import integrationsRouter from './routes/integrations.routes';
import adminRouter from './routes/admin.routes';

const app = express();

// ─── Global Middleware ──────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false })); // Disable CSP for inline scripts in dashboard
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(morgan('short'));

// ─── Dashboard (static files) ───────────────────────────────────────
app.use(express.static(path.join(__dirname, '..', 'public')));

// ─── Swagger API Docs ───────────────────────────────────────────────
const swaggerPath = path.join(__dirname, '..', 'docs', 'openapi.yaml');
if (fs.existsSync(swaggerPath)) {
  const swaggerDoc = YAML.parse(fs.readFileSync(swaggerPath, 'utf-8'));
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDoc, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Second Brain API Docs',
  }));
}

// ─── Public Routes (no auth) ───────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Authenticated Routes ──────────────────────────────────────────
// Auth middleware — disabled in dev mode when no API keys configured
app.use('/api', requireAuth);

// Standard API routes (100 req/min)
app.use('/api/notes', generalLimiter, notesRouter);
app.use('/api/graph', generalLimiter, graphRouter);

// Search routes — /ask uses LLM (20 req/min), /search uses general limit
app.use('/api/search', llmLimiter, searchRouter);

// Ingest routes (30 req/min — scraping/voice)
app.use('/api/ingest', ingestLimiter, ingestRouter);

// Agent routes (general limit)
app.use('/api/agents', generalLimiter, agentsRouter);

// Integration routes (general limit)
app.use('/api/integrations', generalLimiter, integrationsRouter);

// Admin routes (backup/export — has own rate limiter + master key)
app.use('/api/admin', adminRouter);

// ─── Error handler (must be last) ──────────────────────────────────
app.use(errorHandler);

export default app;
