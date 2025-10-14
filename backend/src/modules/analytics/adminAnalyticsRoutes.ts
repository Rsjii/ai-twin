import { Router } from 'express';
import { 
  getAdminAnalytics, 
  getAdminUserAnalytics, 
  getSystemHealth,
  requireAdminAuth 
} from './adminAnalyticsController';
import { requireJWTFromCookie } from '../../middleware/jwtCookie';

const router = Router();

// All admin routes require JWT authentication + admin check
router.use(requireJWTFromCookie);
router.use(requireAdminAuth);

// Main admin analytics dashboard
router.get('/dashboard', getAdminAnalytics);

// Detailed user analytics
router.get('/user/:userId', getAdminUserAnalytics);

// System health check
router.get('/health', getSystemHealth);

export default router;
