import rateLimit from 'express-rate-limit';

/**
 * Rate Limiting Configuration
 * Different limits for different types of operations
 */

// Global rate limiter (applied to all routes)
export const globalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // 1000 requests per window
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
  max: 10, // Increase to 10 twins per hour per user for testing
  keyGenerator: (req) => {
    // Use user ID if authenticated, otherwise IP
    return req.user?.userId || req.ip || 'unknown';
  },
  message: {
    error: 'Twin creation limit exceeded. You can create 2 twins per hour.',
    retryAfter: '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Draft generation rate limiter
export const draftGenerationRateLimit = rateLimit({
  windowMs: 30 * 1000, // 30 seconds
  max: 1, // 1 draft per 30 seconds per user
  keyGenerator: (req) => {
    return req.user?.userId || req.ip || 'unknown';
  },
  message: {
    error: 'Please wait 30 seconds before generating another draft.',
    retryAfter: '30 seconds'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// OTP request rate limiter
export const otpRequestRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 3, // 3 OTP requests per 10 minutes per IP
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
  max: 10, // 10 profile links per hour per user
  keyGenerator: (req) => {
    return req.user?.userId || req.ip || 'unknown';
  },
  message: {
    error: 'Profile link generation limit exceeded. You can generate 10 links per hour.',
    retryAfter: '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Invite creation rate limiter
export const inviteCreationRateLimit = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 5, // 5 invites per day per user
  keyGenerator: (req) => {
    return req.user?.userId || req.ip || 'unknown';
  },
  message: {
    error: 'Invite creation limit exceeded. You can create 5 invites per day.',
    retryAfter: '24 hours'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// API rate limiter (for general API endpoints)
export const apiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 API requests per 15 minutes per user/IP
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

// Public chat message rate limiter (for anonymous users - strict)
export const publicChatRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 messages per 15 min for anonymous users
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
  skip: (req) => {
    // Skip rate limiting for authenticated users (they get higher limit)
    // Authenticated users are handled by publicChatRateLimitAuthenticated
    return !!req.user?.id || !!req.user?.userId;
  }
});

// Public chat rate limiter (for authenticated users - higher limit)
export const publicChatRateLimitAuthenticated = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 messages per 15 min for authenticated users
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
});