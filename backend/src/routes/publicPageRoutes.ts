import { Router } from 'express';
import { generateCSRFToken } from '../middleware/csrf';
import * as publicPageController from '../controllers/publicPageController';
import { getPublicChatPage } from '../modules/twin/publicTwinController';
import { getPublicChatHistoryPage } from '../controllers/publicChatHistoryPageController';

const router = Router();

// Landing page (extract user for header consistency)
router.get('/', generateCSRFToken, publicPageController.getLanding);

// Simple test page (no middleware)
router.get('/simple', publicPageController.getSimple);

// Public Profile page
router.get('/@:handle', generateCSRFToken, publicPageController.getPublicProfile);

// Public Profile alternative route (extract user for header consistency)
router.get('/p/:handle', generateCSRFToken, publicPageController.getPublicProfileAlt);

// Public Chat page route (renders EJS view)
router.get('/public-twin/chat/:twinToken', generateCSRFToken, getPublicChatPage);

// Public Chat History page
router.get('/public-chat/history', generateCSRFToken, getPublicChatHistoryPage);

router.get('/user/:handle', generateCSRFToken, publicPageController.getUserProfile);

export default router;

