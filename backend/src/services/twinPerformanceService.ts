import { db } from '../config/database';
import { generateId } from '../utils/idGenerator';
import { logger } from '../config/logger';

/**
 * Calculate recent activity velocity (for trending boost)
 * Returns activity count in last 7 days
 */
async function calculateRecentActivity(twinId: string, days: number = 7): Promise<number> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    // Count recent likes, follows, and chats
    const recentActivity = await db.query(`
      SELECT 
        (SELECT COUNT(*) FROM "TwinLike" WHERE "twinId" = $1 AND "createdAt" >= $2) as recent_likes,
        (SELECT COUNT(*) FROM "TwinFollow" WHERE "twinId" = $1 AND "createdAt" >= $2) as recent_follows,
        (SELECT COUNT(*) FROM "PublicChat" WHERE "twinId" = $1 AND "createdAt" >= $2 AND "messageCount" > 0) as recent_chats
    `, [twinId, cutoffDate.toISOString()]);
    
    if (recentActivity.rows.length === 0) return 0;
    
    const row = recentActivity.rows[0];
    return (parseInt(row.recent_likes) || 0) + 
           (parseInt(row.recent_follows) || 0) + 
           (parseInt(row.recent_chats) || 0);
  } catch (error) {
    logger.error(`Error calculating recent activity for twin ${twinId}:`, error);
    return 0;
  }
}

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
    
    // Calculate recent activity for trending (last 7 days)
    const recentActivity = await calculateRecentActivity(twinId, 7);
    const totalActivity = (twin.likeCount || 0) + (twin.followCount || 0) + (twin.chatCount || 0);
    
    // Calculate engagement score (for trending) - TIME HAS HIGH WEIGHTAGE (65%)
    // Formula: (Time weight * recent_activity_score) + (Engagement weight * engagement_score)
    // Time weight: 65%, Engagement weight: 35%
    const recentActivityScore = recentActivity * 10; // Scale recent activity (multiply by 10 for proper weighting)
    const engagementMetricsScore = (
      (twin.likeCount || 0) * 0.25 +
      (twin.followCount || 0) * 0.35 +
      (twin.chatCount || 0) * 0.4 +  // Chat is most engaging
      (twin.verified ? 10 : 0)
    );
    
    // Trending: 65% time weight + 35% engagement weight
    const TIME_WEIGHT = 0.65;
    const ENGAGEMENT_WEIGHT = 0.35;
    const engagementScore = (recentActivityScore * TIME_WEIGHT) + (engagementMetricsScore * ENGAGEMENT_WEIGHT);
    
    // Calculate popularity score (for popular) - PURE ENGAGEMENT, NO TIME
    // Likes get highest weight (0.4) for popularity
    // No time consideration - pure all-time engagement
    const popularityScore = (
      (twin.likeCount || 0) * 0.4 +
      (twin.followCount || 0) * 0.3 +
      (twin.chatCount || 0) * 0.3
    );
    
    // Upsert to TwinPerformance table
    const id = generateId.twinPerf();
    const utcTimestamp = new Date().toISOString();
    await db.query(`
      INSERT INTO "TwinPerformance" (id, "twinId", "engagementScore", "popularityScore", "updatedAt")
      VALUES ($1, $2, $3, $4, $5::timestamptz)
      ON CONFLICT ("twinId")
      DO UPDATE SET
        "engagementScore" = EXCLUDED."engagementScore",
        "popularityScore" = EXCLUDED."popularityScore",
        "updatedAt" = $5::timestamptz
    `, [id, twinId, engagementScore, popularityScore, utcTimestamp]);
    
    logger.debug(`Updated TwinPerformance scores for twin ${twinId}: engagement=${engagementScore.toFixed(2)} (recent=${recentActivity}, time_weight=65%), popularity=${popularityScore.toFixed(2)} (pure_engagement)`);
  } catch (error) {
    logger.error(`Error updating TwinPerformance scores for twin ${twinId}:`, error);
    // Don't fail the request - scores can be calculated later
  }
}