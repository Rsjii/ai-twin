import { Router, Response } from 'express';
import { requireJWTFromCookie, extractJWTFromCookie } from '../middleware/jwtCookie';
import { generateCSRFToken } from '../middleware/csrf';
import * as chatPageController from '../controllers/chatPageController';
import { tokenizeId } from '../utils/idTokenization';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

// ✅ NEW canonical: /chat
router.get('/chat', requireJWTFromCookie, generateCSRFToken, asyncHandler(chatPageController.getChatEnhanced));
router.get('/chat/:chatToken', requireJWTFromCookie, generateCSRFToken, asyncHandler(chatPageController.getChatEnhanced));

// ✅ Keep old /chat-enhanced but redirect to /chat (backward compatibility)
router.get('/chat-enhanced', requireJWTFromCookie, (req: any, res: Response) => {
  return res.redirect('/chat');
});
router.get('/chat-enhanced/:chatToken', requireJWTFromCookie, (req: any, res: Response) => {
  return res.redirect(`/chat/${req.params.chatToken}`);
});

// ✅ Keep "continue/history" redirect to canonical /chat
router.get('/chat/continue', extractJWTFromCookie, (_req: any, res: Response) => res.redirect('/chat'));
router.get('/chat/history', requireJWTFromCookie, generateCSRFToken, (_req: any, res: Response) => res.redirect('/chat'));

// Legacy route: redirect old /chat/:id (raw ID) to /chat/:token
router.get('/chat/:id', extractJWTFromCookie, (req: any, res: Response) => {
  // Only redirect if it's not already a token (tokens are longer, IDs are shorter)
  // If it looks like a raw ID, convert to token and redirect
  if (req.params.id && req.params.id.length < 20) {
    const chatToken = tokenizeId(req.params.id, 'chat');
    return res.redirect(`/chat/${chatToken}`);
  }
  // Otherwise, let the /chat/:chatToken route handle it
  return res.redirect(`/chat/${req.params.id}`);
});

export default router;

