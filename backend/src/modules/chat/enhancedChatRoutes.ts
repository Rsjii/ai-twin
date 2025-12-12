import { Router } from 'express';
import { requireJWTFromCookie } from '../../middleware/jwtCookie';
import {
  generateEnhancedReply,
  applyStyleCorrection,
  getChatHistory,
  deleteMessagesAfter
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
router.get('/:chatToken', getChatHistory);
router.post('/:chatToken/enhanced-reply', generateEnhancedReply);
router.post('/:chatToken/style-correct', applyStyleCorrection);

// Feedback and regeneration endpoints
router.post('/:chatToken/regenerate', regenerateResponse);
router.post('/:chatToken/feedback', submitChatFeedback);
router.get('/:chatToken/feedback-status', getChatFeedbackStatus);
router.post('/:chatToken/adjust-tone', adjustTone);

// Delete messages after endpoint
router.delete('/:chatToken/delete-messages-after', deleteMessagesAfter);

export default router;