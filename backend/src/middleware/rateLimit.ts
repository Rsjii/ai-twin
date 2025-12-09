import rateLimit from 'express-rate-limit';
import { RATE_LIMITS, formatRetryAfter } from '../config/rateLimitConfig';

/**
 * Rate Limiting Configuration
 * All limiters now use centralized config (prod vs dev)
 * See: backend/src/config/rateLimitConfig.ts
 */

// Global rate limiter (applied to all routes) - TESTING MODE
export const globalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10000000, // ✅ 10M requests per window (increased for testing)
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Twin creation rate limiter
export const twinCreationRateLimit = rateLimit({
  windowMs: RATE_LIMITS.twinCreation.windowMs,
  max: RATE_LIMITS.twinCreation.max,
  keyGenerator: (req) => {
    // Use user ID if authenticated, otherwise IP
    return req.user?.userId || req.user?.id || req.ip || 'unknown';
  },
  message: {
    error: `Twin creation limit exceeded. You can create ${RATE_LIMITS.twinCreation.max} twins per hour.`,
    retryAfter: formatRetryAfter(RATE_LIMITS.twinCreation.windowMs)
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Draft generation rate limiter
export const draftGenerationRateLimit = rateLimit({
  windowMs: RATE_LIMITS.draftGeneration.windowMs,
  max: RATE_LIMITS.draftGeneration.max,
  keyGenerator: (req) => {
    return req.user?.userId || req.user?.id || req.ip || 'unknown';
  },
  message: {
    error: `Draft generation limit exceeded. Please slow down.`,
    retryAfter: formatRetryAfter(RATE_LIMITS.draftGeneration.windowMs)
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// OTP request rate limiter
export const otpRequestRateLimit = rateLimit({
  windowMs: RATE_LIMITS.otpRequest.windowMs,
  max: RATE_LIMITS.otpRequest.max,
  keyGenerator: (req: any) => {
    // Include email in key for better protection
    const email = (req.body?.email || '').toLowerCase();
    return email || req.ip || 'unknown';
  },
  message: {
    error: 'Too many OTP requests. Please wait before trying again.',
    retryAfter: formatRetryAfter(RATE_LIMITS.otpRequest.windowMs)
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Profile link generation rate limiter
export const profileLinkRateLimit = rateLimit({
  windowMs: RATE_LIMITS.profileLink.windowMs,
  max: RATE_LIMITS.profileLink.max,
  keyGenerator: (req) => {
    return req.user?.userId || req.user?.id || req.ip || 'unknown';
  },
  message: {
    error: `Profile link generation limit exceeded. You can generate ${RATE_LIMITS.profileLink.max} links per hour.`,
    retryAfter: formatRetryAfter(RATE_LIMITS.profileLink.windowMs)
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Invite creation rate limiter
export const inviteCreationRateLimit = rateLimit({
  windowMs: RATE_LIMITS.inviteCreation.windowMs,
  max: RATE_LIMITS.inviteCreation.max,
  keyGenerator: (req) => {
    return req.user?.userId || req.user?.id || req.ip || 'unknown';
  },
  message: {
    error: `Invite creation limit exceeded. You can create ${RATE_LIMITS.inviteCreation.max} invites per day.`,
    retryAfter: formatRetryAfter(RATE_LIMITS.inviteCreation.windowMs)
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// API rate limiter (for general API endpoints) - TESTING MODE
export const apiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5000000, // ✅ Increased to 5M API requests per 15 minutes (testing)
  keyGenerator: (req) => {
    return req.user?.userId || req.user?.id || req.ip || 'unknown';
  },
  message: {
    error: 'API rate limit exceeded. Please slow down your requests.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Public chat message rate limiter (for anonymous users - strict)
export const publicChatRateLimit = rateLimit({
  windowMs: RATE_LIMITS.publicChatAnon.windowMs,
  max: RATE_LIMITS.publicChatAnon.max,
  keyGenerator: (req) => {
    // For anonymous users: use IP address (most reliable)
    // IP tracking works even if visitorId changes
    return req.ip || req.socket.remoteAddress || 'unknown';
  },
  message: {
    error: 'Too many messages. Please wait before sending another.',
    retryAfter: formatRetryAfter(RATE_LIMITS.publicChatAnon.windowMs)
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
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
  windowMs: RATE_LIMITS.publicChatAuth.windowMs,
  max: RATE_LIMITS.publicChatAuth.max,
  keyGenerator: (req) => {
    // Use userId if authenticated, otherwise IP
    return req.user?.id || req.user?.userId || req.ip || 'unknown';
  },
  message: {
    error: 'Too many messages. Please wait before sending another.',
    retryAfter: formatRetryAfter(RATE_LIMITS.publicChatAuth.windowMs)
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: 'Too many messages. Please wait before sending another.',
      errorCode: 'RATE_LIMIT_EXCEEDED',
      retryAfter: formatRetryAfter(RATE_LIMITS.publicChatAuth.windowMs)
    });
  }
});


// Login attempts limiter (per email/IP)
export const loginRateLimit = rateLimit({
  windowMs: RATE_LIMITS.login.windowMs,
  max: RATE_LIMITS.login.max,
  keyGenerator: (req: any) => {
    const email = (req.body?.email || '').toLowerCase();
    return email || req.ip || 'unknown';
  },
  message: {
    error: 'Too many login attempts. Please try again later.',
    retryAfter: formatRetryAfter(RATE_LIMITS.login.windowMs),
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// OTP verification limiter (signup/login/forgot-password verify)
export const otpVerifyRateLimit = rateLimit({
  windowMs: RATE_LIMITS.otpVerify.windowMs,
  max: RATE_LIMITS.otpVerify.max,
  keyGenerator: (req: any) => {
    const email = (req.body?.email || '').toLowerCase();
    return email || req.ip || 'unknown';
  },
  message: {
    error: 'Too many OTP verification attempts. Please wait a bit and try again.',
    retryAfter: formatRetryAfter(RATE_LIMITS.otpVerify.windowMs),
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Change password limiter (per authenticated user)
export const changePasswordRateLimit = rateLimit({
  windowMs: RATE_LIMITS.changePassword.windowMs,
  max: RATE_LIMITS.changePassword.max,
  keyGenerator: (req: any) => {
    return req.user?.id || req.user?.userId || req.ip || 'unknown';
  },
  message: {
    error: 'Too many password change attempts. Please try again later.',
    retryAfter: formatRetryAfter(RATE_LIMITS.changePassword.windowMs),
  },
  standardHeaders: true,
  legacyHeaders: false,
});