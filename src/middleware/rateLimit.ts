import rateLimit from 'express-rate-limit';

// Rate limit for draft generation (1 per 30 seconds per user)
export const draftRateLimit = rateLimit({
  windowMs: 30 * 1000, // 30 seconds
  max: 1,
  keyGenerator: (req) => {
    return req.session?.userId || req.ip;
  },
  message: 'You can only generate one draft every 30 seconds. Please wait.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limit for OTP requests (3 per 10 minutes per IP)
export const otpRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 3,
  message: 'Too many OTP requests. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limit for twin creation (2 per hour per user)
export const twinCreationRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 2,
  keyGenerator: (req) => {
    return req.session?.userId || req.ip;
  },
  message: 'You can only create 2 twins per hour. Please wait.',
  standardHeaders: true,
  legacyHeaders: false,
});
