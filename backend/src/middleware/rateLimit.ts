import rateLimit from 'express-rate-limit';

/**
 * Rate Limiting Configuration
 * Different limits for different types of operations
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
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50, // ✅ Increased to 50 twins per hour per user for testing
  keyGenerator: (req) => {
    // Use user ID if authenticated, otherwise IP
    return req.user?.userId || req.ip || 'unknown';
  },
  message: {
    error: 'Twin creation limit exceeded. You can create 50 twins per hour.',
    retryAfter: '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Draft generation rate limiter
export const draftGenerationRateLimit = rateLimit({
  windowMs: 30 * 1000, // 30 seconds
  max: 100, // ✅ Increased to 100 drafts per 30 seconds per user
  keyGenerator: (req) => {
    return req.user?.userId || req.ip || 'unknown';
  },
  message: {
    error: 'Draft generation limit exceeded. You can generate 100 drafts per 30 seconds.',
    retryAfter: '30 seconds'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// OTP request rate limiter
export const otpRequestRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 20, // ✅ Increased to 20 OTP requests per 10 minutes per IP
  message: {
    error: 'Too many OTP requests. Please wait 10 minutes before trying again.',
    retryAfter: '10 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Profile link generation rate limiter
export const profileLinkRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100, // ✅ Increased to 100 profile links per hour per user
  keyGenerator: (req) => {
    return req.user?.userId || req.ip || 'unknown';
  },
  message: {
    error: 'Profile link generation limit exceeded. You can generate 100 links per hour.',
    retryAfter: '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Invite creation rate limiter
export const inviteCreationRateLimit = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 50, // ✅ Increased to 50 invites per day per user
  keyGenerator: (req) => {
    return req.user?.userId || req.ip || 'unknown';
  },
  message: {
    error: 'Invite creation limit exceeded. You can create 50 invites per day.',
    retryAfter: '24 hours'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// API rate limiter (for general API endpoints) - TESTING MODE
export const apiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5000000, // ✅ Increased to 5M API requests per 15 minutes (testing)
  keyGenerator: (req) => {
    return req.user?.userId || req.ip || 'unknown';
  },
  message: {
    error: 'API rate limit exceeded. Please slow down your requests.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Public chat message rate limiter (for anonymous users - strict) - TESTING MODE
export const publicChatRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100000, // ✅ Increased to 100k messages per 15 min for anonymous users (testing)
  keyGenerator: (req) => {
    // For anonymous users: use IP address (most reliable)
    // IP tracking works even if visitorId changes
    return req.ip || req.socket.remoteAddress || 'unknown';
  },
  message: {
    error: 'Too many messages. Please wait before sending another.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: 'Too many messages. Please wait before sending another.',
      errorCode: 'RATE_LIMIT_EXCEEDED',
      retryAfter: '15 minutes'
    });
  },
  skip: (req) => {
    // Skip rate limiting for authenticated users (they get higher limit)
    // Authenticated users are handled by publicChatRateLimitAuthenticated
    return !!req.user?.id || !!req.user?.userId;
  }
});

// Public chat rate limiter (for authenticated users - higher limit) - TESTING MODE
export const publicChatRateLimitAuthenticated = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500000, // ✅ Increased to 500k messages per 15 min for authenticated users (testing)
  keyGenerator: (req) => {
    // Use userId if authenticated, otherwise IP
    return req.user?.id || req.user?.userId || req.ip || 'unknown';
  },
  message: {
    error: 'Too many messages. Please wait before sending another.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: 'Too many messages. Please wait before sending another.',
      errorCode: 'RATE_LIMIT_EXCEEDED',
      retryAfter: '15 minutes'
    });
  }
});


// NEW: Login attempts limiter (per email/IP)
export const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  keyGenerator: (req: any) => {
    const email = (req.body?.email || '').toLowerCase();
    return email || req.ip || 'unknown';
  },
  message: {
    error: 'Too many login attempts. Please try again later.',
    retryAfter: '15 minutes',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// NEW: OTP verification limiter (signup/login/forgot-password verify)
export const otpVerifyRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5,
  keyGenerator: (req: any) => {
    const email = (req.body?.email || '').toLowerCase();
    return email || req.ip || 'unknown';
  },
  message: {
    error: 'Too many OTP verification attempts. Please wait a bit and try again.',
    retryAfter: '10 minutes',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// NEW: Change password limiter (per authenticated user)
export const changePasswordRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  keyGenerator: (req: any) => {
    return req.user?.id || req.user?.userId || req.ip || 'unknown';
  },
  message: {
    error: 'Too many password change attempts. Please try again later.',
    retryAfter: '1 hour',
  },
  standardHeaders: true,
  legacyHeaders: false,
});