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

pool.on('error', (err) => {
  logger.error('Database connection error:', err);
  // Don't exit process, just log the error
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
        logger.error(`[DB] ❌ Database query error (attempt ${attempts}):`, error.message);
        logger.error(`[DB] ❌ Query was:`, text.substring(0, 200));
        logger.error(`[DB] ❌ Error code:`, error.code);
        logger.error(`[DB] ❌ Error details:`, error);
        
        if (attempts >= maxAttempts) {
          logger.error('[DB] ❌ Database query failed after all retries:', error);
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

export default db;
