import { Response } from 'express';

/**
 * Unified Auth page - Login/Signup
 */
export function getAuth(req: any, res: Response) {
  if (req.user) {
    return res.redirect('/dashboard');
  }
  res.render('auth', {
    title: 'Login / Signup - AI Twin',
    user: req.user,
    csrfToken: res.locals['csrfToken'],
  });
}

/**
 * Login page - Redirects to unified auth
 */
export function getLogin(req: any, res: Response) {
  if (req.user) {
    return res.redirect('/dashboard');
  }
  res.redirect('/auth');
}

/**
 * Signup page - Redirects to unified auth
 */
export function getSignup(req: any, res: Response) {
  if (req.user) {
    return res.redirect('/dashboard');
  }
  res.redirect('/auth');
}

/**
 * Login Verify OTP page
 */
export function getLoginVerify(req: any, res: Response) {
  const email = req.query['email'] as string;
  res.render('login-verify', {
    title: 'Verify OTP - AI Twin',
    user: req.user,
    csrfToken: res.locals['csrfToken'],
    email: email
  });
}

/**
 * Verify OTP page (for signup/forgot password)
 */
export function getVerifyOtp(req: any, res: Response) {
  const email = req.query['email'] as string;
  const type = req.query['type'] as string; // 'signup' or 'forgot'
  const otp = req.query['otp'] as string; // Get OTP from URL parameters
  
  res.render('verify-otp', {
    title: 'Verify OTP - AI Twin',
    user: req.user,
    csrfToken: res.locals['csrfToken'],
    email: email,
    type: type,
    actualOTP: otp || '123456'
  });
}

/**
 * Signup Profile Completion page
 */
export function getSignupProfile(req: any, res: Response) {
  const email = req.query['email'] as string;
  
  res.render('signup-profile', {
    title: 'Complete Profile - AI Twin',
    user: req.user,
    csrfToken: res.locals['csrfToken'],
    email: email
  });
}

/**
 * Forgot Password page
 */
export function getForgotPassword(req: any, res: Response) {
  res.render('forgot-password', {
    title: 'Forgot Password - AI Twin',
    user: req.user,
    csrfToken: res.locals['csrfToken']
  });
}

/**
 * Forgot Password Verification page
 */
export function getForgotPasswordVerify(req: any, res: Response) {
  const email = req.query['email'] as string;
  
  res.render('forgot-password-verify', {
    title: 'Verify Reset Code - AI Twin',
    user: req.user,
    csrfToken: res.locals['csrfToken'],
    email: email
  });
}

/**
 * Reset Password page
 */
export function getResetPassword(req: any, res: Response) {
  const email = req.query['email'] as string;
  
  res.render('reset-password', {
    title: 'Reset Password - AI Twin',
    user: req.user,
    csrfToken: res.locals['csrfToken'],
    email: email
  });
}

