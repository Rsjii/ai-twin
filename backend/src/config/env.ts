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

// config now uses NODE_ENV
export const config = {
  // Database
  databaseUrl: process.env['DATABASE_URL'],
  
  // OpenAI API (KEEP - for fallback)
  openaiApiKey: process.env['OPENAI_API_KEY'],
  
  // Groq API
  groqApiKey: process.env['GROQ_API_KEY'],
  
  // Session Secret
  sessionSecret: process.env['SESSION_SECRET'],
  
  // Email Configuration
  mail: {
    from: process.env['MAIL_FROM'],
    smtp: {
      host: process.env['SMTP_HOST'],
      port: Number(process.env['SMTP_PORT']),
      user: process.env['SMTP_USER'],
      pass: process.env['SMTP_PASS']
    }
  },
  
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

  // ✅ Admin analytics only for local + staging, never in prod
  enableAdminAnalytics: isLocalOrStaging,
  
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