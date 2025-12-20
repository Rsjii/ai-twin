import { isProd } from './env';
export { isProd };

/**
 * Rate Limiting Configuration
 * Separate production and development limits
 * Production: Strict limits to prevent abuse
 * Development: Loose limits for testing convenience
 */

type LimitConfig = {
  windowMs: number;
  max: number;
};

/**
 * Production rate limits (strict, security-focused)
 * Based on OWASP API Security guidelines, industry best practices, and common SaaS patterns
 * 
 * Industry Standards Reference:
 * - Auth endpoints: 5-10 requests per 15 min (prevents brute force attacks)
 * - OTP endpoints: 3-5 requests per 15 min (prevents abuse and spam)
 * - Chat endpoints: 60-100 messages per minute for authenticated, 20-40 for anonymous
 * - Resource creation: 5-10 per hour (prevents spam and abuse)
 */
const prodLimits = {
  // Critical auth flows - strict limits (OWASP recommended: 5-10 per 15 min)
  login: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 login attempts per 15 min per email/IP (stricter for security)
  } as LimitConfig,

  otpRequest: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 3, // 3 OTP requests per 15 min per IP/email (industry standard)
  } as LimitConfig,

  otpVerify: {
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 5, // 5 OTP verification attempts per 10 min per email/IP
  } as LimitConfig,

  changePassword: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // 3 password change attempts per hour per user (allows retry with typos)
  } as LimitConfig,

  // Public/content flows - reasonable limits (industry standard: 60-100 msg/min for auth, 20-40 for anon)
  publicChatAnon: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 15, // 30 messages per minute for anonymous users (prevents spam)
  } as LimitConfig,

  publicChatAuth: {
    windowMs: 15 * 60 * 1000, // 1 minute
    max: 20, // 60 messages per minute for authenticated users (allows normal conversation)
  } as LimitConfig,

  global: {
    windowMs: 15 * 60 * 1000,
    max: 2000,
  } as LimitConfig,

  api: {
    windowMs: 15 * 60 * 1000,
    max: 1000,
  } as LimitConfig,

  publicChatDailyAnon: {
    windowMs: 24 * 60 * 60 * 1000,
    max: 30,
  } as LimitConfig,

  draftGeneration: {
    windowMs: 30 * 1000, // 30 seconds
    max: 10, // 10 drafts per 30 seconds per user (prevents abuse)
  } as LimitConfig,

  // Other limits (industry standard: 5-10 resource creations per hour)
  twinCreation: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // 3 twins per hour per user (prevents spam, allows testing)
  } as LimitConfig,

  profileLink: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 50, // 50 profile links per hour per user
  } as LimitConfig,

  inviteCreation: {
    windowMs: 24 * 60 * 60 * 1000, // 24 hours
    max: 20, // 20 invites per day per user
  } as LimitConfig,
};

/**
 * Development rate limits (loose, for testing convenience)
 * Much higher limits to avoid blocking during development
 */
const devLimits: typeof prodLimits = {
  // Auth flows - very loose for dev
  login: {
    windowMs: 15 * 60 * 1000,
    max: 1000, // Very high to avoid blocking
  },

  otpRequest: {
    windowMs: 10 * 60 * 1000,
    max: 1000, // Very high for testing
  },

  otpVerify: {
    windowMs: 10 * 60 * 1000,
    max: 1000, // Very high for testing
  },

  changePassword: {
    windowMs: 60 * 60 * 1000,
    max: 1000, // Very high for testing
  },

  // Content flows - keep current testing values
  publicChatAnon: {
    windowMs: 15 * 60 * 1000,
    max: 100000, // Keep current testing value
  },

  publicChatAuth: {
    windowMs: 15 * 60 * 1000,
    max: 500000, // Keep current testing value
  },

  global: {
    windowMs: 15 * 60 * 1000,
    max: 10000000,
  },

  api: {
    windowMs: 15 * 60 * 1000,
    max: 5000000,
  },

  publicChatDailyAnon: {
    windowMs: 24 * 60 * 60 * 1000,
    max: 1000,
  },

  draftGeneration: {
    windowMs: 30 * 1000,
    max: 100, // Keep current testing value
  },

  // Other limits - loose for dev
  twinCreation: {
    windowMs: 60 * 60 * 1000,
    max: 50, // Keep current value
  },

  profileLink: {
    windowMs: 60 * 60 * 1000,
    max: 100, // Keep current value
  },

  inviteCreation: {
    windowMs: 24 * 60 * 60 * 1000,
    max: 50, // Keep current value
  },
};

/**
 * Export the appropriate limits based on environment
 */
export const RATE_LIMITS = isProd ? prodLimits : devLimits;

/**
 * Helper to format retry after message
 */
export const formatRetryAfter = (windowMs: number): string => {
  const minutes = Math.floor(windowMs / (60 * 1000));
  if (minutes < 1) {
    const seconds = Math.floor(windowMs / 1000);
    return `${seconds} second${seconds !== 1 ? 's' : ''}`;
  }
  return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
};

