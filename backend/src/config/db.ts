import { Pool } from 'pg';
import { config } from './env';
import { DB_RETRY, DB_POOL_CONFIG } from './constants';
import logger from './logger';

// ✅ CRITICAL FIX: Add timezone=UTC to connection string
// This ensures all connections use UTC timezone from the start
let connectionString = config.databaseUrl || '';
if (connectionString.includes('?')) {
  // Already has query params, append timezone
  connectionString = `${connectionString}&timezone=UTC`;
} else {
  // No query params, add timezone
  connectionString = `${connectionString}?timezone=UTC`;
}

// Create a connection pool with better settings
const pool = new Pool({
  connectionString: connectionString,
  ssl: {
    rejectUnauthorized: false
  },
  ...DB_POOL_CONFIG,
  // ✅ Add query timeouts to prevent hanging requests
  statement_timeout: 30000, // 30 seconds
  query_timeout: 30000, // 30 seconds
});

// Test the connection and verify UTC timezone
pool.on('connect', async (client) => {
  try {
    // Double-check timezone is UTC
    const timezoneResult = await client.query("SHOW timezone");
    const currentTimezone = timezoneResult.rows[0]?.timezone || 'unknown';
    logger.info('[DB] ✅ Connected to PostgreSQL database');
    logger.info('[DB] ✅ PostgreSQL timezone setting:', currentTimezone);
    
    if (currentTimezone.toLowerCase() !== 'utc') {
      logger.warn('[DB] ⚠️ WARNING: PostgreSQL timezone is not UTC! Setting to UTC...');
      await client.query("SET timezone = 'UTC'");
      const verifyResult = await client.query("SHOW timezone");
      logger.info('[DB] ✅ PostgreSQL timezone now set to:', verifyResult.rows[0]?.timezone);
    }
  } catch (err) {
    logger.error('[DB] ❌ Error setting/verifying timezone:', err);
  }
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
