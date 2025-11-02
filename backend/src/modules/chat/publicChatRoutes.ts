import { Router } from 'express';
import { 
  startPublicChat, 
  sendPublicMessage, 
  getPublicChatHistory,
  getPublicChatByTwin,
  getPublicChatsByTwin,
  createNewPublicChat,
  getUserPublicChats  // ADD THIS
} from './publicChatController';
import { optionalJWT } from '../../middleware/jwtAuth';
import { requireJWTFromCookie, extractJWTFromCookie } from '../../middleware/jwtCookie';

const router = Router();

// Public chat routes (no authentication required for basic functionality)
router.post('/start', startPublicChat);
router.post('/:chatId/message', sendPublicMessage);
router.get('/:chatId/history', getPublicChatHistory);
router.get('/twin/:twinId', getPublicChatByTwin);

router.get('/twin/:twinId/chats', extractJWTFromCookie, getPublicChatsByTwin); // Get all chats (optional JWT)
router.post('/create', extractJWTFromCookie, createNewPublicChat); // Create new chat (optional JWT)

// Authenticated route - Get user's public chats
router.get('/user/my-chats', requireJWTFromCookie, getUserPublicChats);

export default router;
