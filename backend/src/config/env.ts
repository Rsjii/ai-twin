import dotenv from 'dotenv';

dotenv.config();

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
  
  // App Configuration
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000'),
  
  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '10000') // 10000 requests per 15 minutes (increased for testing)
  },
  
  // OTP Configuration
  otp: {
    expiryMinutes: parseInt(process.env.OTP_EXPIRY_MINUTES || '10'),
    codeLength: parseInt(process.env.OTP_CODE_LENGTH || '6')
  }
};

export default config;
