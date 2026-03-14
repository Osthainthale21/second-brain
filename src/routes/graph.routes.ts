import { Router } from 'express';
import { graphController } from '../controllers/graph.controller';

const router = Router();

// GET /api/graph/neighbors/:id?depth=2  → หาโน้ตที่เชื่อมโยงกัน
router.get('/neighbors/:id', (req, res, next) => graphController.getNeighbors(req, res, next));

// GET /api/graph/map?limit=100&tag=ai   → ดูแผนที่ความรู้ทั้งหมด
router.get('/map', (req, res, next) => graphController.getMap(req, res, next));

// POST /api/graph/find-by-tags          → หาโน้ตตาม tags (graph-based)
router.post('/find-by-tags', (req, res, next) => graphController.findByTags(req, res, next));

// POST /api/graph/relationship          → สร้างความสัมพันธ์ระหว่างโน้ต
router.post('/relationship', (req, res, next) => graphController.addRelationship(req, res, next));

// GET /api/graph/stats                  → ดูสถิติ graph
router.get('/stats', (req, res, next) => graphController.getStats(req, res, next));

export default router;
