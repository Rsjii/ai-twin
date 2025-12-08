import { Router } from 'express';
import { requireJWTFromCookie } from '../middleware/jwtCookie';
import { generateCSRFToken } from '../middleware/csrf';
import * as analyticsPageController from '../controllers/analyticsPageController';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

// User Analytics dashboard
router.get('/analytics', requireJWTFromCookie, generateCSRFToken, asyncHandler(analyticsPageController.getAnalytics));

// Admin Analytics dashboard
router.get('/admin/analytics', requireJWTFromCookie, generateCSRFToken, asyncHandler(analyticsPageController.getAdminAnalytics));

// Admin Analytics detailed pages
router.get('/admin/analytics/page/:type', requireJWTFromCookie, generateCSRFToken, asyncHandler(analyticsPageController.getAdminAnalyticsPage));

// Analytics details
router.get('/analytics/details', requireJWTFromCookie, generateCSRFToken, asyncHandler(analyticsPageController.getAnalyticsDetails));

// Event explorer page
router.get('/admin/analytics/events', requireJWTFromCookie, generateCSRFToken, asyncHandler(analyticsPageController.getEventExplorerPage));

// Activity feed page
router.get('/admin/analytics/activity', requireJWTFromCookie, generateCSRFToken, asyncHandler(analyticsPageController.getActivityFeedPage));

export default router;

