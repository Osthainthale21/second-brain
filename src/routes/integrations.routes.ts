import { Router } from 'express';
import { integrationsController } from '../controllers/integrations.controller';

const router = Router();
const c = integrationsController;

// ─── Status ─────────────────────────────────────────────────────────
router.get('/status', (req, res, next) => c.getStatus(req, res, next));

// ─── Notion ─────────────────────────────────────────────────────────
router.post('/notion/search', (req, res, next) => c.notionSearch(req, res, next));
router.post('/notion/import', (req, res, next) => c.notionImport(req, res, next));
router.post('/notion/export', (req, res, next) => c.notionExport(req, res, next));
router.get('/notion/recent', (req, res, next) => c.notionRecent(req, res, next));

// ─── Google Drive ───────────────────────────────────────────────────
router.post('/gdrive/search', (req, res, next) => c.gdriveSearch(req, res, next));
router.post('/gdrive/import', (req, res, next) => c.gdriveImport(req, res, next));
router.get('/gdrive/recent', (req, res, next) => c.gdriveRecent(req, res, next));

// ─── Google Calendar ────────────────────────────────────────────────
router.get('/gcal/upcoming', (req, res, next) => c.gcalUpcoming(req, res, next));
router.get('/gcal/today', (req, res, next) => c.gcalToday(req, res, next));
router.post('/gcal/events', (req, res, next) => c.gcalCreateEvent(req, res, next));
router.post('/gcal/meeting-note', (req, res, next) => c.gcalMeetingNote(req, res, next));

// ─── Canva ──────────────────────────────────────────────────────────
router.get('/canva/designs', (req, res, next) => c.canvaList(req, res, next));
router.post('/canva/designs', (req, res, next) => c.canvaCreate(req, res, next));
router.post('/canva/export', (req, res, next) => c.canvaExport(req, res, next));

// ─── Cloudflare ─────────────────────────────────────────────────────
router.get('/cloudflare/status', (req, res, next) => c.cfStatus(req, res, next));
router.get('/cloudflare/r2', (req, res, next) => c.cfR2List(req, res, next));
router.post('/cloudflare/d1/query', (req, res, next) => c.cfD1Query(req, res, next));
router.get('/cloudflare/kv/:key', (req, res, next) => c.cfKvGet(req, res, next));
router.post('/cloudflare/kv', (req, res, next) => c.cfKvSet(req, res, next));

export default router;
