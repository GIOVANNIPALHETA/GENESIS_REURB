import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { chatHandler, chatStreamHandler, statusHandler } from '../controllers/ai.controller';
import { authenticate } from '../middlewares/authMiddleware';

const router = Router();

const uploadDirectory = path.resolve(process.cwd(), '../uploads/documents');
fs.mkdirSync(uploadDirectory, { recursive: true });
const upload = multer({ dest: uploadDirectory, limits: { fileSize: 25 * 1024 * 1024 } });

// Endpoints protegidos por token de autenticação
router.use(authenticate);

router.get('/status', statusHandler);
router.post('/chat', upload.single('file'), chatHandler);
router.post('/chat/stream', chatStreamHandler);

export default router;
