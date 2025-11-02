import { Router } from 'express';
import { extractJWTFromCookie } from '../middleware/jwtCookie';
import { generateCSRFToken } from '../middleware/csrf';
import * as publicPageController from '../controllers/publicPageController';
import { getPublicChatPage } from '../modules/twin/publicTwinController';

const router = Router();

// Landing page
router.get('/', generateCSRFToken, publicPageController.getLanding);

// Simple test page (no middleware)
router.get('/simple', publicPageController.getSimple);

// Public Profile page
router.get('/@:handle', extractJWTFromCookie, generateCSRFToken, publicPageController.getPublicProfile);

// Public Profile alternative route
router.get('/p/:handle', generateCSRFToken, publicPageController.getPublicProfileAlt);

// Public Chat page route (renders EJS view)
router.get('/public-twin/chat/:twinId', extractJWTFromCookie, generateCSRFToken, getPublicChatPage);

export default router;

