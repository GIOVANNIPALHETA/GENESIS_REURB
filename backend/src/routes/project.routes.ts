import { Router } from 'express';
import { authenticate, authorize } from '../middlewares/authMiddleware';
import { listProjects, createProject, updateProject, deleteProject, listProjectBlocks } from '../controllers/project.controller';

const router = Router();

router.get('/', authenticate, listProjects);
router.get('/:id/blocks', authenticate, listProjectBlocks);
router.post('/', authenticate, authorize(['ADMIN', 'GESTOR', 'ATENDENTE', 'FINANCEIRO', 'DOCUMENTAL', 'JURIDICO']), createProject);
router.put('/:id', authenticate, authorize(['ADMIN', 'GESTOR', 'ATENDENTE', 'FINANCEIRO', 'DOCUMENTAL', 'JURIDICO']), updateProject);
router.delete('/:id', authenticate, authorize(['ADMIN', 'GESTOR', 'ATENDENTE', 'FINANCEIRO', 'DOCUMENTAL', 'JURIDICO']), deleteProject);

export default router;
