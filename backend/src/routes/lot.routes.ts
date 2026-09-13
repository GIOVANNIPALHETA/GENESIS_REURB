import { Router } from 'express';
import { authenticate } from '../middlewares/authMiddleware';
import { listLots, getLotById, createLot, updateLot, deleteLot } from '../controllers/lot.controller';

const router = Router();

router.get('/', authenticate, listLots);
router.get('/:id', authenticate, getLotById);
router.post('/', authenticate, createLot);
router.put('/:id', authenticate, updateLot);
router.delete('/:id', authenticate, deleteLot);

export default router;
