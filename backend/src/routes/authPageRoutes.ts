import { Router } from 'express';
import { generateCSRFToken } from '../middleware/csrf';
import * as authPageController from '../controllers/authPageController';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

// Unified Auth page (Login/Signup)
router.get('/auth', asyncHandler(authPageController.getAuth));

// ✅ FIX: Wrap all async controllers
// Login page - redirects to unified auth
router.get('/login', asyncHandler(authPageController.getLogin));

// Signup page - redirects to unified auth
router.get('/signup', asyncHandler(authPageController.getSignup));

// Login Verify OTP page
router.get('/login/verify', generateCSRFToken, asyncHandler(authPageController.getLoginVerify));

// Verify OTP page (for signup/forgot password)
router.get('/verify-otp', generateCSRFToken, asyncHandler(authPageController.getVerifyOtp));

// Signup Profile Completion page
router.get('/signup/profile', generateCSRFToken, asyncHandler(authPageController.getSignupProfile));

// Forgot Password page
router.get('/forgot-password', generateCSRFToken, asyncHandler(authPageController.getForgotPassword));

// Forgot Password Verify OTP page
router.get('/forgot-password/verify', generateCSRFToken, asyncHandler(authPageController.getForgotPasswordVerify));

// Reset Password page
router.get('/reset-password', generateCSRFToken, asyncHandler(authPageController.getResetPassword));

export default router;

