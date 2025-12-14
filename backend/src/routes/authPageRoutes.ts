import { Router } from 'express';
import { generateCSRFToken } from '../middleware/csrf';
import * as authPageController from '../controllers/authPageController';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();
// ✅ Generate CSRF token for all routes (applies globally)
router.use(generateCSRFToken);

// Unified Auth page (Login/Signup)
router.get('/auth', asyncHandler(authPageController.getAuth));

// ✅ FIX: Wrap all async controllers
// Login page - redirects to unified auth
router.get('/login', asyncHandler(authPageController.getLogin));

// Signup page - redirects to unified auth
router.get('/signup', asyncHandler(authPageController.getSignup));

// Login Verify OTP page (generateCSRFToken already applied globally)
router.get('/login/verify', asyncHandler(authPageController.getLoginVerify));

// Verify OTP page (for signup/forgot password) (generateCSRFToken already applied globally)
router.get('/verify-otp', asyncHandler(authPageController.getVerifyOtp));

// Signup Profile Completion page (generateCSRFToken already applied globally)
router.get('/signup/profile', asyncHandler(authPageController.getSignupProfile));

// Forgot Password page (generateCSRFToken already applied globally)
router.get('/forgot-password', asyncHandler(authPageController.getForgotPassword));

// Forgot Password Verify OTP page (generateCSRFToken already applied globally)
router.get('/forgot-password/verify', asyncHandler(authPageController.getForgotPasswordVerify));

// Reset Password page (generateCSRFToken already applied globally)
router.get('/reset-password', asyncHandler(authPageController.getResetPassword));

export default router;

