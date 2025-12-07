import { Router } from 'express';
import { generateCSRFToken } from '../middleware/csrf';
import * as publicPageController from '../controllers/publicPageController';
import { getPublicChatPage } from '../modules/twin/publicTwinController';
import { getPublicChatHistoryPage } from '../controllers/publicChatHistoryPageController';
import { getMyProfile } from '../controllers/publicPageController';
import { requireJWTFromCookie } from '../middleware/jwtCookie';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

// Landing page (extract user for header consistency)
router.get('/', generateCSRFToken, asyncHandler(publicPageController.getLanding));

// Simple test page (no middleware)
router.get('/simple', asyncHandler(publicPageController.getSimple));

// Public Profile page
router.get('/@:handle', generateCSRFToken, asyncHandler(publicPageController.getPublicProfile));

// Public Profile alternative route (extract user for header consistency)
router.get('/p/:handle', generateCSRFToken, asyncHandler(publicPageController.getPublicProfileAlt));

// Public Chat page route (renders EJS view)
router.get('/public-twin/chat/:twinToken', generateCSRFToken, asyncHandler(getPublicChatPage));

// NEW: Deep-link directly to a specific public chat thread
router.get('/public-twin/chat/:twinToken/:chatToken', generateCSRFToken, asyncHandler(getPublicChatPage));

// Public Chat History page
router.get('/public-chat/history', generateCSRFToken, asyncHandler(getPublicChatHistoryPage));

// DISABLED: User profile route - use twin profiles instead
// router.get('/user/:handle', generateCSRFToken, publicPageController.getUserProfile);

router.get('/profile/my', requireJWTFromCookie, generateCSRFToken, asyncHandler(getMyProfile));


export default router;

