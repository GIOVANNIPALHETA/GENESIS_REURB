import { Router } from 'express';
import { chatHandler, statusHandler } from '../controllers/ai.controller';
import { authenticate } from '../middlewares/authMiddleware';

const router = Router();

// Endpoints protegidos por token de autenticação
router.use(authenticate);

router.get('/status', statusHandler);
router.post('/chat', chatHandler);

export default router;
