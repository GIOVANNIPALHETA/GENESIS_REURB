import { Router } from 'express';
import { authenticate } from '../middlewares/authMiddleware';
import { createContract, downloadContractDocument, listContracts, updateContractStatus, deleteContract } from '../controllers/contract.controller';

const router = Router();
router.get('/', authenticate, listContracts);
router.get('/:id/document', authenticate, downloadContractDocument);
router.post('/', authenticate, createContract);
router.patch('/:id/status', authenticate, updateContractStatus);
router.delete('/:id', authenticate, deleteContract);

export default router;