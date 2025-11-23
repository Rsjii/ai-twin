import { db } from '../config/database';
import { logger } from '../config/logger';

/**
 * Fast query helper - avoids retry delays for missing tables/columns
 * Used for analytics queries where missing tables shouldn't block the page
 */
export const fastQuery = async (queryText: string, params?: any[]): Promise<{ rows: any[] }> => {
  try {
    const client = await db.getClient();
    try {
      const result = await client.query(queryText, params || []);
      return result || { rows: [] };
    } finally {
      client.release();
    }
  } catch (error: any) {
    // Missing table/column errors - return empty immediately
    if (error?.code === '42P01' || error?.code === '42703') {
      return { rows: [] };
    }
    // Log other errors but return empty to prevent crashes
    logger.error('Fast query error:', error?.message);
    return { rows: [] };
  }
};

