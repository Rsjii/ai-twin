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
import { publicChatRateLimit, publicChatRateLimitAuthenticated } from '../../middleware/rateLimit';

const router = Router();

// Public chat routes (no authentication required for basic functionality)
router.post('/start', startPublicChat);

// Apply rate limiting: anonymous users get strict limit, authenticated get higher limit
router.post('/:chatId/message',
  extractJWTFromCookie, // Extract JWT to set req.user (optional, doesn't fail if no JWT)
  publicChatRateLimit, // First check: strict limit for anonymous (IP-based)
  publicChatRateLimitAuthenticated, // Then check: higher limit for authenticated
  sendPublicMessage
);

router.get('/:chatId/history', getPublicChatHistory);
router.get('/twin/:twinId', getPublicChatByTwin);

router.get('/twin/:twinId/chats', extractJWTFromCookie, getPublicChatsByTwin); // Get all chats (optional JWT)
router.post('/create', extractJWTFromCookie, createNewPublicChat); // Create new chat (optional JWT)

// Authenticated route - Get user's public chats
router.get('/user/my-chats', requireJWTFromCookie, getUserPublicChats);

export default router;
