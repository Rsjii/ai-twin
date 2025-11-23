import { Router } from 'express';
import { 
  getAdminAnalytics, 
  getAdminUserAnalytics, 
  getDetailedUserInfo,
  removeUser,
  getTimeBasedAnalytics,
  getUsersList,
  getDetailedMetrics,
  getDetailedUsersPage,
  getDetailedTwinsPage,
  getDetailedChatsPage,
  getDetailedMessagesPage,
  getSystemHealth,
  requireAdminAuth,
  getEventExplorer
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

// Detailed pages with pagination
router.get('/page/users', (req, res, next) => {
  console.log('=== ROUTE: /page/users ===');
  console.log('Request query:', req.query);
  console.log('Request user:', req.user);
  next();
}, getDetailedUsersPage);

router.get('/page/twins', (req, res, next) => {
  console.log('=== ROUTE: /page/twins ===');
  console.log('Request query:', req.query);
  console.log('Request user:', req.user);
  next();
}, getDetailedTwinsPage);

router.get('/page/chats', (req, res, next) => {
  console.log('=== ROUTE: /page/chats ===');
  console.log('Request query:', req.query);
  console.log('Request user:', req.user);
  next();
}, getDetailedChatsPage);

router.get('/page/messages', (req, res, next) => {
  console.log('=== ROUTE: /page/messages ===');
  console.log('Request query:', req.query);
  next();
}, getDetailedMessagesPage);

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

// Event explorer
router.get('/events/explorer', getEventExplorer);

export default router;
