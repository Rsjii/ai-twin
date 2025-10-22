import { Router } from 'express';
import { extractJWTFromCookie } from '../../middleware/jwtCookie';
import {
  generateEnhancedReply,
  applyStyleCorrection,
  addToAnchors,
  getChatHistory
} from './enhancedChatController';

const router = Router();

// All routes require authentication
router.use(extractJWTFromCookie);

// Enhanced chat endpoints
router.get('/:id', getChatHistory);
router.post('/:id/enhanced-reply', generateEnhancedReply);
router.post('/:id/style-correct', applyStyleCorrection);
router.post('/:id/add-anchor', addToAnchors);

export default router;