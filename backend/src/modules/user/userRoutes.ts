import { Router } from 'express';
import { exportUserData, deleteAccount, requestDeleteAccountOTP } from './userController';
import { requireJWTFromCookie } from '../../middleware/jwtCookie';
import { sanitizeInput } from '../../middleware/validation';
import { generateCSRFToken, validateCSRF } from '../../middleware/csrf';
import { deleteAccountRateLimit, deleteAccountSuccessRateLimit, otpRequestRateLimit } from '../../middleware/rateLimit';

const router = Router();

// All routes require authentication and CSRF protection
router.use(requireJWTFromCookie);
router.use(sanitizeInput);
router.use(generateCSRFToken);
// ✅ CSRF should protect state-changing requests only (NOT GET/HEAD/OPTIONS)
router.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  return validateCSRF(req, res, next);
});

router.get('/export-data', exportUserData);
// Request OTP for account deletion (OAuth-only users)
router.post('/account/delete-otp', otpRequestRateLimit, requestDeleteAccountOTP);
// ✅ Apply success cooldown FIRST (prevents abuse), then failed attempts limiter (brute force protection)
router.delete('/account', deleteAccountSuccessRateLimit, deleteAccountRateLimit, deleteAccount);

export default router;