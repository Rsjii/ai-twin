import { Router } from 'express';
import { startChat, getChat, getUserChats, generateDraft, sendMessage, getChatHistory, getChatMessages, continueChat, handleUserMessage, deleteChat } from './privateChatController';
import { requireJWTFromCookie } from '../../middleware/jwtCookie';
import { draftGenerationRateLimit, privateChatMessageRateLimit } from '../../middleware/rateLimit';
import { checkTokenQuotaForPrivateChatMessage } from '../../middleware/tokenQuotaMiddleware';
import { generateCSRFToken, validateCSRF } from '../../middleware/csrf';
import { sanitizeInput } from '../../middleware/validation';
import { submitResponseFeedback, getFeedbackStats, submitChatFeedback, regenerateResponse } from './feedbackController';

const router = Router();

// Apply authentication and CSRF protection
router.use(requireJWTFromCookie);
router.use(generateCSRFToken);

// Chat routes
router.post('/start', sanitizeInput, validateCSRF, startChat);
router.post('/continue', sanitizeInput, validateCSRF, continueChat);
router.get('/history', getChatHistory);
router.get('/', getUserChats);
router.get('/:chatToken', getChat);
router.get('/:chatToken/messages', getChatMessages);
router.post('/:chatToken/draft', sanitizeInput, validateCSRF, draftGenerationRateLimit, generateDraft);
router.post('/:chatToken/send', sanitizeInput, validateCSRF, sendMessage);
router.post('/:chatToken/message', sanitizeInput, privateChatMessageRateLimit, checkTokenQuotaForPrivateChatMessage, handleUserMessage);

// Delete chat endpoint
router.delete('/:chatToken', sanitizeInput, validateCSRF, deleteChat);

// Feedback endpoints
router.post('/:chatToken/feedback', submitResponseFeedback);
router.post('/:chatToken/feedback', submitChatFeedback);
router.post('/:chatToken/regenerate', regenerateResponse);
router.get('/twin/:twinId/feedback-stats', getFeedbackStats);

export default router;
