import { Router } from 'express';
import { authenticate, authorize } from '../middlewares/authMiddleware';
import * as mapController from '../controllers/map.controller';

const router = Router();

// Public tile serving endpoint (for Leaflet <img> tags)
router.get('/tiles/:projectSlug/:z/:x/:y', mapController.getMapTile);

// Authenticated map data endpoints
router.get('/projects', authenticate, mapController.getProjectsWithMap);
router.get('/:projectId', authenticate, mapController.getProjectMap);

// Lot linking endpoints (admin/gestor/documental)
router.post(
  '/:projectId/link-lot',
  authenticate,
  authorize(['ADMIN', 'GESTOR', 'DOCUMENTAL', 'FINANCEIRO']),
  mapController.linkLot
);

router.post(
  '/:projectId/unlink-lot',
  authenticate,
  authorize(['ADMIN', 'GESTOR', 'DOCUMENTAL', 'FINANCEIRO']),
  mapController.unlinkLot
);

export default router;

