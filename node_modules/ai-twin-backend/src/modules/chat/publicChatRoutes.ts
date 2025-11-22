import { Router } from 'express';
import { 
  startPublicChat, 
  sendPublicMessage, 
  getPublicChatHistory,
  getPublicChatByTwin,
  getPublicChatsByTwin,
  createNewPublicChat,
  getUserPublicChats,
  deletePublicChat,
  updatePublicChatTitle,
  getAllPublicChatsForTwin,
  viewPublicChatHistory,
  getUserWisePublicChats
} from './publicChatController';
import { requireJWTFromCookie, extractJWTFromCookie } from '../../middleware/jwtCookie';
import { publicChatRateLimit, publicChatRateLimitAuthenticated } from '../../middleware/rateLimit';

const router = Router();

// Public chat routes (no authentication required for basic functionality)
router.post('/start', extractJWTFromCookie, startPublicChat);

// Apply rate limiting: anonymous users get strict limit, authenticated get higher limit
router.post('/:chatId/message',
  extractJWTFromCookie, // Extract JWT to set req.user (optional, doesn't fail if no JWT)
  publicChatRateLimit, // First check: strict limit for anonymous (IP-based)
  publicChatRateLimitAuthenticated, // Then check: higher limit for authenticated
  sendPublicMessage
);

router.get('/:chatId/history', extractJWTFromCookie, getPublicChatHistory);
router.get('/twin/:twinId', getPublicChatByTwin);

router.get('/twin/:twinId/chats', extractJWTFromCookie, getPublicChatsByTwin); // Get all chats (optional JWT)
router.post('/create', extractJWTFromCookie, createNewPublicChat); // Create new chat (optional JWT)

// Add new route for twin owner to see all public chats
router.get('/twin/:twinId/all-chats', requireJWTFromCookie, getAllPublicChatsForTwin);

// Authenticated route - Get user's public chats
router.get('/user/my-chats', requireJWTFromCookie, getUserPublicChats);

// Delete public chat endpoint (with authentication)
router.delete('/:chatId', extractJWTFromCookie, deletePublicChat);

// Update public chat title endpoint (no authentication required)
router.put('/:chatId/title', updatePublicChatTitle);

// View public chat history endpoint
router.get('/:chatId/view-history', requireJWTFromCookie, viewPublicChatHistory);

router.get('/twin/:twinId/user-chats', requireJWTFromCookie, getUserWisePublicChats);

export default router;
