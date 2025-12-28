import { Pool } from 'pg';
import { config } from './env';
import { DB_RETRY, DB_POOL_CONFIG } from './constants';
import logger from './logger';

// Create a connection pool with better settings
const pool = new Pool({
  connectionString: config.databaseUrl || '',
  ssl: {
    rejectUnauthorized: false
  },
  ...DB_POOL_CONFIG,
  // ✅ Add query timeouts to prevent hanging requests
  statement_timeout: 30000, // 30 seconds
  query_timeout: 30000, // 30 seconds
});

// ✅ SECURITY: Enhanced database pool error handler
pool.on('error', (err: Error) => {
  // Get pool statistics for context
  const poolStats = {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
  };

  const errorCode = (err as any).code || 'NO_CODE';
  const errorMessage = err.message || 'Unknown error';

  // ✅ FIX: Handle DNS/network errors more gracefully (common with session pruning)
  // ENOTFOUND/ETIMEDOUT errors are often temporary network issues, not critical failures
  if (errorCode === 'ENOTFOUND' || errorCode === 'ETIMEDOUT' || errorCode === 'ECONNREFUSED') {
    // Log as debug/warn for network issues (especially from background pruning)
    // These are non-critical - the app continues to work, sessions still function
    if (errorMessage.includes('prune') || errorMessage.includes('session')) {
      logger.debug('[DB_POOL_ERROR] Session pruning failed (network issue, non-critical):', {
        error: {
          name: err.name,
          message: errorMessage,
          code: errorCode,
        },
        poolStats,
        note: 'This is a background cleanup operation. Sessions still work normally.',
      });
    } else {
      logger.warn('[DB_POOL_ERROR] Database connection error (network issue):', {
        error: {
          name: err.name,
          message: errorMessage,
          code: errorCode,
        },
        poolStats,
      });
    }
  } else {
    // Log as error for other issues (actual database problems)
    logger.error('[DB_POOL_ERROR] Unexpected database pool error', {
      error: {
        name: err.name,
        message: errorMessage,
        code: errorCode,
        stack: err.stack?.substring(0, 500), // Limit stack trace length
      },
      poolStats,
      timestamp: new Date().toISOString(),
    });
  }

  // ✅ Don't exit process - let connection pool handle reconnection
  // The pool will automatically attempt to reconnect on next query
  // This prevents cascading failures and allows graceful degradation
});

// Database utility functions with retry logic
export const db = {
  // Execute a query and return results with retry
  query: async (text: string, params?: any[]) => {
    const start = Date.now();
    let attempts = 0;
    const maxAttempts = DB_RETRY.MAX_ATTEMPTS;
    
    while (attempts < maxAttempts) {
      try {
        const res = await pool.query(text, params);
        const duration = Date.now() - start;
        logger.debug('[DB] ✅ Executed query', { text: text.substring(0, 100), duration, rows: res.rowCount });
        return res;
      } catch (error: any) {
        attempts++;
        // ✅ FIX: Properly serialize error for Pino logger
        // Pino needs error objects to be passed as the first argument or in 'err' field
        const errorDetails = {
          err: error, // Pino will serialize Error objects from 'err' field
          message: error?.message || String(error),
          code: error?.code || 'NO_CODE',
          detail: error?.detail || 'NO_DETAIL',
          hint: error?.hint || 'NO_HINT',
          position: error?.position || 'NO_POSITION',
          query: text.substring(0, 300),
          params: params ? params.map(p => typeof p === 'string' ? p.substring(0, 50) : p) : [],
        };
        logger.error({ ...errorDetails }, `[DB] ❌ Database query error (attempt ${attempts})`);
        
        if (attempts >= maxAttempts) {
          logger.error({ err: error }, '[DB] ❌ Database query failed after all retries:');
          throw error;
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, DB_RETRY.BASE_DELAY_MS * attempts));
      }
    }
    throw new Error('Database query failed after all retries');
  },  

  // Get a client from the pool for transactions
  getClient: async () => {
    return await pool.connect();
  },

  // Close the pool
  close: async () => {
    await pool.end();
  }
};

// ✅ Admin analytics database pool (always uses production DB when ADMIN_ANALYTICS_DB_URL is set)
let adminAnalyticsPool: Pool | null = null;
if (config.adminAnalyticsDbUrl && config.adminAnalyticsDbUrl !== config.databaseUrl) {
  adminAnalyticsPool = new Pool({
    connectionString: config.adminAnalyticsDbUrl,
    ssl: {
      rejectUnauthorized: false
    },
    max: 5, // Lower pool for read-only analytics
    idleTimeoutMillis: 30000,
    statement_timeout: 30000,
    query_timeout: 30000,
  });
  
  adminAnalyticsPool.on('error', (err: Error) => {
    logger.error({ err }, '[ADMIN_ANALYTICS_DB_POOL_ERROR] Database pool error');
  });
  
  logger.info('✅ Admin analytics using separate production database');
}

// Export admin analytics DB (uses prod DB when running locally, falls back to main pool if not set)
export const adminAnalyticsDb = adminAnalyticsPool || pool;

export default db;
export { pool }; // ✅ Export pool for session store
