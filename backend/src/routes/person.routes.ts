import { Router } from 'express';
import { authenticate, authorize } from '../middlewares/authMiddleware';
import { listPeople, createPerson, updatePerson, deletePerson } from '../controllers/person.controller';

const router = Router();
router.get('/', authenticate, listPeople);
router.post('/', authenticate, authorize(['ADMIN', 'GESTOR', 'ATENDENTE', 'FINANCEIRO', 'DOCUMENTAL', 'JURIDICO']), createPerson);
router.put('/:id', authenticate, authorize(['ADMIN', 'GESTOR', 'ATENDENTE', 'FINANCEIRO', 'DOCUMENTAL', 'JURIDICO']), updatePerson);
router.delete('/:id', authenticate, authorize(['ADMIN', 'GESTOR', 'ATENDENTE', 'FINANCEIRO', 'DOCUMENTAL', 'JURIDICO']), deletePerson);

export default router;