import { Router } from 'express';
import { adminController } from '../controllers/admin.controller';
import { requireMasterKey } from '../middleware/auth';
import { adminLimiter } from '../middleware/rateLimiter';

const router = Router();
const c = adminController;

// ─── Health (public) ────────────────────────────────────────────────
router.get('/health', (req, res, next) => c.healthDeep(req, res, next));

// ─── Vault Stats (auth required) ───────────────────────────────────
router.get('/vault/stats', (req, res, next) => c.getVaultStats(req, res, next));

// ─── Backup (master key required) ──────────────────────────────────
router.post('/backup', adminLimiter, requireMasterKey, (req, res, next) => c.createBackup(req, res, next));
router.get('/backup', requireMasterKey, (req, res, next) => c.listBackups(req, res, next));
router.post('/backup/restore', adminLimiter, requireMasterKey, (req, res, next) => c.restoreBackup(req, res, next));
router.delete('/backup/:name', requireMasterKey, (req, res, next) => c.deleteBackup(req, res, next));

// ─── Export ─────────────────────────────────────────────────────────
router.post('/export/note', (req, res, next) => c.exportNote(req, res, next));
router.post('/export/bulk', (req, res, next) => c.exportBulk(req, res, next));
router.get('/export', (req, res, next) => c.listExports(req, res, next));
router.get('/export/download/:fileName', (req, res, next) => c.downloadExport(req, res, next));
router.delete('/export/:fileName', (req, res, next) => c.deleteExport(req, res, next));

export default router;
