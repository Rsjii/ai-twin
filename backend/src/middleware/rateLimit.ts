import rateLimit from 'express-rate-limit';
import { RATE_LIMITS, formatRetryAfter } from '../config/rateLimitConfig';
import { OPERATION_RATE_LIMITS, EVENT_TYPES } from '../config/constants';
import { PostgreSQLRateLimitStore } from '../config/rateLimitStore';
import { EventLogger } from '../services/eventLogger';
import { logger } from '../config/logger';

/**
 * Rate Limiting Configuration
 * All limiters now use PostgreSQL store for persistence across restarts
 * See: backend/src/config/rateLimitConfig.ts
 */

/**
 * Create a store instance for a specific rate limiter
 * Each store instance knows its default windowMs for new keys
 */
function createRateLimitStore(windowMs: number): any {
  return new PostgreSQLRateLimitStore(windowMs) as any;
}

/**
 * ✅ Helper functions for rate limit key generation with prefixes
 * Prevents key collisions between different limiters in the same rate_limits table
 */
const rlKey = (prefix: string, raw: string) => `${prefix}:${raw || 'unknown'}`;

const getUserOrIp = (req: any) =>
  req.user?.id || req.user?.userId || req.ip || req.socket?.remoteAddress || 'unknown';

const getEmailOrIp = (req: any) => {
  const email = (req.body?.email || '').toLowerCase();
  return email || req.ip || req.socket?.remoteAddress || 'unknown';
};

/**
 * Helper function to log rate limit violations as events
 */
function logRateLimitViolation(
  req: any,
  limiterName: string,
  key: string,
  limit: number,
  windowMs: number
): void {
  try {
    const userId = req.user?.id || req.user?.userId || null;
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    
    // Log to console/logger
    logger.warn({
      type: 'RATE_LIMIT_EXCEEDED',
      limiter: limiterName,
      key: key.substring(0, 100),
      limit,
      windowMs,
      path: req.path,
      method: req.method,
      ip,
      userId: userId || 'anonymous',
    }, `[RATE_LIMIT] ⚠️ ${limiterName} EXCEEDED - ${req.method} ${req.path} - IP: ${ip}`);
    
    const meta = {
      limiterName,
      key: key.substring(0, 100), // Limit key length for logging
      limit,
      windowMs,
      path: req.path,
      method: req.method,
      ip,
      userAgent: req.get('user-agent') || null,
    };

    if (userId) {
      EventLogger.logUserEvent(userId, EVENT_TYPES.RATE_LIMIT_EXCEEDED, meta).catch(() => {});
    } else {
      EventLogger.logSystemEvent(EVENT_TYPES.RATE_LIMIT_EXCEEDED, meta).catch(() => {});
    }
  } catch (error) {
    // Silent fail - don't break rate limiting if event logging fails
  }
}

// Global rate limiter (applied to all routes)
// ✅ CRITICAL: Uses PostgreSQL store for DDoS protection (persists across restarts, works with horizontal scaling)
const globalRateLimitStore = createRateLimitStore(RATE_LIMITS.global.windowMs);

export const globalRateLimit = rateLimit({
  store: globalRateLimitStore, // ✅ Use PostgreSQL store with windowMs
  windowMs: RATE_LIMITS.global.windowMs,
  max: RATE_LIMITS.global.max,
  keyGenerator: (req) => rlKey('global', req.ip || req.socket?.remoteAddress || 'unknown'),
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: formatRetryAfter(RATE_LIMITS.global.windowMs)
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // ✅ Skip global limiter for routes that have their own specific rate limiters
    // to prevent ERR_ERL_DOUBLE_COUNT errors
    const path = req.path || '';
    
    // ✅ Skip static files (CSS, JS, images, uploads, fonts) - these shouldn't be rate limited
    const isStatic = path.startsWith('/css/') ||
                     path.startsWith('/js/') ||
                     path.startsWith('/images/') ||
                     path.startsWith('/uploads/') ||
                     path.startsWith('/utils/') ||
                     path.startsWith('/favicon') ||
                     path.endsWith('.png') ||
                     path.endsWith('.jpg') ||
                     path.endsWith('.jpeg') ||
                     path.endsWith('.svg') ||
                     path.endsWith('.ico') ||
                     path.endsWith('.woff') ||
                     path.endsWith('.woff2') ||
                     path.endsWith('.ttf') ||
                     path.endsWith('.css') ||
                     path.endsWith('.js');
    
    // ✅ Skip routes with specific rate limiters
    const hasSpecificLimiter = path.startsWith('/api/auth') ||
           path.startsWith('/api/chat') ||
           path.startsWith('/api/public-chat') ||
           path.startsWith('/api/enhanced-chat') ||
           path.startsWith('/api/twin') ||
           path.startsWith('/api/public-twin');
    
    return isStatic || hasSpecificLimiter;
  },
  handler: (req, res) => {
    const key = rlKey('global', req.ip || req.socket?.remoteAddress || 'unknown');
    logRateLimitViolation(req, 'global', key, RATE_LIMITS.global.max, RATE_LIMITS.global.windowMs);
    return res.status(429).json({
      success: false,
      error: 'Too many requests from this IP, please try again later.',
      errorCode: 'RATE_LIMIT_EXCEEDED',
      retryAfter: formatRetryAfter(RATE_LIMITS.global.windowMs)
    });
  },
});


// Twin creation rate limiter
export const twinCreationRateLimit = rateLimit({
  store: createRateLimitStore(RATE_LIMITS.twinCreation.windowMs), // ✅ Use PostgreSQL store with windowMs
  windowMs: RATE_LIMITS.twinCreation.windowMs,
  max: RATE_LIMITS.twinCreation.max,
  keyGenerator: (req) => rlKey('twinCreation', getUserOrIp(req)),
  message: {
    error: `Twin creation limit exceeded. You can create ${RATE_LIMITS.twinCreation.max} twins per hour.`,
    retryAfter: formatRetryAfter(RATE_LIMITS.twinCreation.windowMs)
  },
  standardHeaders: true,
  legacyHeaders: false,
  // ✅ FIX: Only count when twin creation actually succeeds (2xx/3xx responses)
  skipFailedRequests: true,
  handler: (req, res) => {
    const key = rlKey('twinCreation', getUserOrIp(req));
    logRateLimitViolation(req, 'twinCreation', key, RATE_LIMITS.twinCreation.max, RATE_LIMITS.twinCreation.windowMs);
    return res.status(429).json({
      success: false,
      error: `Twin creation limit exceeded. You can create ${RATE_LIMITS.twinCreation.max} twins per hour.`,
      errorCode: 'RATE_LIMIT_EXCEEDED',
      retryAfter: formatRetryAfter(RATE_LIMITS.twinCreation.windowMs)
    });
  },
});

// Draft generation rate limiter
export const draftGenerationRateLimit = rateLimit({
  store: createRateLimitStore(RATE_LIMITS.draftGeneration.windowMs), // ✅ Use PostgreSQL store with windowMs
  windowMs: RATE_LIMITS.draftGeneration.windowMs,
  max: RATE_LIMITS.draftGeneration.max,
  keyGenerator: (req) => rlKey('draftGeneration', getUserOrIp(req)),
  message: {
    error: `Draft generation limit exceeded. Please slow down.`,
    retryAfter: formatRetryAfter(RATE_LIMITS.draftGeneration.windowMs)
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const key = rlKey('draftGeneration', getUserOrIp(req));
    logRateLimitViolation(req, 'draftGeneration', key, RATE_LIMITS.draftGeneration.max, RATE_LIMITS.draftGeneration.windowMs);
    return res.status(429).json({
      success: false,
      error: 'Draft generation limit exceeded. Please slow down.',
      errorCode: 'RATE_LIMIT_EXCEEDED',
      retryAfter: formatRetryAfter(RATE_LIMITS.draftGeneration.windowMs)
    });
  },
});

// OTP request rate limiter
export const otpRequestRateLimit = rateLimit({
  store: createRateLimitStore(RATE_LIMITS.otpRequest.windowMs), // ✅ Use PostgreSQL store with windowMs
  windowMs: RATE_LIMITS.otpRequest.windowMs,
  max: RATE_LIMITS.otpRequest.max,
  keyGenerator: (req: any) => rlKey('otpRequest', getEmailOrIp(req)),
  message: {
    error: 'Too many OTP requests. Please wait before trying again.',
    retryAfter: formatRetryAfter(RATE_LIMITS.otpRequest.windowMs)
  },
  standardHeaders: true,
  legacyHeaders: false,
  // ✅ FIX: Only count when OTP request actually succeeds (OTP sent successfully)
  skipFailedRequests: true,
  handler: (req, res) => {
    const key = rlKey('otpRequest', getEmailOrIp(req));
    logRateLimitViolation(req, 'otpRequest', key, RATE_LIMITS.otpRequest.max, RATE_LIMITS.otpRequest.windowMs);
    return res.status(429).json({
      success: false,
      error: 'Too many OTP requests. Please wait before trying again.',
      errorCode: 'RATE_LIMIT_EXCEEDED',
      retryAfter: formatRetryAfter(RATE_LIMITS.otpRequest.windowMs)
    });
  },
});

// Profile link generation rate limiter
export const profileLinkRateLimit = rateLimit({
  store: createRateLimitStore(RATE_LIMITS.profileLink.windowMs), // ✅ Use PostgreSQL store with windowMs
  windowMs: RATE_LIMITS.profileLink.windowMs,
  max: RATE_LIMITS.profileLink.max,
  keyGenerator: (req) => rlKey('profileLink', getUserOrIp(req)),
  message: {
    error: `Profile link generation limit exceeded. You can generate ${RATE_LIMITS.profileLink.max} links per hour.`,
    retryAfter: formatRetryAfter(RATE_LIMITS.profileLink.windowMs)
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const key = rlKey('profileLink', getUserOrIp(req));
    logRateLimitViolation(req, 'profileLink', key, RATE_LIMITS.profileLink.max, RATE_LIMITS.profileLink.windowMs);
    return res.status(429).json({
      success: false,
      error: `Profile link generation limit exceeded. You can generate ${RATE_LIMITS.profileLink.max} links per hour.`,
      errorCode: 'RATE_LIMIT_EXCEEDED',
      retryAfter: formatRetryAfter(RATE_LIMITS.profileLink.windowMs)
    });
  },
});

// Invite creation rate limiter
export const inviteCreationRateLimit = rateLimit({
  store: createRateLimitStore(RATE_LIMITS.inviteCreation.windowMs), // ✅ Use PostgreSQL store with windowMs
  windowMs: RATE_LIMITS.inviteCreation.windowMs,
  max: RATE_LIMITS.inviteCreation.max,
  keyGenerator: (req) => rlKey('inviteCreation', getUserOrIp(req)),
  message: {
    error: `Invite creation limit exceeded. You can create ${RATE_LIMITS.inviteCreation.max} invites per day.`,
    retryAfter: formatRetryAfter(RATE_LIMITS.inviteCreation.windowMs)
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const key = rlKey('inviteCreation', getUserOrIp(req));
    logRateLimitViolation(req, 'inviteCreation', key, RATE_LIMITS.inviteCreation.max, RATE_LIMITS.inviteCreation.windowMs);
    return res.status(429).json({
      success: false,
      error: `Invite creation limit exceeded. You can create ${RATE_LIMITS.inviteCreation.max} invites per day.`,
      errorCode: 'RATE_LIMIT_EXCEEDED',
      retryAfter: formatRetryAfter(RATE_LIMITS.inviteCreation.windowMs)
    });
  },
});

// API rate limiter (for general API endpoints)
export const apiRateLimit = rateLimit({
  store: createRateLimitStore(RATE_LIMITS.api.windowMs), // ✅ Use PostgreSQL store with windowMs
  windowMs: RATE_LIMITS.api.windowMs,
  max: RATE_LIMITS.api.max,
  keyGenerator: (req) => rlKey('api', getUserOrIp(req)),
  message: {
    error: 'API rate limit exceeded. Please slow down your requests.',
    retryAfter: formatRetryAfter(RATE_LIMITS.api.windowMs)
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const key = rlKey('api', getUserOrIp(req));
    logRateLimitViolation(req, 'api', key, RATE_LIMITS.api.max, RATE_LIMITS.api.windowMs);
    return res.status(429).json({
      success: false,
      error: 'API rate limit exceeded. Please slow down your requests.',
      errorCode: 'RATE_LIMIT_EXCEEDED',
      retryAfter: formatRetryAfter(RATE_LIMITS.api.windowMs)
    });
  },
});

// Public chat message rate limiter (for anonymous users - strict)
export const publicChatRateLimit = rateLimit({
  store: createRateLimitStore(RATE_LIMITS.publicChatAnon.windowMs), // ✅ Use PostgreSQL store with windowMs
  windowMs: RATE_LIMITS.publicChatAnon.windowMs,
  max: RATE_LIMITS.publicChatAnon.max,
  keyGenerator: (req) => {
    // ✅ FIX: Add unique prefix to prevent key conflicts with other limiters
    // For anonymous users: use IP address (most reliable)
    // IP tracking works even if visitorId changes
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    return `publicChatAnon:${ip}`;
  },
  message: {
    error: 'Too many messages. Please wait before sending another.',
    retryAfter: formatRetryAfter(RATE_LIMITS.publicChatAnon.windowMs)
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: false, // ✅ FIX: Disable double-count validation (we have multiple independent limiters)
  handler: (req, res) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `publicChatAnon:${ip}`;
    logRateLimitViolation(req, 'publicChatAnon', key, RATE_LIMITS.publicChatAnon.max, RATE_LIMITS.publicChatAnon.windowMs);
    res.status(429).json({
      success: false,
      error: 'Too many messages. Please wait before sending another.',
      errorCode: 'RATE_LIMIT_EXCEEDED',
      retryAfter: formatRetryAfter(RATE_LIMITS.publicChatAnon.windowMs)
    });
  },
  skip: (req) => {
    // Skip rate limiting for authenticated users (they get higher limit)
    // Authenticated users are handled by publicChatRateLimitAuthenticated
    return !!req.user?.id || !!req.user?.userId;
  }
});

// Public chat rate limiter (for authenticated users - higher limit)
export const publicChatRateLimitAuthenticated = rateLimit({
  store: createRateLimitStore(RATE_LIMITS.publicChatAuth.windowMs), // ✅ Use PostgreSQL store with windowMs
  windowMs: RATE_LIMITS.publicChatAuth.windowMs,
  max: RATE_LIMITS.publicChatAuth.max,
  keyGenerator: (req) => {
    // ✅ FIX: Add unique prefix to prevent key conflicts
    // Use userId if authenticated, otherwise IP
    const identifier = req.user?.id || req.user?.userId || req.ip || 'unknown';
    return `publicChatAuth:${identifier}`;
  },
  message: {
    error: 'Too many messages. Please wait before sending another.',
    retryAfter: formatRetryAfter(RATE_LIMITS.publicChatAuth.windowMs)
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: false, // ✅ FIX: Disable double-count validation (we have multiple independent limiters)
  handler: (req, res) => {
    const identifier = req.user?.id || req.user?.userId || req.ip || 'unknown';
    const key = `publicChatAuth:${identifier}`;
    logRateLimitViolation(req, 'publicChatAuth', key, RATE_LIMITS.publicChatAuth.max, RATE_LIMITS.publicChatAuth.windowMs);
    res.status(429).json({
      success: false,
      error: 'Too many messages. Please wait before sending another.',
      errorCode: 'RATE_LIMIT_EXCEEDED',
      retryAfter: formatRetryAfter(RATE_LIMITS.publicChatAuth.windowMs)
    });
  },
  skip: (req) => {
    // ✅ FIX: Skip for anonymous users (they are handled by publicChatRateLimit)
    // Only run for authenticated users
    return !req.user?.id && !req.user?.userId;
  }
});

// Public chat DAILY cap for anonymous users (login wall)
// ✅ Goal: after N messages/day, force login
export const publicChatDailyAnonLimit = rateLimit({
  store: createRateLimitStore(RATE_LIMITS.publicChatDailyAnon.windowMs), // ✅ Use PostgreSQL store with windowMs
  windowMs: RATE_LIMITS.publicChatDailyAnon.windowMs,
  max: RATE_LIMITS.publicChatDailyAnon.max,
  keyGenerator: (req) => {
    // ✅ FIX: Add unique prefix to prevent key conflicts with other limiters
    // Anonymous-only: IP is the most reliable
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    return `publicChatDailyAnon:${ip}`;
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: false, // ✅ FIX: Disable double-count validation (we have multiple independent limiters)
  skip: (req) => {
    // Logged-in users should not hit anonymous daily wall
    return !!req.user?.id || !!req.user?.userId;
  },
  handler: (req, res) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `publicChatDailyAnon:${ip}`;
    logRateLimitViolation(req, 'publicChatDailyAnon', key, RATE_LIMITS.publicChatDailyAnon.max, RATE_LIMITS.publicChatDailyAnon.windowMs);
    return res.status(429).json({
      success: false,
      error: 'Daily limit reached. Please login to continue.',
      errorCode: 'LOGIN_REQUIRED',
      retryAfter: formatRetryAfter(RATE_LIMITS.publicChatDailyAnon.windowMs),
    });
  },
});


// Login attempts limiter (per email/IP)
export const loginRateLimit = rateLimit({
  store: createRateLimitStore(RATE_LIMITS.login.windowMs), // ✅ Use PostgreSQL store with windowMs
  windowMs: RATE_LIMITS.login.windowMs,
  max: RATE_LIMITS.login.max,
  keyGenerator: (req: any) => rlKey('login', getEmailOrIp(req)),
  message: {
    error: 'Too many login attempts. Please try again later.',
    retryAfter: formatRetryAfter(RATE_LIMITS.login.windowMs),
  },
  standardHeaders: true,
  legacyHeaders: false,
  // ✅ FIX: Only count failed login attempts (brute force protection)
  skipSuccessfulRequests: true,
  handler: (req, res) => {
    const key = rlKey('login', getEmailOrIp(req));
    logRateLimitViolation(req, 'login', key, RATE_LIMITS.login.max, RATE_LIMITS.login.windowMs);
    return res.status(429).json({
      success: false,
      error: 'Too many login attempts. Please try again later.',
      errorCode: 'RATE_LIMIT_EXCEEDED',
      retryAfter: formatRetryAfter(RATE_LIMITS.login.windowMs)
    });
  },
});

// Google OAuth GET limiter (init + callback)
export const googleOAuthRateLimit = rateLimit({
  store: createRateLimitStore(RATE_LIMITS.googleOAuth.windowMs),
  windowMs: RATE_LIMITS.googleOAuth.windowMs,
  max: RATE_LIMITS.googleOAuth.max,
  keyGenerator: (req: any) => rlKey('googleOAuth', req.ip || req.socket?.remoteAddress || 'unknown'),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const key = rlKey('googleOAuth', req.ip || req.socket?.remoteAddress || 'unknown');
    logRateLimitViolation(req, 'googleOAuth', key, RATE_LIMITS.googleOAuth.max, RATE_LIMITS.googleOAuth.windowMs);
    // Browser navigation route → redirect back to /auth (so user isn't stuck on JSON)
    return res.redirect('/auth?error=rate_limit_exceeded&details=' + encodeURIComponent('Too many Google login attempts. Please try again later.'));
  },
});

// OTP verification limiter (signup/login/forgot-password verify)
export const otpVerifyRateLimit = rateLimit({
  store: createRateLimitStore(RATE_LIMITS.otpVerify.windowMs), // ✅ Use PostgreSQL store with windowMs
  windowMs: RATE_LIMITS.otpVerify.windowMs,
  max: RATE_LIMITS.otpVerify.max,
  keyGenerator: (req: any) => rlKey('otpVerify', getEmailOrIp(req)),
  message: {
    error: 'Too many OTP verification attempts. Please wait a bit and try again.',
    retryAfter: formatRetryAfter(RATE_LIMITS.otpVerify.windowMs),
  },
  standardHeaders: true,
  legacyHeaders: false,
  // ✅ FIX: Only count failed OTP verification attempts (brute force protection)
  skipSuccessfulRequests: true,
  handler: (req, res) => {
    const key = rlKey('otpVerify', getEmailOrIp(req));
    logRateLimitViolation(req, 'otpVerify', key, RATE_LIMITS.otpVerify.max, RATE_LIMITS.otpVerify.windowMs);
    return res.status(429).json({
      success: false,
      error: 'Too many OTP verification attempts. Please wait a bit and try again.',
      errorCode: 'RATE_LIMIT_EXCEEDED',
      retryAfter: formatRetryAfter(RATE_LIMITS.otpVerify.windowMs)
    });
  },
});

// Change password limiter (per authenticated user)
export const changePasswordRateLimit = rateLimit({
  store: createRateLimitStore(RATE_LIMITS.changePassword.windowMs), // ✅ Use PostgreSQL store with windowMs
  windowMs: RATE_LIMITS.changePassword.windowMs,
  max: RATE_LIMITS.changePassword.max,
  keyGenerator: (req: any) => rlKey('changePassword', getUserOrIp(req)),
  message: {
    error: 'Too many password change attempts. Please try again later.',
    retryAfter: formatRetryAfter(RATE_LIMITS.changePassword.windowMs),
  },
  standardHeaders: true,
  legacyHeaders: false,
  // ✅ FIX: Only count successful password changes (not button clicks or failed attempts)
  skipFailedRequests: true,
  handler: (req, res) => {
    const key = rlKey('changePassword', getUserOrIp(req));
    logRateLimitViolation(req, 'changePassword', key, RATE_LIMITS.changePassword.max, RATE_LIMITS.changePassword.windowMs);
    return res.status(429).json({
      success: false,
      error: 'Too many password change attempts. Please try again later.',
      errorCode: 'RATE_LIMIT_EXCEEDED',
      retryAfter: formatRetryAfter(RATE_LIMITS.changePassword.windowMs)
    });
  },
});

// Reset password limiter (per email/IP) - prevents abuse
export const resetPasswordRateLimit = rateLimit({
  store: createRateLimitStore(RATE_LIMITS.resetPassword.windowMs), // ✅ Use PostgreSQL store with windowMs
  windowMs: RATE_LIMITS.resetPassword.windowMs,
  max: RATE_LIMITS.resetPassword.max,
  keyGenerator: (req: any) => rlKey('resetPassword', getEmailOrIp(req)),
  message: {
    error: 'Too many password reset attempts. Please try again later.',
    retryAfter: formatRetryAfter(RATE_LIMITS.resetPassword.windowMs),
  },
  standardHeaders: true,
  legacyHeaders: false,
  // ✅ FIX: Only count successful password resets (not button clicks or failed attempts)
  skipFailedRequests: true,
  handler: (req, res) => {
    const key = rlKey('resetPassword', getEmailOrIp(req));
    logRateLimitViolation(req, 'resetPassword', key, RATE_LIMITS.resetPassword.max, RATE_LIMITS.resetPassword.windowMs);
    return res.status(429).json({
      success: false,
      error: 'Too many password reset attempts. Please try again later.',
      errorCode: 'RATE_LIMIT_EXCEEDED',
      retryAfter: formatRetryAfter(RATE_LIMITS.resetPassword.windowMs)
    });
  },
});

// ✅ Delete account rate limiter (per user/IP) - prevents brute force on password
export const deleteAccountRateLimit = rateLimit({
  store: createRateLimitStore(RATE_LIMITS.deleteAccount.windowMs), // ✅ Use PostgreSQL store with windowMs
  windowMs: RATE_LIMITS.deleteAccount.windowMs,
  max: RATE_LIMITS.deleteAccount.max,
  keyGenerator: (req: any) => {
    const userId = req.user?.id || req.user?.userId || null;
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    // Prefer userId (authenticated route), fallback to IP
    return `delete_account:${userId || ip}`;
  },
  standardHeaders: true,
  legacyHeaders: false,
  // ✅ FIX: Only count failed delete account attempts (wrong password etc.) - brute force protection
  skipSuccessfulRequests: true,
  handler: (req, res) => {
    const userId = req.user?.id || req.user?.userId || null;
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const key = `delete_account:${userId || ip}`;
    logRateLimitViolation(req, 'deleteAccount', key, RATE_LIMITS.deleteAccount.max, RATE_LIMITS.deleteAccount.windowMs);
    // ✅ Custom handler to ensure proper JSON response for frontend error handling
    return res.status(429).json({
      success: false,
      error: 'Too many account deletion attempts. Please try again later.',
      errorCode: 'RATE_LIMIT_EXCEEDED',
      retryAfter: formatRetryAfter(RATE_LIMITS.deleteAccount.windowMs),
    });
  },
});

// ✅ Delete account success cooldown limiter (per email) - prevents create → delete → create abuse loop
export const deleteAccountSuccessRateLimit = rateLimit({
  store: createRateLimitStore(RATE_LIMITS.deleteAccountSuccess.windowMs), // ✅ Use PostgreSQL store with windowMs
  windowMs: RATE_LIMITS.deleteAccountSuccess.windowMs,
  max: RATE_LIMITS.deleteAccountSuccess.max,
  keyGenerator: (req: any) => {
    const email = (req.user?.email || '').toLowerCase();
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    // ✅ Use email as primary key (prevents same email from deleting multiple times in 24h)
    return `delete_account_success:${email || ip}`;
  },
  standardHeaders: true,
  legacyHeaders: false,
  // ✅ FIX: Only count SUCCESSFUL deletions (cooldown after successful delete)
  skipFailedRequests: true,
  handler: (req, res) => {
    const email = (req.user?.email || '').toLowerCase();
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const key = `delete_account_success:${email || ip}`;
    logRateLimitViolation(req, 'deleteAccountSuccess', key, RATE_LIMITS.deleteAccountSuccess.max, RATE_LIMITS.deleteAccountSuccess.windowMs);
    // ✅ Custom handler to ensure proper JSON response for frontend error handling
    return res.status(429).json({
      success: false,
      error: 'Account deletion cooldown active. You can delete an account once per 24 hours per email. Please try again later.',
      errorCode: 'RATE_LIMIT_EXCEEDED',
      retryAfter: formatRetryAfter(RATE_LIMITS.deleteAccountSuccess.windowMs),
    });
  },
});

// ✅ Twin deletion rate limiter (shared limit for both /twin/manage and twin-settings)
export const twinDeletionRateLimit = rateLimit({
  store: createRateLimitStore(OPERATION_RATE_LIMITS.TWIN_DELETION.windowMs), // ✅ Use PostgreSQL store with windowMs
  windowMs: OPERATION_RATE_LIMITS.TWIN_DELETION.windowMs,
  max: OPERATION_RATE_LIMITS.TWIN_DELETION.max,
  keyGenerator: (req: any) => {
    // ✅ Use user ID with explicit prefix to ensure shared limit across both deletion routes
    // This ensures if user deletes once from /twin/manage and once from twin-settings, it counts as 2
    const userId = req.user?.id || req.user?.userId || req.ip || 'unknown';
    // ✅ Explicit prefix ensures both routes use the same key (shared limit)
    return `twin_deletion:${userId}`;
  },
  message: {
    error: `Too many twin deletion attempts. Please try again later.`,
    errorCode: 'RATE_LIMIT_EXCEEDED',
    retryAfter: formatRetryAfter(OPERATION_RATE_LIMITS.TWIN_DELETION.windowMs),
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const userId = req.user?.id || req.user?.userId || req.ip || 'unknown';
    const key = `twin_deletion:${userId}`;
    logRateLimitViolation(req, 'twinDeletion', key, OPERATION_RATE_LIMITS.TWIN_DELETION.max, OPERATION_RATE_LIMITS.TWIN_DELETION.windowMs);
    // ✅ Custom handler to ensure proper JSON response for frontend error handling
    res.status(429).json({
      success: false,
      error: `Too many twin deletion attempts. Please try again later.`,
      errorCode: 'RATE_LIMIT_EXCEEDED',
      retryAfter: formatRetryAfter(OPERATION_RATE_LIMITS.TWIN_DELETION.windowMs),
    });
  },
  skip: (req) => {
    // Skip rate limiting in development
    return process.env.NODE_ENV === 'development';
  },
});

// ✅ Twin deletion SUCCESS cooldown limiter (1 per 24h per user)
export const twinDeletionSuccessRateLimit = rateLimit({
  store: createRateLimitStore(RATE_LIMITS.twinDeletionSuccess.windowMs),
  windowMs: RATE_LIMITS.twinDeletionSuccess.windowMs,
  max: RATE_LIMITS.twinDeletionSuccess.max,
  keyGenerator: (req: any) => rlKey('twinDeletionSuccess', getUserOrIp(req)),
  standardHeaders: true,
  legacyHeaders: false,
  // ✅ Only count SUCCESSFUL deletions
  skipFailedRequests: true,
  handler: (req, res) => {
    const key = rlKey('twinDeletionSuccess', getUserOrIp(req));
    logRateLimitViolation(
      req,
      'twinDeletionSuccess',
      key,
      RATE_LIMITS.twinDeletionSuccess.max,
      RATE_LIMITS.twinDeletionSuccess.windowMs
    );
    return res.status(429).json({
      success: false,
      error: 'Twin deletion cooldown active. You can delete a twin once per 24 hours. Please try again later.',
      errorCode: 'RATE_LIMIT_EXCEEDED',
      retryAfter: formatRetryAfter(RATE_LIMITS.twinDeletionSuccess.windowMs),
    });
  },
  skip: () => process.env.NODE_ENV === 'development',
});

// ✅ Twin visibility toggle rate limiter (shared limit for make-public and make-private)
export const twinVisibilityToggleRateLimit = rateLimit({
  store: createRateLimitStore(OPERATION_RATE_LIMITS.TWIN_VISIBILITY_TOGGLE.windowMs), // ✅ Use PostgreSQL store with windowMs
  windowMs: OPERATION_RATE_LIMITS.TWIN_VISIBILITY_TOGGLE.windowMs,
  max: OPERATION_RATE_LIMITS.TWIN_VISIBILITY_TOGGLE.max,
  keyGenerator: (req: any) => {
    // ✅ Use user ID with explicit prefix to ensure shared limit across both make-public and make-private
    // This ensures if user toggles once from dashboard/settings and once from /twin/manage, it counts as 2
    const userId = req.user?.id || req.user?.userId || req.ip || 'unknown';
    // ✅ Explicit prefix ensures both routes use the same key (shared limit)
    return `twin_visibility_toggle:${userId}`;
  },
  message: {
    error: `Too many visibility changes. Please try again later.`,
    errorCode: 'RATE_LIMIT_EXCEEDED',
    retryAfter: formatRetryAfter(OPERATION_RATE_LIMITS.TWIN_VISIBILITY_TOGGLE.windowMs),
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const userId = req.user?.id || req.user?.userId || req.ip || 'unknown';
    const key = `twin_visibility_toggle:${userId}`;
    logRateLimitViolation(req, 'twinVisibilityToggle', key, OPERATION_RATE_LIMITS.TWIN_VISIBILITY_TOGGLE.max, OPERATION_RATE_LIMITS.TWIN_VISIBILITY_TOGGLE.windowMs);
    // ✅ Custom handler to ensure proper JSON response for frontend error handling
    res.status(429).json({
      success: false,
      error: `Too many visibility changes. Please try again later.`,
      errorCode: 'RATE_LIMIT_EXCEEDED',
      retryAfter: formatRetryAfter(OPERATION_RATE_LIMITS.TWIN_VISIBILITY_TOGGLE.windowMs),
    });
  },
  skip: (req) => {
    return process.env.NODE_ENV === 'development';
  },
});

// ✅ Contact form rate limiter (IP + email based)
export const contactFormRateLimit = rateLimit({
  store: createRateLimitStore(RATE_LIMITS.contactForm.windowMs), // ✅ Use PostgreSQL store with windowMs
  windowMs: RATE_LIMITS.contactForm.windowMs,
  max: RATE_LIMITS.contactForm.max,
  keyGenerator: (req: any) => {
    const email = (req.body?.email || '').toLowerCase();
    const raw = email || req.ip || req.socket?.remoteAddress || 'unknown';
    return rlKey('contactForm', raw);
  },
  message: {
    error: 'Too many contact form submissions. Please wait before trying again.',
    retryAfter: formatRetryAfter(RATE_LIMITS.contactForm.windowMs)
  },
  standardHeaders: true,
  legacyHeaders: false,
  // ✅ FIX: Only count when contact form submission actually succeeds
  skipFailedRequests: true,
  handler: (req, res) => {
    const email = (req.body?.email || '').toLowerCase();
    const raw = email || req.ip || req.socket?.remoteAddress || 'unknown';
    const key = rlKey('contactForm', raw);
    logRateLimitViolation(req, 'contactForm', key, RATE_LIMITS.contactForm.max, RATE_LIMITS.contactForm.windowMs);
    return res.status(429).json({
      success: false,
      error: 'Too many contact form submissions. Please wait before trying again.',
      errorCode: 'RATE_LIMIT_EXCEEDED',
      retryAfter: formatRetryAfter(RATE_LIMITS.contactForm.windowMs)
    });
  },
});

// ✅ Daily contact form limit (per IP) - prevents abuse
export const contactFormDailyLimit = rateLimit({
  store: createRateLimitStore(RATE_LIMITS.contactFormDaily.windowMs), // ✅ Use PostgreSQL store with windowMs
  windowMs: RATE_LIMITS.contactFormDaily.windowMs,
  max: RATE_LIMITS.contactFormDaily.max,
  keyGenerator: (req: any) => rlKey('contactFormDaily', req.ip || req.socket?.remoteAddress || 'unknown'),
  standardHeaders: true,
  legacyHeaders: false,
  // ✅ FIX: Only count when contact form submission actually succeeds
  skipFailedRequests: true,
  handler: (req, res) => {
    const key = rlKey('contactFormDaily', req.ip || req.socket?.remoteAddress || 'unknown');
    logRateLimitViolation(req, 'contactFormDaily', key, RATE_LIMITS.contactFormDaily.max, RATE_LIMITS.contactFormDaily.windowMs);
    return res.status(429).json({
      success: false,
      error: 'Daily contact form limit reached. Please try again tomorrow.',
      errorCode: 'DAILY_LIMIT_EXCEEDED',
      retryAfter: formatRetryAfter(RATE_LIMITS.contactFormDaily.windowMs)
    });
  },
});

// ✅ ADD: Private chat message limiter (counts ALL requests incl. banned/common fast-path)
export const privateChatMessageRateLimit = rateLimit({
  store: createRateLimitStore(RATE_LIMITS.privateChatMessageAuth.windowMs),
  windowMs: RATE_LIMITS.privateChatMessageAuth.windowMs,
  max: RATE_LIMITS.privateChatMessageAuth.max,
  keyGenerator: (req) => rlKey('privateChatMsg', getUserOrIp(req)),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const key = rlKey('privateChatMsg', getUserOrIp(req));
    logRateLimitViolation(req, 'privateChatMessageAuth', key, RATE_LIMITS.privateChatMessageAuth.max, RATE_LIMITS.privateChatMessageAuth.windowMs);
    return res.status(429).json({
      success: false,
      error: 'Too many messages. Please wait before sending another.',
      errorCode: 'RATE_LIMIT_EXCEEDED',
      retryAfter: formatRetryAfter(RATE_LIMITS.privateChatMessageAuth.windowMs),
    });
  },
});

// ✅ ADD: Enhanced reply limiter (counts ALL requests incl. banned/common fast-path)
export const enhancedChatReplyRateLimit = rateLimit({
  store: createRateLimitStore(RATE_LIMITS.enhancedChatReplyAuth.windowMs),
  windowMs: RATE_LIMITS.enhancedChatReplyAuth.windowMs,
  max: RATE_LIMITS.enhancedChatReplyAuth.max,
  keyGenerator: (req) => rlKey('enhancedReply', getUserOrIp(req)),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const key = rlKey('enhancedReply', getUserOrIp(req));
    logRateLimitViolation(req, 'enhancedChatReplyAuth', key, RATE_LIMITS.enhancedChatReplyAuth.max, RATE_LIMITS.enhancedChatReplyAuth.windowMs);
    return res.status(429).json({
      success: false,
      error: 'Too many requests. Please slow down.',
      errorCode: 'RATE_LIMIT_EXCEEDED',
      retryAfter: formatRetryAfter(RATE_LIMITS.enhancedChatReplyAuth.windowMs),
    });
  },
});