import { Router } from 'express';
import { generateCSRFToken } from '../middleware/csrf';
import * as authPageController from '../controllers/authPageController';

const router = Router();

// Unified Auth page (Login/Signup)
router.get('/auth', authPageController.getAuth);

// Login page - redirects to unified auth
router.get('/login', authPageController.getLogin);

// Signup page - redirects to unified auth
router.get('/signup', authPageController.getSignup);

// Login Verify OTP page
router.get('/login/verify', generateCSRFToken, authPageController.getLoginVerify);

// Verify OTP page (for signup/forgot password)
router.get('/verify-otp', generateCSRFToken, authPageController.getVerifyOtp);

// Signup Profile Completion page
router.get('/signup/profile', generateCSRFToken, authPageController.getSignupProfile);

// Forgot Password page
router.get('/forgot-password', generateCSRFToken, authPageController.getForgotPassword);

// Forgot Password Verification page
router.get('/forgot-password/verify', generateCSRFToken, authPageController.getForgotPasswordVerify);

// Reset Password page
router.get('/reset-password', generateCSRFToken, authPageController.getResetPassword);

export default router;

