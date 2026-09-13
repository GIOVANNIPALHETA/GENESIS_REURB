import { Router } from 'express';
import { authenticate } from '../middlewares/authMiddleware';
import { createBlock, createBlocksBulk, deleteBlock, listBlocks, updateBlock } from '../controllers/block.controller';

const router = Router();
router.use(authenticate);
router.get('/', listBlocks);
router.post('/', createBlock);
router.post('/bulk', createBlocksBulk);
router.put('/:id', updateBlock);
router.delete('/:id', deleteBlock);

export default router;