import { Router } from 'express';
import { requireJWTFromCookie, extractJWTFromCookie } from '../middleware/jwtCookie';
import { generateCSRFToken } from '../middleware/csrf';
import * as chatPageController from '../controllers/chatPageController';

const router = Router();

// Redirect old chat/continue to enhanced-chat
router.get('/chat/continue', extractJWTFromCookie, (req: any, res: Response) => {
  res.redirect('/chat-enhanced');
});

// Redirect old chat/:id to enhanced-chat with chatId query param
router.get('/chat/:id', extractJWTFromCookie, (req: any, res: Response) => {
  res.redirect(`/chat-enhanced?chatId=${req.params.id}`);
});

// Redirect chat history to enhanced-chat
router.get('/chat/history', requireJWTFromCookie, generateCSRFToken, (req: any, res: Response) => {
  res.redirect('/chat-enhanced');
});

// Enhanced Chat page - KEEP THIS
router.get('/chat-enhanced', requireJWTFromCookie, generateCSRFToken, chatPageController.getChatEnhanced);

export default router;

