import { Router } from 'express';
import { authenticateJWT } from '../../middleware/jwtAuth';
import {
  createCorrection,
  getCorrections,
  updateCorrection,
  deleteCorrection,
  getCorrectionStats,
  applyCorrections
} from './styleCorrectionsController';

const router = Router();

// All routes require authentication
router.use(authenticateJWT);

// Style corrections CRUD
router.post('/:id/style/corrections', createCorrection);
router.get('/:id/style/corrections', getCorrections);
router.put('/:id/style/corrections/:correctionId', updateCorrection);
router.delete('/:id/style/corrections/:correctionId', deleteCorrection);

// Correction analytics and application
router.get('/:id/style/corrections/stats', getCorrectionStats);
router.post('/:id/style/corrections/apply', applyCorrections);

export default router;
