"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDiscoverFeed = exports.getPopularTwins = exports.getMostFollowedTwins = exports.getMostLikedTwins = exports.getRecentTwins = exports.getRecommendedTwins = exports.searchTwins = exports.getTrendingTwins = void 0;
const database_1 = require("../../config/database");
const logger_1 = require("../../config/logger");
const zod_1 = require("zod");
const errorHandler_1 = require("../../utils/errorHandler");
const searchSchema = zod_1.z.object({
    query: zod_1.z.string().min(1, 'Search query is required').max(100, 'Search query too long'),
    limit: zod_1.z.coerce.number().min(1).max(50).optional().default(20),
    offset: zod_1.z.coerce.number().min(0).optional().default(0)
});
const trendingSchema = zod_1.z.object({
    limit: zod_1.z.coerce.number().min(1).max(50).optional().default(20),
    offset: zod_1.z.coerce.number().min(0).optional().default(0),
    timeframe: zod_1.z.enum(['day', 'week', 'month', 'all']).optional().default('week')
});
async function getBlockedTwinIds(userId) {
    if (!userId) {
        console.log('[Discover] No userId provided, skipping blocked filter');
        return [];
    }
    try {
        const result = await database_1.db.query('SELECT "twinId" FROM "TwinBlockedUsers" WHERE "userId" = $1', [userId]);
        if (result.rows.length > 0) {
            console.log(`[Discover] Found ${result.rows.length} blocked twins for user ${userId}`);
        }
        return result.rows.map(row => row.twinId);
    }
    catch (error) {
        console.error('[Discover] Error getting blocked twin IDs:', error);
        return [];
    }
}
function buildBlockedFilter(blockedIds, paramOffset) {
    if (blockedIds.length === 0) {
        return { sql: '', params: [] };
    }
    const placeholders = blockedIds.map((_, i) => `$${paramOffset + i + 1}`).join(', ');
    return {
        sql: `AND t.id NOT IN (${placeholders})`,
        params: blockedIds
    };
}
function buildBlockNonLoggedUsersFilter(hasUser) {
    if (hasUser) {
        return '';
    }
    return `AND (t."blockNonLoggedUsers" = false OR t."blockNonLoggedUsers" IS NULL)`;
}
async function enrichTwinsWithUserInteraction(twins, userId) {
    if (!userId || twins.length === 0) {
        return twins.map(twin => ({ ...twin, hasLiked: false, hasFollowed: false }));
    }
    const twinIds = twins.map(t => t.id);
    if (twinIds.length === 0)
        return twins;
    const [likes, follows] = await Promise.all([
        database_1.db.query(`
      SELECT "twinId" FROM "TwinLike" 
      WHERE "twinId" = ANY($1::text[]) AND "userId" = $2
    `, [twinIds, userId]),
        database_1.db.query(`
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
const getTrendingTwins = async (req, res, next) => {
    try {
        try {
            logger_1.logger.info('[DISCOVER_TRENDING:START]', {
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
                        id: req.user.id || req.user.userId,
                        email: req.user.email,
                        handle: req.user.handle,
                    }
                    : null,
                headers: {
                    ifNoneMatch: req.headers['if-none-match'] || null,
                    ifModifiedSince: req.headers['if-modified-since'] || null,
                    cacheControl: req.headers['cache-control'] || null,
                },
            });
        }
        catch (logErr) {
            logger_1.logger.warn('[DISCOVER_TRENDING] Failed to log START:', logErr);
        }
        const { limit = 20, offset = 0, timeframe = 'all' } = trendingSchema.parse(req.query);
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
        const hasUser = !!(req.user && req.user.id);
        let blockedTwinIds = [];
        if (hasUser) {
            console.log('[Discover] User logged in:', req.user.id);
            const blockedResult = await database_1.db.query(`
     SELECT "twinId" FROM "TwinBlockedUsers" WHERE "userId" = $1
   `, [req.user.id]);
            blockedTwinIds = blockedResult.rows.map(row => row.twinId);
            console.log('[Discover] Blocked twin IDs:', blockedTwinIds);
        }
        else {
            console.log('[Discover] No user (non-logged), will filter blockNonLoggedUsers');
        }
        const blockedFilter = blockedTwinIds.length > 0
            ? `AND t.id NOT IN (${blockedTwinIds.map((_, i) => `$${i + 1}`).join(', ')})`
            : '';
        const blockNonLoggedFilter = buildBlockNonLoggedUsersFilter(hasUser);
        console.log('[Discover] Filters:', {
            hasUser,
            blockedFilter,
            blockNonLoggedFilter,
            blockedTwinIdsCount: blockedTwinIds.length
        });
        const totalCountResult = await database_1.db.query(`
  SELECT COUNT(*) as total
  FROM "Twin" t
  JOIN "User" u ON t."userId" = u.id
  WHERE t."isPublic" = true 
  ${blockNonLoggedFilter}
  ${timeFilter}
  AND (t."likeCount" > 0 OR t."followCount" > 0 OR t."chatCount" > 0)
  ${blockedFilter}
`, blockedTwinIds.length > 0
            ? [...blockedTwinIds]
            : []);
        const totalCount = parseInt(totalCountResult.rows[0].total);
        console.log('[DISCOVER] Total count query result:', { totalCount, rows: totalCountResult.rows });
        const trendingTwins = await database_1.db.query(`
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
        t."allowShares",
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
      LIMIT $${blockedTwinIds.length + 1} OFFSET $${blockedTwinIds.length + 2}
    `, blockedTwinIds.length > 0
            ? [...blockedTwinIds, limit, offset]
            : [limit, offset]);
        console.log('[DISCOVER] Trending query result:', {
            rowsCount: trendingTwins.rows.length,
            limit,
            offset,
            queryParams: blockedTwinIds.length > 0 ? [...blockedTwinIds, limit, offset] : [limit, offset],
            firstTwinId: trendingTwins.rows[0]?.id || null,
        });
        if (trendingTwins.rows.length === 0 && offset === 0) {
            const recentTwins = await database_1.db.query(`
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
          t."allowShares",
          u.handle as "userHandle",
          u.name as "userName",
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
            try {
                logger_1.logger.info('[DISCOVER_TRENDING:FALLBACK]', {
                    recentTwinsCount: recentTwins.rows.length,
                    limit,
                    offset,
                });
            }
            catch (logErr) {
                logger_1.logger.warn('[DISCOVER_TRENDING] Failed to log FALLBACK:', logErr);
            }
            res.set({
                'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0, private',
                'Pragma': 'no-cache',
                'Expires': '0',
            });
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
        const enrichedTwins = await enrichTwinsWithUserInteraction(trendingTwins.rows, req.user?.id);
        console.log('[DISCOVER] Enriched twins:', {
            beforeEnrichment: trendingTwins.rows.length,
            afterEnrichment: enrichedTwins.length,
            sampleTwin: enrichedTwins[0] ? {
                id: enrichedTwins[0].id,
                publicHandle: enrichedTwins[0].publicHandle,
                hasLiked: enrichedTwins[0].hasLiked,
                hasFollowed: enrichedTwins[0].hasFollowed,
            } : null,
        });
        try {
            logger_1.logger.info('[DISCOVER_TRENDING:RESPONSE]', {
                twinsCount: enrichedTwins.length,
                totalCount,
                limit,
                offset,
                timeframe,
                userId: req.user ? (req.user.id || req.user.userId) : null,
            });
        }
        catch (logErr) {
            logger_1.logger.warn('[DISCOVER_TRENDING] Failed to log RESPONSE:', logErr);
        }
        console.log('[DISCOVER] Final response data:', {
            success: true,
            twinsCount: enrichedTwins.length,
            pagination: {
                limit,
                offset,
                total: totalCount,
                totalPages: Math.ceil(totalCount / limit),
                currentPage: Math.floor(offset / limit) + 1,
            },
        });
        res.set({
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0, private',
            'Pragma': 'no-cache',
            'Expires': '0',
        });
        res.json({
            success: true,
            twins: enrichedTwins,
            pagination: {
                limit,
                offset,
                total: totalCount,
                totalPages: Math.ceil(totalCount / limit),
                currentPage: Math.floor(offset / limit) + 1
            }
        });
    }
    catch (error) {
        (0, errorHandler_1.handleControllerError)(error, 'Failed to get trending twins');
    }
};
exports.getTrendingTwins = getTrendingTwins;
const searchTwins = async (req, res, next) => {
    try {
        const { query, limit, offset } = searchSchema.parse(req.query);
        const hasUser = !!(req.user && req.user.id);
        const blockedTwinIds = await getBlockedTwinIds(req.user?.id);
        const blockedFilter = buildBlockedFilter(blockedTwinIds, 4);
        const blockNonLoggedFilter = buildBlockNonLoggedUsersFilter(hasUser);
        const searchResults = await database_1.db.query(`
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
        const enrichedTwins = await enrichTwinsWithUserInteraction(searchResults.rows, req.user?.id);
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
    }
    catch (error) {
        (0, errorHandler_1.handleControllerError)(error, 'Failed to search twins');
    }
};
exports.searchTwins = searchTwins;
const getRecommendedTwins = async (req, res, next) => {
    try {
        const { limit, offset } = trendingSchema.parse(req.query);
        const hasUser = !!(req.user && req.user.id);
        const blockedTwinIds = await getBlockedTwinIds(req.user?.id);
        const blockedFilter = buildBlockedFilter(blockedTwinIds, 2);
        const blockNonLoggedFilter = buildBlockNonLoggedUsersFilter(hasUser);
        let recommendations = [];
        if (req.user) {
            const userLikes = await database_1.db.query(`
        SELECT tl."twinId"
        FROM "TwinLike" tl
        WHERE tl."userId" = $1
        ORDER BY tl."createdAt" DESC
        LIMIT 10
      `, [req.user.id]);
            if (userLikes.rows.length > 0) {
                const likedTwinIds = userLikes.rows.map(row => row.twinId);
                const paramOffset = likedTwinIds.length + 2;
                const blockedFilterForLiked = buildBlockedFilter(blockedTwinIds, paramOffset);
                recommendations = await database_1.db.query(`
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
        if (recommendations.length === 0 || recommendations.rows.length === 0) {
            recommendations = await database_1.db.query(`
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
        const enrichedTwins = await enrichTwinsWithUserInteraction(recommendations.rows || [], req.user?.id);
        res.json({
            success: true,
            twins: enrichedTwins,
            pagination: {
                limit,
                offset,
                total: enrichedTwins.length
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Get recommended twins error:', error);
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({
                error: 'Invalid input',
                details: error.errors
            });
        }
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getRecommendedTwins = getRecommendedTwins;
const getRecentTwins = async (req, res, next) => {
    try {
        const { limit, offset } = trendingSchema.parse(req.query);
        const hasUser = !!(req.user && req.user.id);
        const blockedTwinIds = await getBlockedTwinIds(req.user?.id);
        const blockedFilter = buildBlockedFilter(blockedTwinIds, 2);
        const blockNonLoggedFilter = buildBlockNonLoggedUsersFilter(hasUser);
        const recentTwins = await database_1.db.query(`
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
        const enrichedTwins = await enrichTwinsWithUserInteraction(recentTwins.rows, req.user?.id);
        res.json({
            success: true,
            twins: enrichedTwins,
            pagination: {
                limit,
                offset,
                total: enrichedTwins.length
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Get recent twins error:', error);
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({
                error: 'Invalid input',
                details: error.errors
            });
        }
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getRecentTwins = getRecentTwins;
const getMostLikedTwins = async (req, res, next) => {
    try {
        const { limit, offset } = trendingSchema.parse(req.query);
        const hasUser = !!(req.user && req.user.id);
        const blockedTwinIds = await getBlockedTwinIds(req.user?.id);
        const blockedFilter = buildBlockedFilter(blockedTwinIds, 2);
        const blockNonLoggedFilter = buildBlockNonLoggedUsersFilter(hasUser);
        const mostLikedTwins = await database_1.db.query(`
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
        const enrichedTwins = await enrichTwinsWithUserInteraction(mostLikedTwins.rows, req.user?.id);
        res.json({
            success: true,
            twins: enrichedTwins,
            pagination: {
                limit,
                offset,
                total: enrichedTwins.length
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Get most liked twins error:', error);
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({
                error: 'Invalid input',
                details: error.errors
            });
        }
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getMostLikedTwins = getMostLikedTwins;
const getMostFollowedTwins = async (req, res, next) => {
    try {
        const { limit, offset } = trendingSchema.parse(req.query);
        const hasUser = !!(req.user && req.user.id);
        const blockedTwinIds = await getBlockedTwinIds(req.user?.id);
        const blockedFilter = buildBlockedFilter(blockedTwinIds, 2);
        const blockNonLoggedFilter = buildBlockNonLoggedUsersFilter(hasUser);
        const mostFollowedTwins = await database_1.db.query(`
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
        const enrichedTwins = await enrichTwinsWithUserInteraction(mostFollowedTwins.rows, req.user?.id);
        res.json({
            success: true,
            twins: enrichedTwins,
            pagination: {
                limit,
                offset,
                total: enrichedTwins.length
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Get most followed twins error:', error);
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({
                error: 'Invalid input',
                details: error.errors
            });
        }
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getMostFollowedTwins = getMostFollowedTwins;
const getPopularTwins = async (req, res, next) => {
    try {
        const { limit, offset } = trendingSchema.parse(req.query);
        const hasUser = !!(req.user && req.user.id);
        const blockedTwinIds = await getBlockedTwinIds(req.user?.id);
        const blockedFilter = buildBlockedFilter(blockedTwinIds, 2);
        const blockNonLoggedFilter = buildBlockNonLoggedUsersFilter(hasUser);
        const popularTwins = await database_1.db.query(`
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
        const enrichedTwins = await enrichTwinsWithUserInteraction(popularTwins.rows, req.user?.id);
        res.json({
            success: true,
            twins: enrichedTwins,
            pagination: {
                limit,
                offset,
                total: enrichedTwins.length
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Get popular twins error:', error);
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({
                error: 'Invalid input',
                details: error.errors
            });
        }
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getPopularTwins = getPopularTwins;
const getDiscoverFeed = async (req, res, next) => {
    try {
        const { limit, offset } = trendingSchema.parse(req.query);
        const hasUser = !!(req.user && req.user.id);
        const blockedTwinIds = await getBlockedTwinIds(req.user?.id);
        const blockedFilter = buildBlockedFilter(blockedTwinIds, 1);
        const blockNonLoggedFilter = buildBlockNonLoggedUsersFilter(hasUser);
        const [trending, recent, popular] = await Promise.all([
            database_1.db.query(`
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
            database_1.db.query(`
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
            database_1.db.query(`
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
        const mixedFeed = [];
        const maxLength = Math.max(trending.rows.length, recent.rows.length, popular.rows.length);
        for (let i = 0; i < maxLength; i++) {
            if (trending.rows[i])
                mixedFeed.push(trending.rows[i]);
            if (recent.rows[i])
                mixedFeed.push(recent.rows[i]);
            if (popular.rows[i])
                mixedFeed.push(popular.rows[i]);
        }
        const limitedFeed = mixedFeed.slice(0, limit);
        const enrichedTwins = await enrichTwinsWithUserInteraction(limitedFeed, req.user?.id);
        res.json({
            success: true,
            twins: enrichedTwins,
            pagination: {
                limit,
                offset,
                total: enrichedTwins.length
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Get discover feed error:', error);
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({
                error: 'Invalid input',
                details: error.errors
            });
        }
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getDiscoverFeed = getDiscoverFeed;
//# sourceMappingURL=discoverController.js.map