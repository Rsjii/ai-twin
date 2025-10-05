import { Router } from 'express';
import { loginStart, loginVerify, logout } from './authController';
import { otpRateLimit } from '../../middleware/rateLimit';
import { generateCSRFToken, validateCSRF } from '../../middleware/csrf';
import { sanitizeInput } from '../../middleware/validation';

const router = Router();

// Apply CSRF protection to all routes
router.use(generateCSRFToken);

// Login routes
router.post('/login/start', sanitizeInput, validateCSRF, otpRateLimit, loginStart);
router.post('/login/verify', sanitizeInput, validateCSRF, loginVerify);
router.post('/logout', validateCSRF, logout);

export default router;
