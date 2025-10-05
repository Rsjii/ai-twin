import { Router } from 'express';
import { signup, signupVerify, completeProfile, login, forgotPassword, forgotPasswordVerify, resetPassword, logout, changePassword } from './authController';
import { otpRateLimit } from '../../middleware/rateLimit';
import { generateCSRFToken, validateCSRF } from '../../middleware/csrf';
import { sanitizeInput } from '../../middleware/validation';
import { requireAuth } from '../../middleware/auth';

const router = Router();

// Apply CSRF protection to all routes
router.use(generateCSRFToken);

// Signup routes
router.post('/signup', sanitizeInput, otpRateLimit, signup);
router.post('/signup/verify', sanitizeInput, signupVerify);
router.post('/signup/profile', sanitizeInput, completeProfile);

// Login routes
router.post('/login', sanitizeInput, validateCSRF, login);

// Password reset routes
router.post('/forgot-password', sanitizeInput, otpRateLimit, forgotPassword);
router.post('/forgot-password/verify', sanitizeInput, forgotPasswordVerify);
router.post('/reset-password', sanitizeInput, resetPassword);

// Change password route (requires authentication)
router.post('/change-password', requireAuth, sanitizeInput, changePassword);

// Logout
router.post('/logout', requireAuth, logout);

export default router;
