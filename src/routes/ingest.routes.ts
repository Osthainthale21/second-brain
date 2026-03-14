import { Router } from 'express';
import { ingestController } from '../controllers/ingest.controller';

const router = Router();

// POST /api/ingest/url     → Scrape URL + summarize + create note
router.post('/url', (req, res, next) => ingestController.ingestUrl(req, res, next));

// POST /api/ingest/text    → Create note with auto-tagging
router.post('/text', (req, res, next) => ingestController.ingestText(req, res, next));

// POST /api/ingest/voice   → Transcribe voice + create note
router.post('/voice', (req, res, next) => ingestController.ingestVoice(req, res, next));

export default router;
