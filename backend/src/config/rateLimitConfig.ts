import { isProd } from './env';

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
 * Based on OWASP API Security guidelines and common SaaS practices
 */
const prodLimits = {
  // Critical auth flows - strict limits
  login: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 login attempts per 15 min per email/IP
  } as LimitConfig,

  otpRequest: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 3, // 3 OTP requests per 15 min per IP/email
  } as LimitConfig,

  otpVerify: {
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 5, // 5 OTP verification attempts per 10 min per email/IP
  } as LimitConfig,

  changePassword: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 1, // 1 password change attempts per hour per user
  } as LimitConfig,

  // Public/content flows - reasonable limits
  publicChatAnon: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 40, // 40 messages per 15 min for anonymous users
  } as LimitConfig,

  publicChatAuth: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 300, // 300 messages per 15 min for authenticated users
  } as LimitConfig,

  draftGeneration: {
    windowMs: 30 * 1000, // 30 seconds
    max: 15, // 15 drafts per 30 seconds per user
  } as LimitConfig,

  // Other limits (keep reasonable for prod)
  twinCreation: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // 5 twins per hour per user (reasonable for MVP)
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

