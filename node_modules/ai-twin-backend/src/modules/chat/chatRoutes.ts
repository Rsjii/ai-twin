import { Router } from 'express';
import { startChat, getChat, getUserChats, generateDraft, sendMessage, getChatHistory, getChatMessages, continueChat, handleUserMessage } from './chatController';
import { requireJWTFromCookie } from '../../middleware/jwtCookie';
import { draftGenerationRateLimit } from '../../middleware/rateLimit';
import { generateCSRFToken, validateCSRF } from '../../middleware/csrf';
import { sanitizeInput } from '../../middleware/validation';
import { submitResponseFeedback, getFeedbackStats } from './feedbackController';

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

// Feedback endpoints
router.post('/:id/feedback', submitResponseFeedback);
router.get('/twin/:twinId/feedback-stats', getFeedbackStats);

export default router;
