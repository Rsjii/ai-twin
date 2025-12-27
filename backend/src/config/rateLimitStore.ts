import { db } from './db';
import { logger } from './logger';

/**
 * ClientRateLimitInfo interface for express-rate-limit v7
 */
interface ClientRateLimitInfo {
  totalHits: number;
  resetTime: Date;
}

/**
 * PostgreSQL-based rate limit store
 * Persists rate limit counters across server restarts
 * Compatible with express-rate-limit v7 store interface
 * 
 * Note: express-rate-limit v7 calls increment(key) without windowMs
 * We store windowMs per key on first increment, then reuse it from database
 */
export class PostgreSQLRateLimitStore {
  private cleanupInterval: NodeJS.Timeout | null = null;
  private windowMsMap: Map<string, number> = new Map(); // Cache windowMs per key
  private defaultWindowMs: number; // Default windowMs for new keys

  constructor(defaultWindowMs: number = 15 * 60 * 1000) {
    this.defaultWindowMs = defaultWindowMs;
    // Cleanup expired entries every hour
    this.cleanupInterval = setInterval(() => {
      this.cleanup().catch((err) => {
        logger.error({ err }, 'Rate limit cleanup error:');
      });
    }, 60 * 60 * 1000); // 1 hour
  }

  /**
   * Get current rate limit info for a key
   * Returns undefined if key doesn't exist or is expired
   */
  async get(key: string): Promise<ClientRateLimitInfo | undefined> {
    try {
      const result = await db.query(
        'SELECT count, reset_time FROM rate_limits WHERE key = $1',
        [key]
      );
      
      if (result.rows.length === 0) {
        return undefined;
      }

      const entry = result.rows[0];
      const now = Date.now();

      // If expired, delete and return undefined
      if (now > entry.reset_time) {
        await db.query('DELETE FROM rate_limits WHERE key = $1', [key]);
        return undefined;
      }

      return {
        totalHits: entry.count,
        resetTime: new Date(entry.reset_time),
      };
    } catch (error: any) {
      // ✅ FIX: Properly serialize error for Pino logger
      logger.error({ err: error }, 'Rate limit store get error:');
      return undefined; // Fail open - don't block requests
    }
  }

  /**
   * Increment count for a key
   * express-rate-limit v7 calls this with only (key), no windowMs parameter
   * We get windowMs from database (stored per key) or use cached value
   */
  async increment(key: string): Promise<ClientRateLimitInfo> {
    try {
      const now = Date.now();
      
      // Get windowMs from cache or database
      let storedWindowMs = this.windowMsMap.get(key);
      if (!storedWindowMs) {
        try {
          const existing = await db.query(
            'SELECT window_ms FROM rate_limits WHERE key = $1',
            [key]
          );
          if (existing.rows.length > 0 && existing.rows[0].window_ms) {
            storedWindowMs = Number(existing.rows[0].window_ms);
            this.windowMsMap.set(key, storedWindowMs);
          } else {
            // First time for this key - use default windowMs
            storedWindowMs = this.defaultWindowMs;
            this.windowMsMap.set(key, storedWindowMs);
          }
        } catch (queryError: any) {
          // If query fails (e.g., column doesn't exist), use default
          logger.warn(`Rate limit store: Could not get window_ms for key ${key}, using default:`, queryError.message);
          storedWindowMs = this.defaultWindowMs;
          this.windowMsMap.set(key, storedWindowMs);
        }
      }
      
      const resetTime = now + storedWindowMs;

      // Try to insert or update
      // ✅ FIX: Simplified query - handle window_ms column gracefully
      const result = await db.query(
        `INSERT INTO rate_limits (key, count, reset_time, window_ms, updated_at)
         VALUES ($1, 1, $2, $3, NOW())
         ON CONFLICT (key) 
         DO UPDATE SET 
           count = CASE 
             WHEN rate_limits.reset_time < $4 THEN 1
             ELSE rate_limits.count + 1
           END,
           reset_time = CASE 
             WHEN rate_limits.reset_time < $4 THEN $2
             ELSE rate_limits.reset_time
           END,
           window_ms = $3,
           updated_at = NOW()
         RETURNING count, reset_time, window_ms`,
        [key, resetTime, storedWindowMs, now]
      );

      // Update cache with actual windowMs from DB
      const actualWindowMs = result.rows[0]?.window_ms ? Number(result.rows[0].window_ms) : storedWindowMs;
      this.windowMsMap.set(key, actualWindowMs);

      return {
        totalHits: result.rows[0].count,
        resetTime: new Date(result.rows[0].reset_time),
      };
    } catch (error: any) {
      // ✅ FIX: Properly serialize error for Pino logger
      logger.error({
        err: error, // Pino will serialize Error objects from 'err' field
        error: error?.message || String(error),
        code: error?.code,
        detail: error?.detail,
        key: key.substring(0, 50), // Log first 50 chars of key
        stack: error?.stack?.substring(0, 200),
      }, 'Rate limit store increment error:');
      // Fail open - return minimal info to allow request
      const fallbackWindowMs = this.windowMsMap.get(key) || this.defaultWindowMs;
      return {
        totalHits: 1,
        resetTime: new Date(Date.now() + fallbackWindowMs),
      };
    }
  }

  /**
   * Decrement count (optional, for express-rate-limit compatibility)
   */
  async decrement(key: string): Promise<void> {
    try {
      await db.query(
        'UPDATE rate_limits SET count = GREATEST(count - 1, 0) WHERE key = $1',
        [key]
      );
    } catch (error) {
      logger.error({ err: error }, 'Rate limit store decrement error:');
    }
  }

  /**
   * Reset a specific key
   */
  async resetKey(key: string): Promise<void> {
    try {
      await db.query('DELETE FROM rate_limits WHERE key = $1', [key]);
    } catch (error) {
      logger.error({ err: error }, 'Rate limit store reset error:');
    }
  }

  /**
   * Reset all keys (for testing/admin)
   */
  async resetAll(): Promise<void> {
    try {
      await db.query('DELETE FROM rate_limits');
    } catch (error) {
      logger.error({ err: error }, 'Rate limit store resetAll error:');
    }
  }

  /**
   * Cleanup expired entries
   */
  async cleanup(): Promise<void> {
    try {
      const result = await db.query(
        'DELETE FROM rate_limits WHERE reset_time < $1',
        [Date.now()]
      );
      if (result.rowCount && result.rowCount > 0) {
        logger.debug(`Cleaned up ${result.rowCount} expired rate limit entries`);
      }
    } catch (error) {
      logger.error({ err: error }, 'Rate limit cleanup error:');
    }
  }

  /**
   * Shutdown cleanup
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

