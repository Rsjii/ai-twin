import { Request, Response, NextFunction } from 'express';
import { db } from '../../config/database';
import { logger } from '../../config/logger';
import { z } from 'zod';
import { AppError, createError } from '../../utils/errors';

// Validation schemas
const searchSchema = z.object({
  query: z.string().min(1, 'Search query is required').max(100, 'Search query too long'),
  limit: z.coerce.number().min(1).max(50).optional().default(20),
  offset: z.coerce.number().min(0).optional().default(0)
});

const trendingSchema = z.object({
  limit: z.coerce.number().min(1).max(50).optional().default(20),
  offset: z.coerce.number().min(0).optional().default(0),
  timeframe: z.enum(['day', 'week', 'month', 'all']).optional().default('week')
});

// Helper function to get blocked twin IDs for a user
async function getBlockedTwinIds(userId: string | undefined): Promise<string[]> {
  if (!userId) {
    // ✅ Debug: Log when user is not logged in
    console.log('[Discover] No userId provided, skipping blocked filter');
    return [];
  }
  
  try {
    const result = await db.query(
      'SELECT "twinId" FROM "TwinBlockedUsers" WHERE "userId" = $1',
      [userId]
    );
    
    // ✅ Debug: Log blocked twins found
    if (result.rows.length > 0) {
      console.log(`[Discover] Found ${result.rows.length} blocked twins for user ${userId}`);
    }
    
    return result.rows.map(row => row.twinId);
  } catch (error) {
    console.error('[Discover] Error getting blocked twin IDs:', error);
    // ✅ Return empty array on error (don't break discover)
    return [];
  }
}

// Helper function to build blocked filter SQL
function buildBlockedFilter(blockedIds: string[], paramOffset: number): { sql: string, params: string[] } {
  if (blockedIds.length === 0) {
    return { sql: '', params: [] };
  }
  const placeholders = blockedIds.map((_, i) => `$${paramOffset + i + 1}`).join(', ');
  return {
    sql: `AND t.id NOT IN (${placeholders})`,
    params: blockedIds
  };
}

// Helper function to build blockNonLoggedUsers filter (only for non-logged users)
function buildBlockNonLoggedUsersFilter(hasUser: boolean): string {
  if (hasUser) {
    // Logged-in users can see all twins (blockNonLoggedUsers doesn't apply to them)
    return '';
  }
  // Non-logged users: hide twins where blockNonLoggedUsers = true
  return `AND (t."blockNonLoggedUsers" = false OR t."blockNonLoggedUsers" IS NULL)`;
}

// Add after line 60, before getTrendingTwins
async function enrichTwinsWithUserInteraction(twins: any[], userId?: string) {
  if (!userId || twins.length === 0) {
    return twins.map(twin => ({ ...twin, hasLiked: false, hasFollowed: false }));
  }

  const twinIds = twins.map(t => t.id);
  if (twinIds.length === 0) return twins;

  // Get user's likes and follows for all twins in one query
  const [likes, follows] = await Promise.all([
    db.query(`
      SELECT "twinId" FROM "TwinLike" 
      WHERE "twinId" = ANY($1::text[]) AND "userId" = $2
    `, [twinIds, userId]),
    db.query(`
      SELECT "twinId" FROM "TwinFollow" 
      WHERE "twinId" = ANY($1::text[]) AND "userId" = $2
    `, [twinIds, userId])
  ]);

  const likedTwinIds = new Set(likes.rows.map(r => r.twinId));
  const followedTwinIds = new Set(follows.rows.map(r => r.twinId));

  return twins.map(twin => ({
    ...twin,
    hasLiked: likedTwinIds.has(twin.id),
    hasFollowed: followedTwinIds.has(twin.id)
  }));
}

// Get trending twins based on engagement
export const getTrendingTwins = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { limit=20, offset=0, timeframe='all' } = trendingSchema.parse(req.query);

    // Calculate time filter
    let timeFilter = '';
    
    switch (timeframe) {
      case 'day':
        timeFilter = `AND t."createdAt" >= NOW() - INTERVAL '1 day'`;
        break;
      case 'week':
        timeFilter = `AND t."createdAt" >= NOW() - INTERVAL '7 days'`;
        break;
      case 'month':
        timeFilter = `AND t."createdAt" >= NOW() - INTERVAL '30 days'`;
        break;
      case 'all':
      default:
        timeFilter = '';
        break;
    }

 // ✅ Get blocked twin IDs for logged-in user
 const hasUser = !!(req.user && req.user.id);
 let blockedTwinIds: string[] = [];
 
 if (hasUser) {
   console.log('[Discover] User logged in:', req.user.id);
   const blockedResult = await db.query(`
     SELECT "twinId" FROM "TwinBlockedUsers" WHERE "userId" = $1
   `, [req.user.id]);
   blockedTwinIds = blockedResult.rows.map(row => row.twinId);
   console.log('[Discover] Blocked twin IDs:', blockedTwinIds);
 } else {
   console.log('[Discover] No user (non-logged), will filter blockNonLoggedUsers');
 }

 // Build filters
 const blockedFilter = blockedTwinIds.length > 0 
   ? `AND t.id NOT IN (${blockedTwinIds.map((_, i) => `$${i + 3}`).join(', ')})`
   : '';
 
 const blockNonLoggedFilter = buildBlockNonLoggedUsersFilter(hasUser);
 
 console.log('[Discover] Filters:', { 
   hasUser, 
   blockedFilter, 
   blockNonLoggedFilter,
   blockedTwinIdsCount: blockedTwinIds.length 
 });      

    // Get trending twins with engagement score
    const trendingTwins = await db.query(`
      SELECT 
        t.id,
        t."publicHandle",
        t."bio",
        t."profileImage",
        t."verified",
        t."likeCount",
        t."followCount",
        t."chatCount",
        t."sampleReply",
        t."createdAt",
        u.handle as "userHandle",
        u.name as "userName",
        COALESCE(
          tp."engagementScore",
          (
            t."likeCount" * 0.3 +
            t."followCount" * 0.4 +
            t."chatCount" * 0.3 +
            CASE 
              WHEN t."verified" = true THEN 10 
              ELSE 0 
            END
          )
        ) as engagement_score
      FROM "Twin" t
      JOIN "User" u ON t."userId" = u.id
      LEFT JOIN "TwinPerformance" tp ON t.id = tp."twinId"
      WHERE t."isPublic" = true 
      ${blockNonLoggedFilter}
      ${timeFilter}
      AND (t."likeCount" > 0 OR t."followCount" > 0 OR t."chatCount" > 0)
      ${blockedFilter}
      ORDER BY engagement_score DESC, t."createdAt" DESC
      LIMIT $1 OFFSET $2
    `, blockedTwinIds.length > 0 
      ? [limit, offset, ...blockedTwinIds]
      : [limit, offset]);   
    
    // ✅ Fallback to recent if no trending results (also filter blocked)
    if (trendingTwins.rows.length === 0 && offset === 0) {
      const recentTwins = await db.query(`
        SELECT 
          t.id,
          t."publicHandle",
          t."bio",
          t."profileImage",
          t."verified",
          t."likeCount",
          t."followCount",
          t."chatCount",
          t."sampleReply",
          t."createdAt",
          u.handle as "userHandle",
          u.name as "userName",
          0 as engagement_score
        FROM "Twin" t
        JOIN "User" u ON t."userId" = u.id
        WHERE t."isPublic" = true 
        ${blockNonLoggedFilter}
        ${blockedFilter}
        ORDER BY t."createdAt" DESC
        LIMIT $1
      `, blockedTwinIds.length > 0 
        ? [limit, ...blockedTwinIds]
        : [limit]);
      
      return res.json({
        success: true,
        twins: recentTwins.rows,
        pagination: {
          limit,
          offset,
          total: recentTwins.rows.length
        },
        fallback: true
      });
    }

    const enrichedTwins = await enrichTwinsWithUserInteraction(
      trendingTwins.rows,
      req.user?.id
    );

    res.json({
      success: true,
      twins: enrichedTwins,
      pagination: {
        limit,
        offset,
        total: enrichedTwins.length
      }
    });

  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw createError.internal('Failed to get trending twins', error);
  }
};

// Search twins by handle, bio, or user name
export const searchTwins = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { query, limit, offset } = searchSchema.parse(req.query);

    // ✅ Get blocked twin IDs
    const hasUser = !!(req.user && req.user.id);
    const blockedTwinIds = await getBlockedTwinIds(req.user?.id);
    const blockedFilter = buildBlockedFilter(blockedTwinIds, 4);
    const blockNonLoggedFilter = buildBlockNonLoggedUsersFilter(hasUser);

    // Search twins by handle, bio, or user name
    const searchResults = await db.query(`
      SELECT 
        t.id,
        t."publicHandle",
        t."bio",
        t."profileImage",
        t."verified",
        t."likeCount",
        t."followCount",
        t."chatCount",
        t."sampleReply",
        t."createdAt",
        u.handle as "userHandle",
        u.name as "userName",
        -- Calculate relevance score
        (
          CASE 
            WHEN LOWER(t."publicHandle") LIKE LOWER($1) THEN 10
            WHEN LOWER(t."publicHandle") LIKE LOWER($2) THEN 5
            ELSE 0
          END +
          CASE 
            WHEN LOWER(t."bio") LIKE LOWER($1) THEN 5
            WHEN LOWER(t."bio") LIKE LOWER($2) THEN 3
            ELSE 0
          END +
          CASE 
            WHEN LOWER(u.handle) LIKE LOWER($1) THEN 3
            WHEN LOWER(u.handle) LIKE LOWER($2) THEN 2
            ELSE 0
          END +
          CASE 
            WHEN LOWER(u.name) LIKE LOWER($1) THEN 2
            WHEN LOWER(u.name) LIKE LOWER($2) THEN 1
            ELSE 0
          END
        ) as relevance_score
      FROM "Twin" t
      JOIN "User" u ON t."userId" = u.id
      WHERE t."isPublic" = true 
      ${blockNonLoggedFilter}
      ${blockedFilter.sql}
      AND (
        LOWER(t."publicHandle") LIKE LOWER($1) OR
        LOWER(t."bio") LIKE LOWER($1) OR
        LOWER(u.handle) LIKE LOWER($1) OR
        LOWER(u.name) LIKE LOWER($1)
      )
      ORDER BY relevance_score DESC, t."likeCount" DESC, t."createdAt" DESC
      LIMIT $3 OFFSET $4
    `, [`%${query}%`, `%${query}%`, limit, offset, ...blockedFilter.params]);

    const enrichedTwins = await enrichTwinsWithUserInteraction(
      searchResults.rows,
      req.user?.id
    );

    res.json({
      success: true,
      query,
      twins: enrichedTwins,
      pagination: {
        limit,
        offset,
        total: enrichedTwins.length
      }
    });

  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw createError.internal('Failed to search twins', error);
  }
};

// Get recommended twins for a user (if authenticated)
export const getRecommendedTwins = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { limit, offset } = trendingSchema.parse(req.query);

    // ✅ Get blocked twin IDs
    const hasUser = !!(req.user && req.user.id);
    const blockedTwinIds = await getBlockedTwinIds(req.user?.id);
    const blockedFilter = buildBlockedFilter(blockedTwinIds, 2);
    const blockNonLoggedFilter = buildBlockNonLoggedUsersFilter(hasUser);

    let recommendations = [];

    if (req.user) {
      // Get user's liked twins to find similar ones
      const userLikes = await db.query(`
        SELECT tl."twinId"
        FROM "TwinLike" tl
        WHERE tl."userId" = $1
        ORDER BY tl."createdAt" DESC
        LIMIT 10
      `, [req.user.id]);

      if (userLikes.rows.length > 0) {
        // Get twins similar to liked ones (by engagement patterns)
        const likedTwinIds = userLikes.rows.map(row => row.twinId);
        
        // Build blocked filter with proper parameter offset
        const paramOffset = likedTwinIds.length + 2; // $1 = userId, $2-$N = likedTwinIds
        const blockedFilterForLiked = buildBlockedFilter(blockedTwinIds, paramOffset);
        
        recommendations = await db.query(`
          SELECT 
            t.id,
            t."publicHandle",
            t."bio",
            t."profileImage",
            t."verified",
            t."likeCount",
            t."followCount",
            t."chatCount",
            t."sampleReply",
            t."createdAt",
            u.handle as "userHandle",
            u.name as "userName"
          FROM "Twin" t
          JOIN "User" u ON t."userId" = u.id
          WHERE t."isPublic" = true 
          ${blockNonLoggedFilter}
          AND t.id NOT IN (${likedTwinIds.map((_, i) => `$${i + 2}`).join(', ')})
          AND t."userId" != $1
          ${blockedFilterForLiked.sql}
          ORDER BY t."likeCount" DESC, t."chatCount" DESC, t."createdAt" DESC
          LIMIT $${likedTwinIds.length + 2} OFFSET $${likedTwinIds.length + 3}
        `, [req.user.id, ...likedTwinIds, limit, offset, ...blockedFilterForLiked.params]);
      }
    }

    // If no user or no likes, get popular twins
    if (recommendations.length === 0 || recommendations.rows.length === 0) {
      recommendations = await db.query(`
        SELECT 
          t.id,
          t."publicHandle",
          t."bio",
          t."profileImage",
          t."verified",
          t."likeCount",
          t."followCount",
          t."chatCount",
          t."sampleReply",
          t."createdAt",
          u.handle as "userHandle",
          u.name as "userName"
        FROM "Twin" t
        JOIN "User" u ON t."userId" = u.id
        WHERE t."isPublic" = true 
        ${blockNonLoggedFilter}
        ${blockedFilter.sql}
        ORDER BY t."likeCount" DESC, t."chatCount" DESC, t."createdAt" DESC
        LIMIT $1 OFFSET $2
      `, [limit, offset, ...blockedFilter.params]);
    }

    const enrichedTwins = await enrichTwinsWithUserInteraction(
      recommendations.rows || [],
      req.user?.id
    );

    res.json({
      success: true,
      twins: enrichedTwins,
      pagination: {
        limit,
        offset,
        total: enrichedTwins.length
      }
    });

  } catch (error) {
    logger.error('Get recommended twins error:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Invalid input', 
        details: error.errors 
      });
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get recently active twins
export const getRecentTwins = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { limit, offset } = trendingSchema.parse(req.query);

    // ✅ Get blocked twin IDs
    const hasUser = !!(req.user && req.user.id);
    const blockedTwinIds = await getBlockedTwinIds(req.user?.id);
    const blockedFilter = buildBlockedFilter(blockedTwinIds, 2);
    const blockNonLoggedFilter = buildBlockNonLoggedUsersFilter(hasUser);

    const recentTwins = await db.query(`
      SELECT 
        t.id,
        t."publicHandle",
        t."bio",
        t."profileImage",
        t."verified",
        t."likeCount",
        t."followCount",
        t."chatCount",
        t."sampleReply",
        t."createdAt",
        u.handle as "userHandle",
        u.name as "userName"
      FROM "Twin" t
      JOIN "User" u ON t."userId" = u.id
      WHERE t."isPublic" = true 
      ${blockNonLoggedFilter}
      ${blockedFilter.sql}
      ORDER BY t."createdAt" DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset, ...blockedFilter.params]);

    const enrichedTwins = await enrichTwinsWithUserInteraction(
      recentTwins.rows,
      req.user?.id
    );

    res.json({
      success: true,
      twins: enrichedTwins,
      pagination: {
        limit,
        offset,
        total: enrichedTwins.length
      }
    });

  } catch (error) {
    logger.error('Get recent twins error:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Invalid input', 
        details: error.errors 
      });
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get most liked twins
export const getMostLikedTwins = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { limit, offset } = trendingSchema.parse(req.query);

    // ✅ Get blocked twin IDs
    const hasUser = !!(req.user && req.user.id);
    const blockedTwinIds = await getBlockedTwinIds(req.user?.id);
    const blockedFilter = buildBlockedFilter(blockedTwinIds, 2);    
    const blockNonLoggedFilter = buildBlockNonLoggedUsersFilter(hasUser);

    const mostLikedTwins = await db.query(`
      SELECT 
        t.id,
        t."publicHandle",
        t."bio",
        t."profileImage",
        t."verified",
        t."likeCount",
        t."followCount",
        t."chatCount",
        t."sampleReply",
        t."createdAt",
        u.handle as "userHandle",
        u.name as "userName"
      FROM "Twin" t
      JOIN "User" u ON t."userId" = u.id
      WHERE t."isPublic" = true 
      ${blockNonLoggedFilter}
      ${blockedFilter.sql}
      ORDER BY t."likeCount" DESC, t."createdAt" DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset, ...blockedFilter.params]);

    const enrichedTwins = await enrichTwinsWithUserInteraction(
      mostLikedTwins.rows,
      req.user?.id
    );

    res.json({
      success: true,
      twins: enrichedTwins,
      pagination: {
        limit,
        offset,
        total: enrichedTwins.length
      }
    });

  } catch (error) {
    logger.error('Get most liked twins error:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Invalid input', 
        details: error.errors 
      });
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get most followed twins
export const getMostFollowedTwins = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { limit, offset } = trendingSchema.parse(req.query);

    // ✅ Get blocked twin IDs
    const hasUser = !!(req.user && req.user.id);
    const blockedTwinIds = await getBlockedTwinIds(req.user?.id);
    const blockedFilter = buildBlockedFilter(blockedTwinIds, 2);    
    const blockNonLoggedFilter = buildBlockNonLoggedUsersFilter(hasUser);

    const mostFollowedTwins = await db.query(`
      SELECT 
        t.id,
        t."publicHandle",
        t."bio",
        t."profileImage",
        t."verified",
        t."likeCount",
        t."followCount",
        t."chatCount",
        t."sampleReply",
        t."createdAt",
        u.handle as "userHandle",
        u.name as "userName"
      FROM "Twin" t
      JOIN "User" u ON t."userId" = u.id
      WHERE t."isPublic" = true 
      ${blockNonLoggedFilter}
      ${blockedFilter.sql}
      ORDER BY t."followCount" DESC, t."likeCount" DESC, t."createdAt" DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset, ...blockedFilter.params]);

    const enrichedTwins = await enrichTwinsWithUserInteraction(
      mostFollowedTwins.rows,
      req.user?.id
    );

    res.json({
      success: true,
      twins: enrichedTwins,
      pagination: {
        limit,
        offset,
        total: enrichedTwins.length
      }
    });

  } catch (error) {
    logger.error('Get most followed twins error:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Invalid input', 
        details: error.errors 
      });
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get popular twins (most liked + most followed + most chatted)
export const getPopularTwins = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { limit, offset } = trendingSchema.parse(req.query);

    // ✅ Get blocked twin IDs
    const hasUser = !!(req.user && req.user.id);
    const blockedTwinIds = await getBlockedTwinIds(req.user?.id);
    const blockedFilter = buildBlockedFilter(blockedTwinIds, 2);    
    const blockNonLoggedFilter = buildBlockNonLoggedUsersFilter(hasUser);

    // Get popular twins based on combined engagement
    const popularTwins = await db.query(`
      SELECT 
        t.id,
        t."publicHandle",
        t."bio",
        t."profileImage",
        t."verified",
        t."likeCount",
        t."followCount",
        t."chatCount",
        t."sampleReply",
        t."createdAt",
        u.handle as "userHandle",
        u.name as "userName",
        -- Use cached popularity score (fallback to calculated if missing)
        COALESCE(
          tp."popularityScore",
          (
            t."likeCount" * 0.4 +
            t."followCount" * 0.3 +
            t."chatCount" * 0.3
          )
        ) as popularity_score
      FROM "Twin" t
      JOIN "User" u ON t."userId" = u.id
      LEFT JOIN "TwinPerformance" tp ON t.id = tp."twinId"
      WHERE t."isPublic" = true 
      ${blockNonLoggedFilter}
      ${blockedFilter.sql}
      ORDER BY popularity_score DESC, t."createdAt" DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset, ...blockedFilter.params]);    

    const enrichedTwins = await enrichTwinsWithUserInteraction(
      popularTwins.rows,
      req.user?.id
    );

    res.json({
      success: true,
      twins: enrichedTwins,
      pagination: {
        limit,
        offset,
        total: enrichedTwins.length
      }
    });

  } catch (error) {
    logger.error('Get popular twins error:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Invalid input', 
        details: error.errors 
      });
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get discover feed (mixed content)
export const getDiscoverFeed = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { limit, offset } = trendingSchema.parse(req.query);

    // ✅ Get blocked twin IDs
    const hasUser = !!(req.user && req.user.id);
    const blockedTwinIds = await getBlockedTwinIds(req.user?.id);
    const blockedFilter = buildBlockedFilter(blockedTwinIds, 1);
    const blockNonLoggedFilter = buildBlockNonLoggedUsersFilter(hasUser);

    // Get mixed content: trending, recent, and popular
    const [trending, recent, popular] = await Promise.all([
      db.query(`
        SELECT 
          t.id,
          t."publicHandle",
          t."bio",
          t."profileImage",
          t."verified",
          t."likeCount",
          t."followCount",
          t."chatCount",
          t."sampleReply",
          t."createdAt",
          u.handle as "userHandle",
          u.name as "userName",
          'trending' as feed_type
        FROM "Twin" t
        JOIN "User" u ON t."userId" = u.id
        LEFT JOIN "TwinPerformance" tp ON t.id = tp."twinId"
        WHERE t."isPublic" = true 
        ${blockNonLoggedFilter}
        ${blockedFilter.sql}
        ORDER BY COALESCE(tp."engagementScore", 
          (t."likeCount" * 0.3 + t."followCount" * 0.4 + t."chatCount" * 0.3)
        ) DESC, t."createdAt" DESC         
        LIMIT $1
      `, [Math.ceil(limit / 3), ...blockedFilter.params]),
      
      db.query(`
        SELECT 
          t.id,
          t."publicHandle",
          t."bio",
          t."profileImage",
          t."verified",
          t."likeCount",
          t."followCount",
          t."chatCount",
          t."sampleReply",
          t."createdAt",
          u.handle as "userHandle",
          u.name as "userName",
          'recent' as feed_type
        FROM "Twin" t
        JOIN "User" u ON t."userId" = u.id
        WHERE t."isPublic" = true 
        ${blockNonLoggedFilter}
        ${blockedFilter.sql}
        ORDER BY t."createdAt" DESC
        LIMIT $1
      `, [Math.ceil(limit / 3), ...blockedFilter.params]),
      
      db.query(`
        SELECT 
          t.id,
          t."publicHandle",
          t."bio",
          t."profileImage",
          t."verified",
          t."likeCount",
          t."followCount",
          t."chatCount",
          t."sampleReply",
          t."createdAt",
          u.handle as "userHandle",
          u.name as "userName",
          'popular' as feed_type
        FROM "Twin" t
        JOIN "User" u ON t."userId" = u.id
        WHERE t."isPublic" = true 
        ${blockNonLoggedFilter}
        ${blockedFilter.sql}
        ORDER BY t."likeCount" DESC, t."chatCount" DESC
        LIMIT $1
      `, [Math.ceil(limit / 3), ...blockedFilter.params])
    ]);

    // Mix the results
    const mixedFeed = [];
    const maxLength = Math.max(trending.rows.length, recent.rows.length, popular.rows.length);
    
    for (let i = 0; i < maxLength; i++) {
      if (trending.rows[i]) mixedFeed.push(trending.rows[i]);
      if (recent.rows[i]) mixedFeed.push(recent.rows[i]);
      if (popular.rows[i]) mixedFeed.push(popular.rows[i]);
    }

    // Limit to requested amount
    const limitedFeed = mixedFeed.slice(0, limit);

    const enrichedTwins = await enrichTwinsWithUserInteraction(
      limitedFeed,
      req.user?.id
    );

    res.json({
      success: true,
      twins: enrichedTwins,
      pagination: {
        limit,
        offset,
        total: enrichedTwins.length
      }
    });

  } catch (error) {
    logger.error('Get discover feed error:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Invalid input', 
        details: error.errors 
      });
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
};
