import { Router } from 'express';
import { authenticate } from '../middlewares/authMiddleware';
import { createService, listServices } from '../controllers/service.controller';

const router = Router();
router.get('/', authenticate, listServices);
router.post('/', authenticate, createService);

export default router;