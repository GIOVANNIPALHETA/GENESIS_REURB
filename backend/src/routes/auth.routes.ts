import { Router } from 'express';
import { login } from '../controllers/auth.controller';

const router = Router();

router.post('/login', (req, res, next) => { login(req, res).catch(next); });

export default router;
