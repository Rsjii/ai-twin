import { db } from '../config/database';
import { createError, ErrorCodes } from './errors';

/**
 * Verify twin ownership - throws error if not owned by user
 * @throws AppError if twin not found or not owned by user
 */
export async function verifyTwinOwnership(twinId: string, userId: string): Promise<void> {
  const twin = await db.query(
    'SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2',
    [twinId, userId]
  );
  
  if (!twin || twin.rows.length === 0) {
    throw createError.notFound('Twin not found or access denied', ErrorCodes.TWIN_NOT_FOUND);
  }
}