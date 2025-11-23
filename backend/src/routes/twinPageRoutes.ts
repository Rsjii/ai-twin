import { Router } from 'express';
import { requireJWTFromCookie, extractJWTFromCookie } from '../middleware/jwtCookie';
import { generateCSRFToken } from '../middleware/csrf';
import { optionalAuth } from '../middleware/auth';
import * as twinPageController from '../controllers/twinPageController';
import * as twinManagePageController from '../controllers/twinManagePageController';
import { getTwinPublicChatHistoryPage ,getViewPublicChatHistoryPage} from '../controllers/twinPublicChatHistoryPageController';

const router = Router();

// My Twins page
router.get('/my-twins', requireJWTFromCookie, generateCSRFToken, twinPageController.getMyTwins);

// Twin Create page
router.get('/twin/create', optionalAuth, generateCSRFToken, twinPageController.getTwinCreate);

// Twin AI Edit page
router.get('/twin/:id/ai-edit', requireJWTFromCookie, generateCSRFToken, twinPageController.getTwinAiEdit);

// Twin Style Customize page
router.get('/twin/:id/style-customize', requireJWTFromCookie, generateCSRFToken, twinPageController.getTwinStyleCustomize);

// Twin Learning Dashboard page
router.get('/twin/:id/learning-dashboard', requireJWTFromCookie, generateCSRFToken, twinPageController.getTwinLearningDashboard);

// Twin Management page
router.get('/twin/manage', requireJWTFromCookie, generateCSRFToken, twinManagePageController.getTwinManage);

// Twin Public Chat History page
router.get('/twin/:id/public-chat-history', requireJWTFromCookie, generateCSRFToken, getTwinPublicChatHistoryPage);

// Twin View Chat History page
router.get('/twin/:twinId/view-chat-history/:chatId', requireJWTFromCookie, generateCSRFToken, getViewPublicChatHistoryPage);
export default router;