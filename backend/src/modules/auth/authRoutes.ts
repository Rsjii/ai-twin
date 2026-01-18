import { Router } from 'express';
import { signup, signupVerify, completeProfile, login, loginVerify, forgotPassword, forgotPasswordVerify, resetPassword, logout, changePassword, resendOTP, requestSetPasswordOTP, setPassword } from './authController';
import {
    otpRequestRateLimit,
    loginRateLimit,
    otpVerifyRateLimit,
    resetPasswordRateLimit,
    changePasswordRateLimit,
  } from '../../middleware/rateLimit';
import { validateCSRF } from '../../middleware/csrf';
import { sanitizeInput } from '../../middleware/validation';
import { requireJWTFromCookie } from '../../middleware/jwtCookie';

const router = Router();

// ❌ REMOVED: router.use(generateCSRFToken);
// Token generation happens on page routes (authPageRoutes.ts), not API routes

// Signup routes
router.post('/signup', sanitizeInput, otpRequestRateLimit, signup);
router.post('/signup/verify', sanitizeInput, validateCSRF, otpVerifyRateLimit, signupVerify);
router.post('/signup/profile', sanitizeInput, validateCSRF, completeProfile);

// Login routes
router.post('/login', sanitizeInput, validateCSRF, loginRateLimit, login);
router.post('/login/verify', sanitizeInput, validateCSRF, otpVerifyRateLimit, loginVerify);

// Password reset routes
router.post('/forgot-password', sanitizeInput, otpRequestRateLimit, forgotPassword);
router.post('/forgot-password/verify', sanitizeInput, validateCSRF, otpVerifyRateLimit, forgotPasswordVerify);
router.post('/reset-password', sanitizeInput, validateCSRF, resetPasswordRateLimit, resetPassword);

// Change password route (requires authentication)
router.post('/change-password', requireJWTFromCookie, sanitizeInput, validateCSRF, changePasswordRateLimit, changePassword);

// Set password routes (for Google-only users)
router.post('/set-password/request-otp', requireJWTFromCookie, sanitizeInput, validateCSRF, otpRequestRateLimit, requestSetPasswordOTP);
router.post('/set-password', requireJWTFromCookie, sanitizeInput, validateCSRF, otpVerifyRateLimit, setPassword);

// Logout
router.post('/logout', logout);

// Resend OTP
router.post('/resend-otp', sanitizeInput, otpRequestRateLimit, resendOTP);

export default router;
