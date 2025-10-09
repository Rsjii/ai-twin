import { Router } from 'express';
import { startChat, getChat, getUserChats, getChatHistory, getOrCreateChat, generateDraft, sendMessage } from './chatController';
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
router.get('/', getUserChats);
router.get('/history', getChatHistory);
router.get('/twin/:twinId', getOrCreateChat);
router.get('/:id', getChat);
router.post('/:id/draft', sanitizeInput, validateCSRF, draftGenerationRateLimit, generateDraft);
router.post('/:id/send', sanitizeInput, validateCSRF, sendMessage);

export default router;
