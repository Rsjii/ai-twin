import { Router } from 'express';
import { getMetricsSummary, getUserAnalytics, debugUserData, createSampleData, getReferralStats, getChattersStats } from './analyticsController';
import { requireJWTFromCookie } from '../../middleware/jwtCookie';
import { getTwinAnalytics } from './analyticsController';
import { getFeedbackAnalytics } from '../chat/feedbackController';
import { isDev } from '../../config/env';

const router = Router();

// Public metrics endpoint
router.get('/summary', getMetricsSummary);

// Debug endpoints
if(isDev){
  router.get('/debug', requireJWTFromCookie, debugUserData);
  router.post('/create-sample', requireJWTFromCookie, createSampleData);
}

// Protected user analytics - using JWT authentication
router.get('/user', requireJWTFromCookie, getUserAnalytics);

// Twin analytics
router.get('/twin/:twinToken/analytics', requireJWTFromCookie, getTwinAnalytics);

// Referral stats
router.get('/referrals', requireJWTFromCookie, getReferralStats);

// Feedback analytics
router.get('/feedback', requireJWTFromCookie, getFeedbackAnalytics);

// Chatters stats
router.get('/chatters-stats', requireJWTFromCookie, getChattersStats);

export default router;
