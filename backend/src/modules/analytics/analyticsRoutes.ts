import { Router } from 'express';
import { getMetricsSummary, getUserAnalytics } from './analyticsController';
import { requireAuth } from '../../middleware/auth';

const router = Router();

// Public metrics endpoint
router.get('/summary', getMetricsSummary);

// Protected user analytics
router.get('/user', requireAuth, getUserAnalytics);

export default router;
