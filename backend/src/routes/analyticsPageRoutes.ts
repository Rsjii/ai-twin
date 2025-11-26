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

// Analytics details
router.get('/analytics/details', requireJWTFromCookie, generateCSRFToken, analyticsPageController.getAnalyticsDetails);

// Event explorer page
router.get('/admin/analytics/events', requireJWTFromCookie, generateCSRFToken, analyticsPageController.getEventExplorerPage);

// Activity feed page
router.get('/admin/analytics/activity', requireJWTFromCookie, generateCSRFToken, analyticsPageController.getActivityFeedPage);

export default router;

