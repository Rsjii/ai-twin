import { Router } from 'express';
import { getMetricsSummary, getUserAnalytics, debugUserData, createSampleData } from './analyticsController';
import { requireJWTFromCookie } from '../../middleware/jwtCookie';

const router = Router();

// Public metrics endpoint
router.get('/summary', getMetricsSummary);

// Debug endpoints
router.get('/debug', requireJWTFromCookie, debugUserData);
router.post('/create-sample', requireJWTFromCookie, createSampleData);

// Protected user analytics - using JWT authentication
router.get('/user', requireJWTFromCookie, getUserAnalytics);

export default router;
