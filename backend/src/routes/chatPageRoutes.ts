import { Router, Response } from 'express';
import { requireJWTFromCookie, extractJWTFromCookie } from '../middleware/jwtCookie';
import { generateCSRFToken } from '../middleware/csrf';
import * as chatPageController from '../controllers/chatPageController';
import { tokenizeId } from '../utils/idTokenization';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

// Redirect old chat/continue to enhanced-chat
router.get('/chat/continue', extractJWTFromCookie, (req: any, res: Response) => {
  res.redirect('/chat-enhanced');
});

// Redirect old chat/:id to enhanced-chat with chatId query param
router.get('/chat/:id', extractJWTFromCookie, (req: any, res: Response) => {
  // Legacy route: convert raw ID to token
  const chatToken = tokenizeId(req.params.id, 'chat');
  res.redirect(`/chat-enhanced/${chatToken}`);
});

// Redirect chat history to enhanced-chat
router.get('/chat/history', requireJWTFromCookie, generateCSRFToken, (req: any, res: Response) => {
  res.redirect('/chat-enhanced');
});

// Enhanced Chat page - default (no chat specified)
router.get('/chat-enhanced', requireJWTFromCookie, generateCSRFToken, asyncHandler(chatPageController.getChatEnhanced));

// NEW: deep-linkable per-chat URL (tokenized chatId in path)
router.get('/chat-enhanced/:chatToken', requireJWTFromCookie, generateCSRFToken, asyncHandler(chatPageController.getChatEnhanced));

export default router;

