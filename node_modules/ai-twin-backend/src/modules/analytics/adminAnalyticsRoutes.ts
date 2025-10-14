import { Router } from 'express';
import { 
  getAdminAnalytics, 
  getAdminUserAnalytics, 
  getDetailedUserInfo,
  removeUser,
  getTimeBasedAnalytics,
  getUsersList,
  getDetailedMetrics,
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

// Time-based analytics
router.get('/time/:period', getTimeBasedAnalytics); // today, week, month

// Detailed metrics for specific types
router.get('/detailed/:type', getDetailedMetrics); // users, twins, chats, messages

// Users list with search and pagination
router.get('/users', getUsersList);

// Detailed user analytics
router.get('/user/:userId', getAdminUserAnalytics);

// Detailed user information with full data
router.get('/user/:userId/detailed', getDetailedUserInfo);

// User management
router.delete('/user/:userId', removeUser);

// System health check
router.get('/health', getSystemHealth);

export default router;
