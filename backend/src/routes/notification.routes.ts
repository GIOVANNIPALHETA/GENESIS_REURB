import { Router } from 'express';
import { authenticate } from '../middlewares/authMiddleware';
import {
  getWhatsAppNotificationConfigHandler,
  updateWhatsAppNotificationConfigHandler,
  testWhatsAppNotificationHandler,
} from '../controllers/notification.controller';

const router = Router();

router.get('/whatsapp/config', authenticate, getWhatsAppNotificationConfigHandler);
router.put('/whatsapp/config', authenticate, updateWhatsAppNotificationConfigHandler);
router.post('/whatsapp/test', authenticate, testWhatsAppNotificationHandler);

export default router;
