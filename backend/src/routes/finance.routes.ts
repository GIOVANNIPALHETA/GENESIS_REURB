import fs from 'fs';
import path from 'path';
import { Router } from 'express';
import multer from 'multer';
import { authenticate, authorize } from '../middlewares/authMiddleware';
import {
  cancelInstallment,
  cancelPayment,
  createExpense,
  createManualPayment,
  deleteInstallment,
  listAccounts,
  listExpenses,
  listHistory,
  listInstallments,
  registerPayment,
  updateInstallment,
  updatePayment,
} from '../controllers/finance.controller';
import {
  handleAsaasWebhook,
  syncAsaasSpreadsheet,
} from '../controllers/asaas-sync.controller';

const uploadMemory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const receiptDir = path.resolve(process.cwd(), '../uploads/documents');
fs.mkdirSync(receiptDir, { recursive: true });

const uploadReceipt = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, receiptDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `comprovante-${Date.now()}-${Math.random().toString(36).substring(7)}${ext}`);
    },
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
});

const router = Router();
router.get('/installments', authenticate, listInstallments);
router.post('/payments', authenticate, authorize(['ADMIN', 'GESTOR', 'FINANCEIRO']), uploadReceipt.single('receipt'), createManualPayment);
router.post('/installments/:id/payments', authenticate, authorize(['ADMIN', 'GESTOR', 'FINANCEIRO']), uploadReceipt.single('receipt'), registerPayment);
router.put('/payments/:paymentId', authenticate, authorize(['ADMIN', 'GESTOR', 'FINANCEIRO']), uploadReceipt.single('receipt'), updatePayment);
router.delete('/payments/:paymentId', authenticate, authorize(['ADMIN', 'GESTOR', 'FINANCEIRO']), cancelPayment);
router.put('/installments/:id', authenticate, authorize(['ADMIN', 'GESTOR', 'FINANCEIRO']), uploadReceipt.single('receipt'), updateInstallment);
router.delete('/installments/:id', authenticate, authorize(['ADMIN', 'GESTOR', 'FINANCEIRO']), deleteInstallment);
router.get('/history/:id', authenticate, listHistory);
router.get('/accounts', authenticate, listAccounts);
router.get('/expenses', authenticate, listExpenses);
router.post('/expenses', authenticate, authorize(['ADMIN', 'GESTOR', 'FINANCEIRO']), createExpense);

// Asaas Automation Routes
router.post('/asaas/sync', authenticate, authorize(['ADMIN', 'GESTOR', 'FINANCEIRO']), uploadMemory.single('file'), syncAsaasSpreadsheet);
router.post('/asaas/webhook', handleAsaasWebhook);

export default router;