import { Router } from 'express';
import { requireJWTFromCookie } from '../../middleware/jwtCookie';
import {
  generateEnhancedReply,
  applyStyleCorrection,
  addToAnchors,
  getChatHistory
} from './enhancedChatController';
import {
  submitChatFeedback,
  regenerateResponse,
  getChatFeedbackStatus,
  adjustTone
} from './feedbackController';

const router = Router();

// All routes require authentication
router.use(requireJWTFromCookie);

// Enhanced chat endpoints
router.get('/:id', getChatHistory);
router.post('/:id/enhanced-reply', generateEnhancedReply);
router.post('/:id/style-correct', applyStyleCorrection);
router.post('/:id/add-anchor', addToAnchors);

// Feedback and regeneration endpoints
router.post('/:chatId/regenerate', regenerateResponse);
router.post('/:chatId/feedback', submitChatFeedback);
router.get('/:chatId/feedback-status', getChatFeedbackStatus);
router.post('/:chatId/adjust-tone', adjustTone);

export default router;