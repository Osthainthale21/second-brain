import { Router } from 'express';
import { agentsController } from '../controllers/agents.controller';

const router = Router();

// GET  /api/agents/status       → ดูสถานะ agents ทั้งหมด
router.get('/status', (req, res, next) => agentsController.getStatus(req, res, next));

// POST /api/agents/:name/run    → รัน agent ด้วยมือ
router.post('/:name/run', (req, res, next) => agentsController.runAgent(req, res, next));

export default router;
