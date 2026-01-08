import { Request, Response, NextFunction } from 'express';
import { db } from '../../config/database';
import { logger } from '../../config/logger';
import { z } from 'zod';
import { AppError, createError } from '../../utils/errors';
import { tokenizeId, sanitizeTwin } from '../../utils/idTokenization';

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

// Helper function to get blocked twin IDs for a user (mutual hide)
async function getBlockedTwinIds(userId: string | undefined): Promise<string[]> {
  if (!userId) return [];

  try {
    // (1) Twins that blocked the viewer (existing behavior)
    const blockedMe = await db.query(
      `SELECT "twinId" FROM "TwinBlockedUsers" WHERE "userId" = $1`,
      [userId]
    );

    // (2) Twins owned by users the viewer blocked (NEW: mutual hide)
    const iBlockedOwners = await db.query(
      `
      SELECT t_target.id AS "twinId"
      FROM "Twin" t_target
      WHERE t_target."userId" IN (
        SELECT tbu."userId"
        FROM "TwinBlockedUsers" tbu
        JOIN "Twin" t_self ON t_self.id = tbu."twinId"
        WHERE t_self."userId" = $1
      )
      `,
      [userId]
    );

    return [...new Set([
      ...blockedMe.rows.map(r => r.twinId),
      ...iBlockedOwners.rows.map(r => r.twinId),
    ])];
  } catch (error) {
    logger.error('Error getting blocked twin IDs:', error);
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

// Helper functions for visible counts (excluding users blocked by the twin + users who blocked owner)
function visibleLikeCountSql(alias = 't') {
  return `
    (SELECT COUNT(*)
     FROM "TwinLike" tl
     WHERE tl."twinId" = ${alias}.id
       AND NOT EXISTS (
         SELECT 1 FROM "TwinBlockedUsers" tbu
         WHERE tbu."twinId" = ${alias}.id
           AND tbu."userId" = tl."userId"
       )
       AND NOT EXISTS (
         SELECT 1
         FROM "Twin" t2
         JOIN "TwinBlockedUsers" tbu2 ON tbu2."twinId" = t2.id
         WHERE t2."userId" = tl."userId"
           AND tbu2."userId" = ${alias}."userId"
       )
    )
  `;
}

function visibleFollowCountSql(alias = 't') {
  return `
    (SELECT COUNT(*)
     FROM "TwinFollow" tf
     WHERE tf."twinId" = ${alias}.id
       AND NOT EXISTS (
         SELECT 1 FROM "TwinBlockedUsers" tbu
         WHERE tbu."twinId" = ${alias}.id
           AND tbu."userId" = tf."userId"
       )
       AND NOT EXISTS (
         SELECT 1
         FROM "Twin" t2
         JOIN "TwinBlockedUsers" tbu2 ON tbu2."twinId" = t2.id
         WHERE t2."userId" = tf."userId"
           AND tbu2."userId" = ${alias}."userId"
       )
    )
  `;
}

function visibleChatCountSql(alias = 't') {
  return `
    (SELECT COUNT(*)
     FROM "PublicMessage" pm
     JOIN "PublicChat" pc ON pm."chatId" = pc.id
     WHERE pc."twinId" = ${alias}.id
       AND pm.sender = 'human'
       AND (pc."userId" IS NULL OR pc."userId" <> ${alias}."userId")
       AND (
         pc."userId" IS NULL
         OR (
           NOT EXISTS (
             SELECT 1 FROM "TwinBlockedUsers" tbu
             WHERE tbu."twinId" = ${alias}.id
               AND tbu."userId" = pc."userId"
           )
           AND NOT EXISTS (
             SELECT 1
             FROM "Twin" t2
             JOIN "TwinBlockedUsers" tbu2 ON tbu2."twinId" = t2.id
             WHERE t2."userId" = pc."userId"
               AND tbu2."userId" = ${alias}."userId"
           )
         )
       )
    )
  `;
}

// Add after line 60, before getTrendingTwins
async function enrichTwinsWithUserInteraction(twins: any[], userId?: string) {
  if (!userId || twins.length === 0) {
    return twins.map(twin => ({ 
      ...twin, 
      hasLiked: false, 
      hasFollowed: false,
      publicId: tokenizeId(twin.id, 'twin') // ✅ PHASE 5: Add publicId
    }));
  }  

  
  const twinIds = twins.map(t => t.id);
  if (twinIds.length === 0) return twins.map(twin => ({
    ...twin,
    publicId: tokenizeId(twin.id, 'twin') // ✅ PHASE 5: Add publicId
  }));

  // Get user's likes and follows for all twins in one query
  const [likes, follows, userTwins] = await Promise.all([
    db.query(`
      SELECT "twinId" FROM "TwinLike" 
      WHERE "twinId" = ANY($1::text[]) AND "userId" = $2
    `, [twinIds, userId]),
    db.query(`
      SELECT "twinId" FROM "TwinFollow" 
      WHERE "twinId" = ANY($1::text[]) AND "userId" = $2
    `, [twinIds, userId]),
    db.query(`
      SELECT id FROM "Twin" 
      WHERE "userId" = $1 and id = ANY($2::text[])
    `, [userId, twinIds])
  ]);

  const likedTwinIds = new Set(likes.rows.map(r => r.twinId));
  const followedTwinIds = new Set(follows.rows.map(r => r.twinId));
  const ownTwinIds = new Set(userTwins.rows.map(r => r.id));

  return twins.map(twin => ({
    ...twin,
    hasLiked: likedTwinIds.has(twin.id),
    hasFollowed: followedTwinIds.has(twin.id),
    isOwnTwin: ownTwinIds.has(twin.id),
    publicId: tokenizeId(twin.id, 'twin') // ✅ PHASE 5: Add publicId
  }));
}

// ✅ ADD: Helper function to sanitize twin arrays
function sanitizeTwinsArray(twins: any[]): any[] {
  return twins.map(twin => ({
    ...twin,
    publicId: tokenizeId(twin.id, 'twin'),
    id: twin.id // Keep for backward compatibility temporarily
  }));
}

// Get trending twins based on engagement
export const getTrendingTwins = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // ✅ ULTRA-DETAILED LOGGING for discover trending API
    try {
      logger.info('[DISCOVER_TRENDING:START]', {
        path: req.path,
        method: req.method,
        query: req.query,
        parsedQuery: {
          limit: req.query.limit,
          offset: req.query.offset,
          timeframe: req.query.timeframe,
        },
        userFromReq: req.user
          ? {
              id: (req.user as any).id || (req.user as any).userId,
              email: (req.user as any).email,
              handle: (req.user as any).handle,
            }
          : null,
        headers: {
          ifNoneMatch: req.headers['if-none-match'] || null,
          ifModifiedSince: req.headers['if-modified-since'] || null,
          cacheControl: req.headers['cache-control'] || null,
        },
      });
    } catch (logErr) {
      logger.warn('[DISCOVER_TRENDING] Failed to log START:', logErr);
    }

    const { limit=20, offset=0, timeframe='all' } = trendingSchema.parse(req.query);

    // ✅ FIX: Calculate time filter based on RECENT ACTIVITY, not creation date
    // Trending should show twins with activity in last X days, not twins created in last X days
    let timeFilter = '';
    let activityDays = 7; // Default: last 7 days
    
    switch (timeframe) {
      case 'day':
        activityDays = 1;
        // Filter: Show twins with activity (likes/follows/chats) in last 1 day
        timeFilter = `AND EXISTS (
          SELECT 1 FROM "TwinLike" tl WHERE tl."twinId" = t.id AND tl."createdAt" >= NOW() - INTERVAL '1 day'
          UNION ALL
          SELECT 1 FROM "TwinFollow" tf WHERE tf."twinId" = t.id AND tf."createdAt" >= NOW() - INTERVAL '1 day'
          UNION ALL
          SELECT 1 FROM "PublicChat" pc WHERE pc."twinId" = t.id AND pc."createdAt" >= NOW() - INTERVAL '1 day'
        )`;
        break;
      case 'week':
        activityDays = 7;
        // Filter: Show twins with activity in last 7 days
        timeFilter = `AND EXISTS (
          SELECT 1 FROM "TwinLike" tl WHERE tl."twinId" = t.id AND tl."createdAt" >= NOW() - INTERVAL '7 days'
          UNION ALL
          SELECT 1 FROM "TwinFollow" tf WHERE tf."twinId" = t.id AND tf."createdAt" >= NOW() - INTERVAL '7 days'
          UNION ALL
          SELECT 1 FROM "PublicChat" pc WHERE pc."twinId" = t.id AND pc."createdAt" >= NOW() - INTERVAL '7 days'
        )`;
        break;
      case 'month':
        activityDays = 30;
        // Filter: Show twins with activity in last 30 days
        timeFilter = `AND EXISTS (
          SELECT 1 FROM "TwinLike" tl WHERE tl."twinId" = t.id AND tl."createdAt" >= NOW() - INTERVAL '30 days'
          UNION ALL
          SELECT 1 FROM "TwinFollow" tf WHERE tf."twinId" = t.id AND tf."createdAt" >= NOW() - INTERVAL '30 days'
          UNION ALL
          SELECT 1 FROM "PublicChat" pc WHERE pc."twinId" = t.id AND pc."createdAt" >= NOW() - INTERVAL '30 days'
        )`;
        break;
      case 'all':
      default:
        activityDays = 7; // Default to 7 days for trending
        // Filter: Show twins with activity in last 7 days (default trending window)
        timeFilter = `AND EXISTS (
          SELECT 1 FROM "TwinLike" tl WHERE tl."twinId" = t.id AND tl."createdAt" >= NOW() - INTERVAL '7 days'
          UNION ALL
          SELECT 1 FROM "TwinFollow" tf WHERE tf."twinId" = t.id AND tf."createdAt" >= NOW() - INTERVAL '7 days'
          UNION ALL
          SELECT 1 FROM "PublicChat" pc WHERE pc."twinId" = t.id AND pc."createdAt" >= NOW() - INTERVAL '7 days'
        )`;
        break;
    }

 // ✅ Get hidden twins for logged-in user (mutual hide)
 const hasUser = !!(req.user && req.user.id);
 const blockedTwinIds: string[] = hasUser ? await getBlockedTwinIds(req.user!.id) : [];

 // Build filters
 const blockedFilter = blockedTwinIds.length > 0 
   ? `AND t.id NOT IN (${blockedTwinIds.map((_, i) => `$${i + 1}`).join(', ')})`
   : '';
 
 const blockNonLoggedFilter = buildBlockNonLoggedUsersFilter(hasUser);      

 const totalCountResult = await db.query(`
  SELECT COUNT(*) as total
  FROM "Twin" t
  JOIN "User" u ON t."userId" = u.id
  WHERE t."isPublic" = true 
  ${blockNonLoggedFilter}
  ${timeFilter}
  AND (${visibleLikeCountSql('t')} > 0 OR ${visibleFollowCountSql('t')} > 0 OR ${visibleChatCountSql('t')} > 0)
  ${blockedFilter}
`, blockedTwinIds.length > 0 
  ? [...blockedTwinIds]
  : []);

const totalCount = parseInt(totalCountResult.rows[0].total);

    // Get trending twins with engagement score
    const trendingTwins = await db.query(`
      SELECT 
        t.id,
        t."publicHandle",
        t."bio",
        t."profileImage",
        t."verified",
        ${visibleLikeCountSql('t')} as "likeCount",
        ${visibleFollowCountSql('t')} as "followCount",
        ${visibleChatCountSql('t')} as "chatCount",
        t."sampleReply",
        t."createdAt",
        t."allowShares",
        t."allowLikes",        
        t."allowFollows",      
        u.handle as "userHandle",
        u.name as "userName",
        u."profileImage" as "userProfileImage",
        COALESCE(
          tp."engagementScore",
          (
            -- Fallback: Calculate trending score with time weightage (65% time, 35% engagement)
            -- Note: Proper trending score with recent activity is calculated in TwinPerformance table
            -- This is just a fallback if TwinPerformance doesn't exist
            (
              -- Recent activity score (65% weight) - approximate with current counts
              (${visibleLikeCountSql('t')} + ${visibleFollowCountSql('t')} + ${visibleChatCountSql('t')}) * 10 * 0.65
            ) + (
              -- Engagement metrics (35% weight)
              (${visibleLikeCountSql('t')} * 0.25 + ${visibleFollowCountSql('t')} * 0.35 + 
               ${visibleChatCountSql('t')} * 0.4 +
               CASE WHEN t."verified" = true THEN 10 ELSE 0 END) * 0.35
            )
          )
        ) as engagement_score
      FROM "Twin" t
      JOIN "User" u ON t."userId" = u.id
      LEFT JOIN "TwinPerformance" tp ON t.id = tp."twinId"
      WHERE t."isPublic" = true 
      ${blockNonLoggedFilter}
      ${timeFilter}
      AND (${visibleLikeCountSql('t')} > 0 OR ${visibleFollowCountSql('t')} > 0 OR ${visibleChatCountSql('t')} > 0)
      ${blockedFilter}
      ORDER BY engagement_score DESC, t."createdAt" DESC
      LIMIT $${blockedTwinIds.length + 1} OFFSET $${blockedTwinIds.length + 2}
    `, blockedTwinIds.length > 0 
      ? [...blockedTwinIds, limit, offset]
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
          ${visibleLikeCountSql('t')} as "likeCount",
          ${visibleFollowCountSql('t')} as "followCount",
          ${visibleChatCountSql('t')} as "chatCount",
          t."sampleReply",
          t."createdAt",
          t."allowShares",
          u.handle as "userHandle",
          u.name as "userName",
          u."profileImage" as "userProfileImage",
          0 as engagement_score
        FROM "Twin" t
        JOIN "User" u ON t."userId" = u.id
        WHERE t."isPublic" = true 
        ${blockNonLoggedFilter}
        ${blockedFilter}
        ORDER BY t."createdAt" DESC
        LIMIT $${blockedTwinIds.length + 1}
      `, blockedTwinIds.length > 0 
        ? [...blockedTwinIds, limit]
        : [limit]);
      
      // ✅ Log fallback response
      try {
        logger.info('[DISCOVER_TRENDING:FALLBACK]', {
          recentTwinsCount: recentTwins.rows.length,
          limit,
          offset,
        });
      } catch (logErr) {
        logger.warn('[DISCOVER_TRENDING] Failed to log FALLBACK:', logErr);
      }

      res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0, private',
        'Pragma': 'no-cache',
        'Expires': '0',
      });

      // ✅ Sanitize twin IDs before sending
      const sanitizedTwins = recentTwins.rows.map(twin => ({
        ...twin,
        publicId: tokenizeId(twin.id, 'twin'),
        id: twin.id // Keep for backward compatibility temporarily
      }));

      return res.json({
        success: true,
        twins: sanitizedTwins,
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

    // ✅ Log response before sending
    try {
      logger.info('[DISCOVER_TRENDING:RESPONSE]', {
        twinsCount: enrichedTwins.length,
        totalCount,
        limit,
        offset,
        timeframe,
        userId: req.user ? ((req.user as any).id || (req.user as any).userId) : null,
      });
    } catch (logErr) {
      logger.warn('[DISCOVER_TRENDING] Failed to log RESPONSE:', logErr);
    }
   

    // ✅ Ensure no-cache headers (already set globally, but double-check)
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0, private',
      'Pragma': 'no-cache',
      'Expires': '0',
    });

    res.json({
      success: true,
      twins: enrichedTwins.map(twin => sanitizeTwin(twin)), // ✅ PHASE 5: Use sanitizeTwin
      pagination: {
        limit,
        offset,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: Math.floor(offset / limit) + 1
      }
    });    

  } catch (error) {
    logger.error('Failed to get trending twins:', error);
    return next(error);
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
        ${visibleLikeCountSql('t')} as "likeCount",
        ${visibleFollowCountSql('t')} as "followCount",
        ${visibleChatCountSql('t')} as "chatCount",
        t."sampleReply",
        t."createdAt",
        t."allowShares",
        t."allowLikes",        
        t."allowFollows",      
        u.handle as "userHandle",
        u.name as "userName",
        u."profileImage" as "userProfileImage",
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
      ORDER BY relevance_score DESC, ${visibleLikeCountSql('t')} DESC, t."createdAt" DESC
      LIMIT $3 OFFSET $4
    `, [`%${query}%`, `%${query}%`, limit, offset, ...blockedFilter.params]);

    const enrichedTwins = await enrichTwinsWithUserInteraction(
      searchResults.rows,
      req.user?.id
    );

    res.json({
      success: true,
      query,
      twins: enrichedTwins.map(twin => sanitizeTwin(twin)), // ✅ PHASE 5: Use sanitizeTwin
      pagination: {
        limit,
        offset,
        total: enrichedTwins.length
      }
    });

  } catch (error) {
    logger.error('Failed to search twins:', error);
    return next(error);
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

    let recommendationsResult: any | null = null;

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
        
        recommendationsResult = await db.query(`
          SELECT 
            t.id,
            t."publicHandle",
            t."bio",
            t."profileImage",
            t."verified",
            ${visibleLikeCountSql('t')} as "likeCount",
            ${visibleFollowCountSql('t')} as "followCount",
            ${visibleChatCountSql('t')} as "chatCount",
            t."sampleReply",
            t."createdAt",
            u.handle as "userHandle",
            u.name as "userName",
            u."profileImage" as "userProfileImage"
          FROM "Twin" t
          JOIN "User" u ON t."userId" = u.id
          WHERE t."isPublic" = true 
          ${blockNonLoggedFilter}
          AND t.id NOT IN (${likedTwinIds.map((_, i) => `$${i + 2}`).join(', ')})
          AND t."userId" != $1
          ${blockedFilterForLiked.sql}
          ORDER BY ${visibleLikeCountSql('t')} DESC, ${visibleChatCountSql('t')} DESC, t."createdAt" DESC
          LIMIT $${likedTwinIds.length + 2} OFFSET $${likedTwinIds.length + 3}
        `, [req.user.id, ...likedTwinIds, limit, offset, ...blockedFilterForLiked.params]);
      }
    }

    // If no user or no likes, get popular twins
    if (!recommendationsResult || recommendationsResult.rows.length === 0) {
      recommendationsResult = await db.query(`
        SELECT 
          t.id,
          t."publicHandle",
          t."bio",
          t."profileImage",
          t."verified",
          ${visibleLikeCountSql('t')} as "likeCount",
          ${visibleFollowCountSql('t')} as "followCount",
          ${visibleChatCountSql('t')} as "chatCount",
          t."sampleReply",
          t."createdAt",
          u.handle as "userHandle",
          u.name as "userName",
          u."profileImage" as "userProfileImage"
        FROM "Twin" t
        JOIN "User" u ON t."userId" = u.id
        WHERE t."isPublic" = true 
        ${blockNonLoggedFilter}
        ${blockedFilter.sql}
        ORDER BY ${visibleLikeCountSql('t')} DESC, ${visibleChatCountSql('t')} DESC, t."createdAt" DESC
        LIMIT $1 OFFSET $2
      `, [limit, offset, ...blockedFilter.params]);
    }

    const enrichedTwins = await enrichTwinsWithUserInteraction(
      recommendationsResult?.rows || [],
      req.user?.id
    );

    res.json({
      success: true,
      twins: enrichedTwins.map(twin => sanitizeTwin(twin)), // ✅ PHASE 5: Use sanitizeTwin
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
        ${visibleLikeCountSql('t')} as "likeCount",
        ${visibleFollowCountSql('t')} as "followCount",
        ${visibleChatCountSql('t')} as "chatCount",
        t."sampleReply",
        t."createdAt",
        t."allowShares",
        t."allowLikes",        
        t."allowFollows",      
        u.handle as "userHandle",
        u.name as "userName",
        u."profileImage" as "userProfileImage"
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
      twins: enrichedTwins.map(twin => sanitizeTwin(twin)), // ✅ PHASE 5: Use sanitizeTwin
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
        ${visibleLikeCountSql('t')} as "likeCount",
        ${visibleFollowCountSql('t')} as "followCount",
        ${visibleChatCountSql('t')} as "chatCount",
        t."sampleReply",
        t."createdAt",
        t."allowShares",
        t."allowLikes",        
        t."allowFollows",      
        u.handle as "userHandle",
        u.name as "userName",
        u."profileImage" as "userProfileImage"
      FROM "Twin" t
      JOIN "User" u ON t."userId" = u.id
      WHERE t."isPublic" = true 
      ${blockNonLoggedFilter}
      ${blockedFilter.sql}
      AND ${visibleLikeCountSql('t')} > 0
      ORDER BY ${visibleLikeCountSql('t')} DESC, t."createdAt" DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset, ...blockedFilter.params]);

    const enrichedTwins = await enrichTwinsWithUserInteraction(
      mostLikedTwins.rows,
      req.user?.id
    );

    res.json({
      success: true,
      twins: enrichedTwins.map(twin => sanitizeTwin(twin)), // ✅ PHASE 5: Use sanitizeTwin
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
        ${visibleLikeCountSql('t')} as "likeCount",
        ${visibleFollowCountSql('t')} as "followCount",
        ${visibleChatCountSql('t')} as "chatCount",
        t."sampleReply",
        t."createdAt",
        t."allowShares",
        t."allowLikes",        
        t."allowFollows",      
        u.handle as "userHandle",
        u.name as "userName",
        u."profileImage" as "userProfileImage"
      FROM "Twin" t
      JOIN "User" u ON t."userId" = u.id
      WHERE t."isPublic" = true 
      ${blockNonLoggedFilter}
      ${blockedFilter.sql}
      AND ${visibleFollowCountSql('t')} > 0
      ORDER BY ${visibleFollowCountSql('t')} DESC, ${visibleLikeCountSql('t')} DESC, t."createdAt" DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset, ...blockedFilter.params]);

    const enrichedTwins = await enrichTwinsWithUserInteraction(
      mostFollowedTwins.rows,
      req.user?.id
    );

    res.json({
      success: true,
      twins: enrichedTwins.map(twin => sanitizeTwin(twin)), // ✅ PHASE 5: Use sanitizeTwin
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
        ${visibleLikeCountSql('t')} as "likeCount",
        ${visibleFollowCountSql('t')} as "followCount",
        ${visibleChatCountSql('t')} as "chatCount",
        t."sampleReply",
        t."createdAt",
        t."allowShares",
        t."allowLikes",        
        t."allowFollows",      
        u.handle as "userHandle",
        u.name as "userName",
        u."profileImage" as "userProfileImage",
        -- Use cached popularity score (fallback to calculated if missing)
        COALESCE(
          tp."popularityScore",
          (
            ${visibleLikeCountSql('t')} * 0.4 +
            ${visibleFollowCountSql('t')} * 0.3 +
            ${visibleChatCountSql('t')} * 0.3
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
      twins: enrichedTwins.map(twin => sanitizeTwin(twin)), // ✅ PHASE 5: Use sanitizeTwin
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
          ${visibleLikeCountSql('t')} as "likeCount",
          ${visibleFollowCountSql('t')} as "followCount",
          ${visibleChatCountSql('t')} as "chatCount",
          t."sampleReply",
          t."createdAt",
          u.handle as "userHandle",
          u.name as "userName",
          u."profileImage" as "userProfileImage",
          'trending' as feed_type
        FROM "Twin" t
        JOIN "User" u ON t."userId" = u.id
        LEFT JOIN "TwinPerformance" tp ON t.id = tp."twinId"
        WHERE t."isPublic" = true 
        ${blockNonLoggedFilter}
        ${blockedFilter.sql}
        ORDER BY COALESCE(tp."engagementScore", 
          (${visibleLikeCountSql('t')} * 0.3 + ${visibleFollowCountSql('t')} * 0.4 + ${visibleChatCountSql('t')} * 0.3)
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
          ${visibleLikeCountSql('t')} as "likeCount",
          ${visibleFollowCountSql('t')} as "followCount",
          ${visibleChatCountSql('t')} as "chatCount",
          t."sampleReply",
          t."createdAt",
          u.handle as "userHandle",
          u.name as "userName",
          u."profileImage" as "userProfileImage",
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
          ${visibleLikeCountSql('t')} as "likeCount",
          ${visibleFollowCountSql('t')} as "followCount",
          ${visibleChatCountSql('t')} as "chatCount",
          t."sampleReply",
          t."createdAt",
          u.handle as "userHandle",
          u.name as "userName",
          u."profileImage" as "userProfileImage",
          'popular' as feed_type
        FROM "Twin" t
        JOIN "User" u ON t."userId" = u.id
        LEFT JOIN "TwinPerformance" tp ON t.id = tp."twinId"
        WHERE t."isPublic" = true 
        ${blockNonLoggedFilter}
        ${blockedFilter.sql}
        ORDER BY COALESCE(tp."popularityScore",
          (${visibleLikeCountSql('t')} * 0.4 + ${visibleFollowCountSql('t')} * 0.3 + ${visibleChatCountSql('t')} * 0.3)
        ) DESC, t."createdAt" DESC
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
      twins: enrichedTwins.map(twin => sanitizeTwin(twin)), // ✅ PHASE 5: Use sanitizeTwin
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
