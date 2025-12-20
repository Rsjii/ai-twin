import { Router } from 'express';
import { requireJWTFromCookie, extractJWTFromCookie } from '../middleware/jwtCookie';
import { generateCSRFToken } from '../middleware/csrf';
import { optionalAuth } from '../middleware/auth';
import * as twinPageController from '../controllers/twinPageController';
import * as twinManagePageController from '../controllers/twinManagePageController';
import * as discoverPageController from '../controllers/discoverPageController';
import { getTwinPublicChatHistoryPage ,getViewPublicChatHistoryPage} from '../controllers/twinPublicChatHistoryPageController';
import { asyncHandler } from '../middleware/errorHandler';
import { FEATURE_FLAGS } from '../config/featureFlags';

const router = Router();

// My Twins page
router.get('/my-twins', requireJWTFromCookie, generateCSRFToken, asyncHandler(twinPageController.getMyTwins));

// Twin Create page
router.get('/twin/create', optionalAuth, generateCSRFToken, twinPageController.getTwinCreate);

// ✅ MVP: AI Edit page disabled (V2 feature - route commented out)
// To enable: Set ENABLE_AI_TOOLS_UI=true in .env and uncomment below
// router.get('/ai-edit', requireJWTFromCookie, generateCSRFToken, asyncHandler(twinPageController.getTwinAiEdit));

// Alternative: Use feature flag (uncomment to enable flag-based control)
// if (FEATURE_FLAGS.aiToolsUI) {
//   router.get('/ai-edit', requireJWTFromCookie, generateCSRFToken, asyncHandler(twinPageController.getTwinAiEdit));
// }

// Twin Style Customize page (not used in MVP – keep for future, redirect to Twin Settings)
router.get('/style-customize', requireJWTFromCookie, generateCSRFToken, (_req, res) => {
  return res.redirect('/twin-settings');
});

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