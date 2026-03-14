import { Router } from 'express';
import { notesController } from '../controllers/notes.controller';
import { validateCreateNote, validateUpdateNote } from '../middleware/validate';

const router = Router();

router.post('/', validateCreateNote, (req, res, next) => notesController.create(req, res, next));
router.get('/', (req, res, next) => notesController.getAll(req, res, next));
router.get('/tags', (req, res, next) => notesController.getTags(req, res, next));
router.get('/:id', (req, res, next) => notesController.getById(req, res, next));
router.put('/:id', validateUpdateNote, (req, res, next) => notesController.update(req, res, next));
router.delete('/:id', (req, res, next) => notesController.delete(req, res, next));

export default router;
