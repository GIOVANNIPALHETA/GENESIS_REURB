import { Router } from 'express';
import { authenticate, authorize } from '../middlewares/authMiddleware';
import { createUser, deleteUser, getUsers, updateUser } from '../controllers/user.controller';

const router = Router();

router.get('/', authenticate, authorize(['ADMIN']), getUsers);
router.post('/', authenticate, authorize(['ADMIN']), createUser);
router.put('/:id', authenticate, authorize(['ADMIN']), updateUser);
router.delete('/:id', authenticate, authorize(['ADMIN']), deleteUser);

export default router;
