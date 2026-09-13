import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { authenticate } from '../middlewares/authMiddleware';
import { createDocument, listDocumentTypes, listDocuments, updateDocumentStatus, deleteDocument, syncDrive, getDossiersControl } from '../controllers/document.controller';

const router = Router();
const uploadDirectory = path.resolve(process.cwd(), '../uploads/documents');
fs.mkdirSync(uploadDirectory, { recursive: true });
const upload = multer({ dest: uploadDirectory, limits: { fileSize: 25 * 1024 * 1024 } });

router.get('/types', authenticate, listDocumentTypes);
router.get('/dossiers', authenticate, getDossiersControl);
router.get('/', authenticate, listDocuments);
router.post('/sync-drive', authenticate, syncDrive);
router.post('/', authenticate, upload.single('file'), createDocument);
router.patch('/:id/status', authenticate, updateDocumentStatus);
router.delete('/:id', authenticate, deleteDocument);

export default router;