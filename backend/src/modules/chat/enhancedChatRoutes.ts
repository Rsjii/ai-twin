import express from 'express';
import { sendEnhancedMessage, startEnhancedChat } from './enhancedChatController';
import { requireJWTFromCookie } from '../../middleware/jwtCookie';
import { generateCSRFToken } from '../../middleware/csrf';

const router = express.Router();

// Enhanced chat routes with persona data
router.post('/start-enhanced', 
  requireJWTFromCookie,
  generateCSRFToken,
  startEnhancedChat
);

router.post('/:id/send-enhanced', 
  requireJWTFromCookie,
  generateCSRFToken,
  sendEnhancedMessage
);

export default router;
