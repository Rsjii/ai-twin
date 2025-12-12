import { Router } from 'express';
import { requireJWTFromCookie } from '../middleware/jwtCookie';
import { generateCSRFToken } from '../middleware/csrf';
import * as analyticsPageController from '../controllers/analyticsPageController';
import { asyncHandler } from '../middleware/errorHandler';
import { config } from '../config/env';

const router = Router();

// User Analytics dashboard (normal analytics)
router.get(
  '/analytics',
  requireJWTFromCookie,
  generateCSRFToken,
  asyncHandler(analyticsPageController.getAnalytics)
);

// ✅ Admin Analytics pages only when enabled (local/staging), hidden in prod
if (config.enableAdminAnalytics) {
  router.get(
    '/admin/analytics',
    requireJWTFromCookie,
    generateCSRFToken,
    asyncHandler(analyticsPageController.getAdminAnalytics)
  );

  router.get(
    '/admin/analytics/page/:type',
    requireJWTFromCookie,
    generateCSRFToken,
    asyncHandler(analyticsPageController.getAdminAnalyticsPage)
  );

  router.get(
    '/admin/analytics/events',
    requireJWTFromCookie,
    generateCSRFToken,
    asyncHandler(analyticsPageController.getEventExplorerPage)
  );

  router.get(
    '/admin/analytics/activity',
    requireJWTFromCookie,
    generateCSRFToken,
    asyncHandler(analyticsPageController.getActivityFeedPage)
  );
}

// Analytics details (non-admin)
router.get(
  '/analytics/details',
  requireJWTFromCookie,
  generateCSRFToken,
  asyncHandler(analyticsPageController.getAnalyticsDetails)
);

// Type-wise CSV export for analytics details (user-facing)
router.get(
  '/analytics/details/export',
  requireJWTFromCookie,
  asyncHandler(analyticsPageController.exportAnalyticsDetailsCSV)
);

export default router;

