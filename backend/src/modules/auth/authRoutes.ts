import { Router } from 'express';
import { signup, signupVerify, completeProfile, login, loginVerify, forgotPassword, forgotPasswordVerify, resetPassword, logout, changePassword } from './authController';
import {
    otpRequestRateLimit,
    loginRateLimit,
    otpVerifyRateLimit,
    changePasswordRateLimit,
  } from '../../middleware/rateLimit';
import { generateCSRFToken, validateCSRF } from '../../middleware/csrf';
import { sanitizeInput } from '../../middleware/validation';
import { requireJWTFromCookie } from '../../middleware/jwtCookie';

const router = Router();

// Apply CSRF protection to all routes
router.use(generateCSRFToken);

// Signup routes
router.post('/signup', sanitizeInput, otpRequestRateLimit, signup);
router.post('/signup/verify', sanitizeInput, otpVerifyRateLimit, signupVerify);
router.post('/signup/profile', sanitizeInput, completeProfile);

// Login routes
router.post('/login', sanitizeInput, validateCSRF, loginRateLimit, login);
router.post('/login/verify', sanitizeInput, otpVerifyRateLimit, loginVerify);

// Password reset routes
router.post('/forgot-password', sanitizeInput, otpRequestRateLimit, forgotPassword);
router.post('/forgot-password/verify', sanitizeInput, otpVerifyRateLimit, forgotPasswordVerify);
router.post('/reset-password', sanitizeInput, resetPassword);

// Change password route (requires authentication)
router.post('/change-password', requireJWTFromCookie, sanitizeInput, validateCSRF, changePasswordRateLimit, changePassword);

// Logout
router.post('/logout', logout);

export default router;
