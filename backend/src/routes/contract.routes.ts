import { Router } from 'express';
import { authenticate, authorize } from '../middlewares/authMiddleware';
import { createContract, downloadContractDocument, listContracts, updateContractStatus, deleteContract } from '../controllers/contract.controller';

const router = Router();
router.get('/', authenticate, listContracts);
router.get('/:id/document', authenticate, downloadContractDocument);
router.post('/', authenticate, authorize(['ADMIN', 'GESTOR', 'ATENDENTE', 'FINANCEIRO', 'DOCUMENTAL', 'JURIDICO']), createContract);
router.patch('/:id/status', authenticate, authorize(['ADMIN', 'GESTOR', 'ATENDENTE', 'FINANCEIRO', 'DOCUMENTAL', 'JURIDICO']), updateContractStatus);
router.delete('/:id', authenticate, authorize(['ADMIN', 'GESTOR', 'ATENDENTE', 'FINANCEIRO', 'DOCUMENTAL', 'JURIDICO']), deleteContract);

export default router;