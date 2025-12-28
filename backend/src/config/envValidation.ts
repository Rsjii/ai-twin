import { logger } from './logger';
import { config, isProd } from './env';

/**
 * Validate required environment variables on startup
 * Fails fast if critical variables are missing
 */
export function validateEnv(): void {
  const required = ['DATABASE_URL'];
  
  // ✅ Only require production secrets if APP_ENV is EXPLICITLY set to 'prod'
  // Don't require if it's inferred from NODE_ENV=production
  const isExplicitlyProd = process.env['APP_ENV'] === 'prod';
  const requiredInProd = ['JWT_SECRET', 'SESSION_SECRET'];
  
  const missing = required.filter(key => !process.env[key]);
  const missingInProd = isExplicitlyProd ? requiredInProd.filter(key => !process.env[key]) : [];
  
  if (missing.length > 0) {
    const error = `Missing required env vars: ${missing.join(', ')}`;
    logger.error(error);
    throw new Error(error);
  }
  
  if (missingInProd.length > 0) {
    const error = `Missing required env vars for production: ${missingInProd.join(', ')}`;
    logger.error(error);
    throw new Error(error);
  }
  
  // ✅ SECURITY: Validate Resend API configuration in production (required for email sending)
  if (isProd) {
    if (!config.mail.smtp.pass) {
      const error = 'Missing required Resend API key (SMTP_PASS) for production. Email functionality will not work.';
      logger.error(error);
      throw new Error(error);
    }
    
    if (!config.mail.smtp.pass.startsWith('re_')) {
      logger.warn('⚠️ Resend API key format may be invalid. API key should start with "re_"');
    }
    
    logger.info('✅ Email configuration validated for production');
  }

  // ✅ ADD: Check for GROQ_API_KEY in production (warning only, not required)
  if (isExplicitlyProd && !process.env['GROQ_API_KEY']) {
    logger.warn('⚠️ GROQ_API_KEY not set in production. LLM features may not work.');
  }

  // ✅ ADD: Check for OPENAI_API_KEY (optional fallback)
  if (isExplicitlyProd && !process.env['OPENAI_API_KEY'] && !process.env['GROQ_API_KEY']) {
    logger.warn('⚠️ Neither OPENAI_API_KEY nor GROQ_API_KEY set. LLM features will not work.');
  }
  
  logger.info('✅ Environment variables validated');
}