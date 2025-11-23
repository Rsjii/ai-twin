import { Router } from 'express';
import { startChat, getChat, getUserChats, generateDraft, sendMessage, getChatHistory, getChatMessages, continueChat, handleUserMessage, deleteChat } from './privateChatController';
import { requireJWTFromCookie } from '../../middleware/jwtCookie';
import { draftGenerationRateLimit } from '../../middleware/rateLimit';
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
router.get('/:id', getChat);
router.get('/:id/messages', getChatMessages);
router.post('/:id/draft', sanitizeInput, validateCSRF, draftGenerationRateLimit, generateDraft);
router.post('/:id/send', sanitizeInput, validateCSRF, sendMessage);
router.post('/:id/message', sanitizeInput, handleUserMessage);

// Delete chat endpoint
router.delete('/:id', sanitizeInput, validateCSRF, deleteChat);

// Feedback endpoints
router.post('/:id/feedback', submitResponseFeedback);
router.post('/:chatId/feedback', submitChatFeedback);
router.post('/:chatId/regenerate', regenerateResponse);
router.get('/twin/:twinId/feedback-stats', getFeedbackStats);

export default router;
