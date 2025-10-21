import { Router } from 'express';
import { authenticateJWT } from '../../middleware/jwtAuth';
import {
  generateEnhancedReply,
  applyStyleCorrection,
  addToAnchors
} from './enhancedChatController';

const router = Router();

// All routes require authentication
router.use(authenticateJWT);

// Enhanced chat endpoints
router.post('/:id/enhanced-reply', generateEnhancedReply);
router.post('/:id/style-correct', applyStyleCorrection);
router.post('/:id/add-anchor', addToAnchors);

export default router;