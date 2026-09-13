import { Router } from 'express';
import { authenticate } from '../middlewares/authMiddleware';
import { listProjects, createProject, updateProject, deleteProject, listProjectBlocks } from '../controllers/project.controller';

const router = Router();

router.get('/', authenticate, listProjects);
router.get('/:id/blocks', authenticate, listProjectBlocks);
router.post('/', authenticate, createProject);
router.put('/:id', authenticate, updateProject);
router.delete('/:id', authenticate, deleteProject);

export default router;
