import { db } from '../config/database';
import { logger } from '../config/logger';

/**
 * Calculate and update TwinPerformance scores in real-time
 * Called immediately after like/follow/chat operations
 */
export async function updateTwinPerformanceScores(twinId: string): Promise<void> {
  try {
    // Get current counts from Twin table
    const twinResult = await db.query(`
      SELECT "likeCount", "followCount", "chatCount", "verified"
      FROM "Twin"
      WHERE id = $1
    `, [twinId]);
    
    if (twinResult.rows.length === 0) {
      logger.warn(`Twin ${twinId} not found for performance update`);
      return;
    }
    
    const twin = twinResult.rows[0];
    
    // Calculate engagement score (for trending)
    const engagementScore = (
      (twin.likeCount || 0) * 0.3 +
      (twin.followCount || 0) * 0.4 +
      (twin.chatCount || 0) * 0.3 +
      (twin.verified ? 10 : 0)
    );
    
    // Calculate popularity score (for popular)
    const popularityScore = (
      (twin.likeCount || 0) * 0.4 +
      (twin.followCount || 0) * 0.3 +
      (twin.chatCount || 0) * 0.3
    );
    
    // Upsert to TwinPerformance table
    const id = `twin_perf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await db.query(`
      INSERT INTO "TwinPerformance" (id, "twinId", "engagementScore", "popularityScore", "updatedAt")
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT ("twinId")
      DO UPDATE SET
        "engagementScore" = EXCLUDED."engagementScore",
        "popularityScore" = EXCLUDED."popularityScore",
        "updatedAt" = NOW()
    `, [id, twinId, engagementScore, popularityScore]);
    
    logger.debug(`Updated TwinPerformance scores for twin ${twinId}: engagement=${engagementScore.toFixed(2)}, popularity=${popularityScore.toFixed(2)}`);
  } catch (error) {
    logger.error(`Error updating TwinPerformance scores for twin ${twinId}:`, error);
    // Don't fail the request - scores can be calculated later
  }
}