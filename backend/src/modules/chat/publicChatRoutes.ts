import { Router } from 'express';
import { 
  startPublicChat, 
  sendPublicMessage, 
  getPublicChatHistory,
  getPublicChatByTwin 
} from './publicChatController';
import { optionalJWT } from '../../middleware/jwtAuth';

const router = Router();

// Public chat routes (no authentication required for basic functionality)
router.post('/start', startPublicChat);
router.post('/:chatId/message', sendPublicMessage);
router.get('/:chatId/history', getPublicChatHistory);
router.get('/twin/:twinId', getPublicChatByTwin);

export default router;
