import { Router } from 'express';
import { authenticate, authorize } from '../middlewares/authMiddleware';
import { listLots, getLotById, createLot, updateLot, deleteLot } from '../controllers/lot.controller';

const router = Router();

router.get('/', authenticate, listLots);
router.get('/:id', authenticate, getLotById);
router.post('/', authenticate, authorize(['ADMIN', 'GESTOR', 'ATENDENTE', 'FINANCEIRO', 'DOCUMENTAL', 'JURIDICO']), createLot);
router.put('/:id', authenticate, authorize(['ADMIN', 'GESTOR', 'ATENDENTE', 'FINANCEIRO', 'DOCUMENTAL', 'JURIDICO']), updateLot);
router.delete('/:id', authenticate, authorize(['ADMIN', 'GESTOR', 'ATENDENTE', 'FINANCEIRO', 'DOCUMENTAL', 'JURIDICO']), deleteLot);

export default router;
