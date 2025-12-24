import { Router } from 'express';
import { getMyReferralCode, getMyReferrals } from './inviteController';
import { requireJWTFromCookie } from '../../middleware/jwtCookie';
import { generateCSRFToken } from '../../middleware/csrf';

const router = Router();

// Get my referral code
router.get('/my-code', generateCSRFToken, requireJWTFromCookie, getMyReferralCode);

// Get my referrals
router.get('/my-referrals', generateCSRFToken, requireJWTFromCookie, getMyReferrals);

export default router;