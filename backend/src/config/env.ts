import dotenv from 'dotenv';
import path from 'path';

// Load .env file from backend root directory (explicit path)
const envPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: envPath });

// Debug: Log if Google OAuth env vars are loaded
if (process.env.GOOGLE_CLIENT_ID) {
  console.log('✅ GOOGLE_CLIENT_ID loaded from .env');
} else {
  console.log('⚠️ GOOGLE_CLIENT_ID not found in .env');
}

export const config = {
  // Database
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres.ovqfpobyqbbquvfxhibi:WzKZY+gg.H74hqZ@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres',
  
  // OpenAI API
  openaiApiKey: process.env.OPENAI_API_KEY || 'sk-proj-6JAVLf9eQwUxU9LQl_5XAo6439h600bQ9n7263806063',
  
  // Session Secret
  sessionSecret: process.env.SESSION_SECRET || 'your-super-secret-session-key-here',
  
  // Email Configuration
  mail: {
    from: process.env.MAIL_FROM || 'noreply@yourdomain.com',
    smtp: {
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      user: process.env.SMTP_USER || 'rsji1806@gmail.com',
      pass: process.env.SMTP_PASS || 'xtomoneelqsbgpql'
    }
  },
  
  // Google OAuth Configuration
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '181370507290-brlrtkce5b59d8tkgflabpblc5lo4kii.apps.googleusercontent.com',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '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',
    callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/api/auth/google/callback'
  },
  
  // App Configuration
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000'),
  
  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '9000000'), // 15 minutes
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '1000000') // ✅ Increased to 100k requests per 15 minutes (testing)
  },
  
  // OTP Configuration
  otp: {
    expiryMinutes: parseInt(process.env.OTP_EXPIRY_MINUTES || '10'),
    codeLength: parseInt(process.env.OTP_CODE_LENGTH || '6')
  }
};

export const openai = {
  apiKey: process.env.OPENAI_API_KEY || '',
};

export default config;