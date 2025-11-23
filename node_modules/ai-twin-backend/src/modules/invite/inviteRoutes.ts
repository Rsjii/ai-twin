import { Router } from 'express';
import { getMyReferralCode, getMyReferrals } from './inviteController';
import { requireJWTFromCookie } from '../../middleware/jwtCookie';
import { generateCSRFToken } from '../../middleware/csrf';

const router = Router();

// Get my referral code
router.get('/my-code', (req, res, next) => {
  console.log('🟢 Route /api/invite/my-code hit');
  console.log('📝 Method:', req.method);
  console.log('🔑 Headers:', req.headers);
  next();
}, generateCSRFToken, requireJWTFromCookie, getMyReferralCode);

// Get my referrals
router.get('/my-referrals', generateCSRFToken, requireJWTFromCookie, getMyReferrals);

export default router;