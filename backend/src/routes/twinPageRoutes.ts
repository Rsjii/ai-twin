import { Router } from 'express';
import { requireJWTFromCookie, extractJWTFromCookie } from '../middleware/jwtCookie';
import { generateCSRFToken } from '../middleware/csrf';
import { optionalAuth } from '../middleware/auth';
import * as twinPageController from '../controllers/twinPageController';
import * as twinManagePageController from '../controllers/twinManagePageController';
import * as discoverPageController from '../controllers/discoverPageController';
import { getTwinPublicChatHistoryPage ,getViewPublicChatHistoryPage} from '../controllers/twinPublicChatHistoryPageController';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

// My Twins page
router.get('/my-twins', requireJWTFromCookie, generateCSRFToken, asyncHandler(twinPageController.getMyTwins));

// Twin Create page
router.get('/twin/create', optionalAuth, generateCSRFToken, twinPageController.getTwinCreate);

// Twin AI Edit page (owner-only, single twin)
router.get('/ai-edit', requireJWTFromCookie, generateCSRFToken, asyncHandler(twinPageController.getTwinAiEdit));

// Twin Style Customize page
router.get('/style-customize', requireJWTFromCookie, generateCSRFToken, asyncHandler(twinPageController.getTwinStyleCustomize));

// Twin Settings (MVP-friendly "learning dashboard" shell)
router.get('/twin-settings', requireJWTFromCookie, generateCSRFToken, asyncHandler(twinPageController.getTwinLearningDashboard));

// Memory Management page (private)
router.get('/memory-management', requireJWTFromCookie, generateCSRFToken, asyncHandler(discoverPageController.getMemoryManagement));

// Twin Management page stays:
router.get('/twin/manage', requireJWTFromCookie, generateCSRFToken, asyncHandler(twinManagePageController.getTwinManage));

// Twin Public Chat History page
router.get('/public-chat-history', requireJWTFromCookie, generateCSRFToken, asyncHandler(getTwinPublicChatHistoryPage));

// Twin View Chat History page
router.get('/public-chat-history/view/:chatToken', requireJWTFromCookie, generateCSRFToken, asyncHandler(getViewPublicChatHistoryPage));

export default router;