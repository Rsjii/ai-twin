import { Router } from 'express';
import { requireJWTFromCookie } from '../middleware/jwtCookie';
import { generateCSRFToken } from '../middleware/csrf';
import * as analyticsPageController from '../controllers/analyticsPageController';

const router = Router();

// User Analytics dashboard
router.get('/analytics', requireJWTFromCookie, generateCSRFToken, analyticsPageController.getAnalytics);

// Admin Analytics dashboard
router.get('/admin/analytics', requireJWTFromCookie, generateCSRFToken, analyticsPageController.getAdminAnalytics);

// Admin Analytics detailed pages
router.get('/admin/analytics/page/:type', requireJWTFromCookie, generateCSRFToken, analyticsPageController.getAdminAnalyticsPage);

export default router;

