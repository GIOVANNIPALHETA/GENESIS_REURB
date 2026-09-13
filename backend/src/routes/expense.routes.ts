import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticate } from '../middlewares/authMiddleware';
import {
  listExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  listExpenseTypes,
  createExpenseType,
  updateExpenseType,
  deleteExpenseType,
  uploadExpenseAttachment,
  deleteExpenseAttachment,
  scanExpenseReceipt,
} from '../controllers/expense.controller';
import {
  listProfitBeneficiaries,
  createProfitBeneficiary,
  updateProfitBeneficiary,
  getProfitSummary,
  createProfitWithdrawal,
  listAsaasFees,
} from '../controllers/profit.controller';

const router = Router();

const uploadDirectory = path.resolve(process.cwd(), '../uploads/documents');
fs.mkdirSync(uploadDirectory, { recursive: true });
const upload = multer({ dest: uploadDirectory, limits: { fileSize: 25 * 1024 * 1024 } });

// Despesas CRUD
router.get('/', authenticate, listExpenses);
router.post('/', authenticate, createExpense);
router.put('/:id', authenticate, updateExpense);
router.delete('/:id', authenticate, deleteExpense);

// Comprovantes e Anexos
router.post('/:id/attachments', authenticate, upload.single('file'), uploadExpenseAttachment);
router.delete('/attachments/:attachmentId', authenticate, deleteExpenseAttachment);

// OCR / Leitura Inteligente de Comprovante
router.post('/scan-receipt', authenticate, upload.single('file'), scanExpenseReceipt);

// Tipos de Despesas
router.get('/types/list', authenticate, listExpenseTypes);
router.post('/types/list', authenticate, createExpenseType);
router.put('/types/list/:id', authenticate, updateExpenseType);
router.delete('/types/list/:id', authenticate, deleteExpenseType);

// Divisão de Lucros
router.get('/profit/beneficiaries', authenticate, listProfitBeneficiaries);
router.post('/profit/beneficiaries', authenticate, createProfitBeneficiary);
router.put('/profit/beneficiaries/:id', authenticate, updateProfitBeneficiary);
router.get('/profit/summary', authenticate, getProfitSummary);
router.post('/profit/withdrawals', authenticate, createProfitWithdrawal);

// Taxas do Asaas
router.get('/asaas-fees', authenticate, listAsaasFees);

export default router;
