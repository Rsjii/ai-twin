import { Router } from 'express';
import { getMetricsSummary, getUserAnalytics, debugUserData, createSampleData, getReferralStats } from './analyticsController';
import { requireJWTFromCookie } from '../../middleware/jwtCookie';
import { getTwinAnalytics } from './analyticsController';
import { getFeedbackAnalytics } from '../chat/feedbackController';

const router = Router();

// Public metrics endpoint
router.get('/summary', getMetricsSummary);

// Debug endpoints
router.get('/debug', requireJWTFromCookie, debugUserData);
router.post('/create-sample', requireJWTFromCookie, createSampleData);

// Protected user analytics - using JWT authentication
router.get('/user', requireJWTFromCookie, getUserAnalytics);

// Twin analytics
router.get('/twin/:twinId/analytics', requireJWTFromCookie, getTwinAnalytics);

// Referral stats
router.get('/referrals', requireJWTFromCookie, getReferralStats);

// Feedback analytics
router.get('/feedback', requireJWTFromCookie, getFeedbackAnalytics);

export default router;
