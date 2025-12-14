import { logger } from './logger';

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
  
  logger.info('✅ Environment variables validated');
}