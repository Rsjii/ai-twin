import { Router } from 'express';
import { startChat, getChat, getUserChats, generateDraft, sendMessage, getChatHistory, getChatMessages, continueChat } from './chatController';
import { requireAuth } from '../../middleware/auth';
import { draftGenerationRateLimit } from '../../middleware/rateLimit';
import { generateCSRFToken, validateCSRF } from '../../middleware/csrf';
import { sanitizeInput } from '../../middleware/validation';

const router = Router();

// Apply authentication and CSRF protection
router.use(requireAuth);
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

export default router;
