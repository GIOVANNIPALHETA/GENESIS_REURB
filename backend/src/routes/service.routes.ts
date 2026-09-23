import { Router } from 'express';
import { authenticate, authorize } from '../middlewares/authMiddleware';
import { createService, listServices } from '../controllers/service.controller';

const router = Router();
router.get('/', authenticate, listServices);
router.post('/', authenticate, authorize(['ADMIN', 'GESTOR', 'ATENDENTE', 'FINANCEIRO', 'DOCUMENTAL', 'JURIDICO']), createService);

export default router;