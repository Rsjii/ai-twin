import { Router } from 'express';
import { requireJWTFromCookie, extractJWTFromCookie } from '../middleware/jwtCookie';
import { generateCSRFToken } from '../middleware/csrf';
import * as chatPageController from '../controllers/chatPageController';

const router = Router();

// Chat Continue - redirect to chat with latest twin
router.get('/chat/continue', extractJWTFromCookie, chatPageController.getChatContinue);

// Chat page - Individual chat view
router.get('/chat/:id', extractJWTFromCookie, chatPageController.getChat);

// Chat History page
router.get('/chat/history', requireJWTFromCookie, generateCSRFToken, chatPageController.getChatHistory);

// Enhanced Chat page
router.get('/chat-enhanced', requireJWTFromCookie, generateCSRFToken, chatPageController.getChatEnhanced);

export default router;

