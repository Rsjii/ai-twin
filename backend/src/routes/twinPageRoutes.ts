import { Router } from 'express';
import { requireJWTFromCookie, extractJWTFromCookie } from '../middleware/jwtCookie';
import { generateCSRFToken } from '../middleware/csrf';
import { optionalAuth } from '../middleware/auth';
import * as twinPageController from '../controllers/twinPageController';
import * as twinManagePageController from '../controllers/twinManagePageController';

const router = Router();

// My Twins page
router.get('/my-twins', requireJWTFromCookie, generateCSRFToken, twinPageController.getMyTwins);

// Twin Create page
router.get('/twin/create', extractJWTFromCookie, optionalAuth, generateCSRFToken, twinPageController.getTwinCreate);

// Twin AI Edit page
router.get('/twin/:id/ai-edit', requireJWTFromCookie, generateCSRFToken, twinPageController.getTwinAiEdit);

// Twin Style Customize page
router.get('/twin/:id/style-customize', requireJWTFromCookie, generateCSRFToken, twinPageController.getTwinStyleCustomize);

// Twin Learning Dashboard page
router.get('/twin/:id/learning-dashboard', requireJWTFromCookie, generateCSRFToken, twinPageController.getTwinLearningDashboard);

// Twin Management page
router.get('/twin/manage', requireJWTFromCookie, generateCSRFToken, twinManagePageController.getTwinManage);

export default router;