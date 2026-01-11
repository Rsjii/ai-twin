import { Router } from 'express';
import { requireJWTFromCookie } from '../../middleware/jwtCookie';
import { checkTokenQuotaForEnhancedChat } from '../../middleware/tokenQuotaMiddleware';
import { enhancedChatReplyRateLimit } from '../../middleware/rateLimit';
import { generateCSRFToken, validateCSRF } from '../../middleware/csrf';
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

// All routes require authentication and CSRF protection
router.use(requireJWTFromCookie);
router.use(generateCSRFToken);
// ✅ CSRF should protect state-changing requests only (NOT GET/HEAD/OPTIONS)
router.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  return validateCSRF(req, res, next);
});

// Enhanced chat endpoints
router.get('/:chatToken', getChatHistory);
router.post('/:chatToken/enhanced-reply', enhancedChatReplyRateLimit, checkTokenQuotaForEnhancedChat, generateEnhancedReply);
router.post('/:chatToken/style-correct', applyStyleCorrection);

// Feedback and regeneration endpoints
router.post('/:chatToken/regenerate', regenerateResponse);
router.post('/:chatToken/feedback', submitChatFeedback);
router.get('/:chatToken/feedback-status', getChatFeedbackStatus);
router.post('/:chatToken/adjust-tone', adjustTone);

// Delete messages after endpoint
router.delete('/:chatToken/delete-messages-after', deleteMessagesAfter);

export default router;