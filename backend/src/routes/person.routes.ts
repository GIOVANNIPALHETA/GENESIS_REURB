import { Router } from 'express';
import { authenticate } from '../middlewares/authMiddleware';
import { listPeople, createPerson, updatePerson, deletePerson } from '../controllers/person.controller';

const router = Router();
router.get('/', authenticate, listPeople);
router.post('/', authenticate, createPerson);
router.put('/:id', authenticate, updatePerson);
router.delete('/:id', authenticate, deletePerson);

export default router;