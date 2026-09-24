import { Router } from 'express';
import {
  getReportCategories,
  getReportData,
  exportReportExcel,
  exportReportPDF
} from '../controllers/reports.controller';
import { authenticate } from '../middlewares/authMiddleware';

const router = Router();

// Apply authentication middleware to all report endpoints
router.use(authenticate);

router.get('/categories', getReportCategories);
router.get('/data', getReportData);
router.get('/export/excel', exportReportExcel);
router.get('/export/pdf', exportReportPDF);

export default router;
