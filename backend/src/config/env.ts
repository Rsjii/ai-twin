import dotenv from 'dotenv';
import path from 'path';

// Load .env
const envPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: envPath });

// ✅ Only 2 buckets: non-prod (local + staging) and prod
const NODE_ENV = process.env['NODE_ENV'] || 'development';

// APP_ENV can be:
// - 'local'   → your laptop / dev
// - 'staging' → staging server
// - 'prod'    → real production
const APP_ENV = process.env['APP_ENV'] || (NODE_ENV === 'production' ? 'prod' : 'local');

export const isProd = APP_ENV === 'prod';
export const isLocalOrStaging = APP_ENV !== 'prod';
export const isDev = APP_ENV === 'local';
export const isTest = NODE_ENV === 'test';

// ✅ ADD: Log environment configuration (using console to avoid circular dependency)
// This will be logged when the module loads
const envInfo = {
  NODE_ENV: NODE_ENV,
  APP_ENV: APP_ENV,
  isProd: isProd,
  isLocalOrStaging: isLocalOrStaging,
  isDev: isDev,
  isTest: isTest,
  envPath: envPath,
  NODE_ENV_from_env: process.env['NODE_ENV'] || 'NOT_SET',
  APP_ENV_from_env: process.env['APP_ENV'] || 'NOT_SET',
};

// Log environment config only in dev mode (logger not available yet)
if (isDev) {
  console.log('🔧 [ENV] Environment Configuration:', JSON.stringify(envInfo, null, 2));
}

// Export a function to log with logger once it's available
export const logEnvConfig = () => {
  // Dynamic import to avoid circular dependency
  import('./logger').then(({ logger }) => {
    logger.info('🔧 Environment Configuration:', envInfo);
  }).catch(() => {
    // Logger not available yet, already logged with console
  });
};

// config now uses NODE_ENV
export const config = {
  // Database
  databaseUrl: process.env['DATABASE_URL'],
  
  // ✅ Admin analytics database (production DB for local admin analytics)
  adminAnalyticsDbUrl: process.env['ADMIN_ANALYTICS_DB_URL'] || process.env['DATABASE_URL'],
  
  // OpenAI API (KEEP - for fallback)
  openaiApiKey: process.env['OPENAI_API_KEY'],
  
  // Groq API
  groqApiKey: process.env['GROQ_API_KEY'], // For logged-in users (can be paid tier)
  groqApiKeyAnonymous: process.env['GROQ_API_KEY_ANONYMOUS'], // ✅ Free tier for anonymous users only
  
  // Session Secret
  sessionSecret: process.env['SESSION_SECRET'],
  
  // Email Configuration
  mail: {
    from: process.env['MAIL_FROM'],
    supportEmail: process.env['SUPPORT_EMAIL'] || process.env['MAIL_FROM'], // Contact form emails go here
    smtp: {
      host: process.env['SMTP_HOST'],
      port: Number(process.env['SMTP_PORT']),
      user: process.env['SMTP_USER'],
      pass: process.env['SMTP_PASS']
    }
  },
  
  // Frontend URL (required in production)
  frontendUrl: process.env['FRONTEND_URL'],
  
  // Google OAuth Configuration
  google: {
    clientId: process.env['GOOGLE_CLIENT_ID'],
    clientSecret: process.env['GOOGLE_CLIENT_SECRET'],
    callbackURL: process.env['GOOGLE_CALLBACK_URL']
  },
  
  // App Configuration
  nodeEnv: NODE_ENV,
  appEnv: APP_ENV,
  port: Number(process.env['PORT']),

  // ✅ Admin analytics enabled in all environments (protected by admin email check)
  enableAdminAnalytics: true,
  
  // Rate Limiting
  rateLimit: {
    windowMs: Number(process.env['RATE_LIMIT_WINDOW_MS']), // 15 minutes
    maxRequests: Number(process.env['RATE_LIMIT_MAX_REQUESTS']) // ✅ Increased to 10M requests per 15 minutes
  },
  
  // OTP Configuration
  otp: {
    expiryMinutes: Number(process.env['OTP_EXPIRY_MINUTES']),
    codeLength: Number(process.env['OTP_CODE_LENGTH'])
  }
};

export const openai = {
  apiKey: process.env['OPENAI_API_KEY'],
};

export default config;