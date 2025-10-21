import { Router } from 'express';
import { authenticateJWT } from '../../middleware/jwtAuth';
import {
  createAnchor,
  getAnchors,
  updateAnchor,
  deleteAnchor,
  autoSuggestAnchors,
  findSimilarAnchors
} from './styleAnchorsController';

const router = Router();

// All routes require authentication
router.use(authenticateJWT);

// Style anchors CRUD operations
router.post('/:id/style/anchors', createAnchor);
router.get('/:id/style/anchors', getAnchors);
router.put('/:id/style/anchors/:anchorId', updateAnchor);
router.delete('/:id/style/anchors/:anchorId', deleteAnchor);

// Auto-suggest anchors from chat history
router.post('/:id/style/anchors/auto-suggest', autoSuggestAnchors);

// Find similar anchors for a message
router.get('/:id/style/anchors/similar', findSimilarAnchors);

export default router;