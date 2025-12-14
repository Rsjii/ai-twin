import { Response } from 'express';
import { userQueries } from '../config/database';
import { logger } from '../config/logger';

/**
 * Unified Auth page - Login/Signup
 */
export async function getAuth(req: any, res: Response) {
  try {
    if (req.user && req.user.email) {
      // User has a JWT; check if profile is completed
      const fullUser = await userQueries.findByEmail(req.user.email);

      if (fullUser && fullUser.profileCompleted) {
        // Fully onboarded → send to dashboard
        return res.redirect('/dashboard');
      }

      // Incomplete or missing user → clear auth and show auth page
      res.clearCookie('jwtToken', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'lax' : 'strict',
        path: '/',
      });

      if (req.session) {
        req.session.destroy(() => {});
      }
    }

    // Show login/signup page
    return res.render('auth', {
      title: 'Login / Signup - AI Twin',
      user: null,
      csrfToken: res.locals['csrfToken'],
    });
  } catch (err) {
    logger.error('getAuth error:', err);
    return res.render('auth', {
      title: 'Login / Signup - AI Twin',
      user: null,
      csrfToken: res.locals['csrfToken'],
    });
  }
}

/**
 * Login page - Redirects to unified auth
 */
export function getLogin(req: any, res: Response) {
  return getAuth(req, res);
}

/**
 * Signup page - Redirects to unified auth
 */
export function getSignup(req: any, res: Response) {
  return getAuth(req, res);
}

/**
 * Login Verify OTP page
 */
export function getLoginVerify(req: any, res: Response) {
  const email = req.query['email'] as string;
  res.render('login-verify', {
    title: 'Verify OTP - AI Twin',
    user: null,
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
  // ✅ REMOVED: const otp = req.query['otp'] as string;
  
  res.render('verify-otp', {
    title: 'Verify OTP - AI Twin',
    user: null,
    csrfToken: res.locals['csrfToken'],
    email: email,
    type: type,
    // ✅ Development: Pass fixed OTP for display
    // ✅ Production: undefined (user must check email)
    devOTP: process.env.NODE_ENV === 'development' ? '123456' : undefined
  });
}

/**
 * Signup Profile Completion page
 */
export function getSignupProfile(req: any, res: Response) {
  let email = req.query['email'] as string;

  // 2) If not in query but user is authenticated via JWT cookie, use that
  if (!email && req.user && req.user.email) {
    email = req.user.email;
  }  
  
  // 3) If still no email, send back to auth
  if (!email) {
    return res.redirect('/auth');
  }
  
  res.render('signup-profile', {
    title: 'Complete Profile - AI Twin',
    user: null,
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
    user: null,
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
    user: null,
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
    user: null,
    csrfToken: res.locals['csrfToken'],
    email: email
  });
}

