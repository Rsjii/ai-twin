import { Router } from 'express';
import { extractJWTFromCookie } from '../middleware/jwtCookie';
import { generateCSRFToken } from '../middleware/csrf';
import * as publicPageController from '../controllers/publicPageController';
import { getPublicChatPage } from '../modules/twin/publicTwinController';
import { getPublicChatHistoryPage } from '../controllers/publicChatHistoryPageController';

const router = Router();

// Landing page (extract user for header consistency)
router.get('/', extractJWTFromCookie, generateCSRFToken, publicPageController.getLanding);

// Simple test page (no middleware)
router.get('/simple', publicPageController.getSimple);

// Public Profile page
router.get('/@:handle', extractJWTFromCookie, generateCSRFToken, publicPageController.getPublicProfile);

// Public Profile alternative route (extract user for header consistency)
router.get('/p/:handle', extractJWTFromCookie, generateCSRFToken, publicPageController.getPublicProfileAlt);

// Public Chat page route (renders EJS view)
router.get('/public-twin/chat/:twinId', extractJWTFromCookie, generateCSRFToken, getPublicChatPage);

// Public Chat History page
router.get('/public-chat/history', extractJWTFromCookie, generateCSRFToken, getPublicChatHistoryPage);

router.get('/user/:handle', extractJWTFromCookie, generateCSRFToken, publicPageController.getUserProfile);

export default router;

