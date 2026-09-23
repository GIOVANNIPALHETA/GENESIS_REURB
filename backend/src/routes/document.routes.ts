import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { authenticate, authorize } from '../middlewares/authMiddleware';
import { createDocument, listDocumentTypes, listDocuments, updateDocumentStatus, deleteDocument, syncDrive, getDossiersControl } from '../controllers/document.controller';
import { analyzeScannedDocument, uploadScannedDocument } from '../controllers/documentScanner.controller';

const router = Router();
const uploadDirectory = path.resolve(process.cwd(), '../uploads/documents');
fs.mkdirSync(uploadDirectory, { recursive: true });
const upload = multer({ dest: uploadDirectory, limits: { fileSize: 25 * 1024 * 1024 } });

router.get('/types', authenticate, listDocumentTypes);
router.get('/dossiers', authenticate, getDossiersControl);
router.get('/', authenticate, listDocuments);
router.post('/sync-drive', authenticate, authorize(['ADMIN', 'GESTOR', 'DOCUMENTAL']), syncDrive);
router.post('/scan/analyze', authenticate, analyzeScannedDocument);
router.post('/scan/upload', authenticate, authorize(['ADMIN', 'GESTOR', 'DOCUMENTAL', 'JURIDICO', 'ATENDENTE']), upload.array('files', 10), uploadScannedDocument);
router.post('/', authenticate, authorize(['ADMIN', 'GESTOR', 'DOCUMENTAL', 'JURIDICO', 'ATENDENTE']), upload.single('file'), createDocument);
router.patch('/:id/status', authenticate, authorize(['ADMIN', 'GESTOR', 'DOCUMENTAL', 'JURIDICO']), updateDocumentStatus);
router.delete('/:id', authenticate, authorize(['ADMIN', 'GESTOR', 'DOCUMENTAL']), deleteDocument);

export default router;