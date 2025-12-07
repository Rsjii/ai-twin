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
import { tokenizeId, sanitizeTwin, sanitizePublicChat } from '../../utils/idTokenization';

const router = Router();

// Public chat routes (no authentication required for basic functionality)
router.post('/start', extractJWTFromCookie, startPublicChat);

// Apply rate limiting: anonymous users get strict limit, authenticated get higher limit
router.post('/:chatToken/message',
  extractJWTFromCookie, // Extract JWT to set req.user (optional, doesn't fail if no JWT)
  publicChatRateLimit, // First check: strict limit for anonymous (IP-based)
  publicChatRateLimitAuthenticated, // Then check: higher limit for authenticated
  sendPublicMessage
);

router.get('/:chatToken/history', extractJWTFromCookie, getPublicChatHistory);
// ✅ PHASE 2: Change :twinId to :twinToken
router.get('/twin/:twinToken', extractJWTFromCookie, getPublicChatByTwin);

router.get('/twin/:twinToken/chats', extractJWTFromCookie, getPublicChatsByTwin); // Get all chats (optional JWT)
router.post('/create', extractJWTFromCookie, createNewPublicChat); // Create new chat (optional JWT)

// Add new route for twin owner to see all public chats
router.get('/twin/:twinToken/all-chats', requireJWTFromCookie, getAllPublicChatsForTwin);

// Authenticated route - Get user's public chats
router.get('/user/my-chats', requireJWTFromCookie, getUserPublicChats);

// Delete public chat endpoint (with authentication)
router.delete('/:chatToken', extractJWTFromCookie, deletePublicChat);

// Update public chat title endpoint (no authentication required)
router.put('/:chatToken/title', updatePublicChatTitle);

// View public chat history endpoint
router.get('/:chatToken/view-history', requireJWTFromCookie, viewPublicChatHistory);

router.get('/twin/:twinToken/user-chats', requireJWTFromCookie, getUserWisePublicChats);

export default router;
