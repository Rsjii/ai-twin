"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getChattersStats = exports.getReferralStats = exports.getTwinAnalytics = exports.getUserAnalytics = exports.createSampleData = exports.debugUserData = exports.getTwinPerformance = exports.getMetricsSummary = void 0;
const database_1 = require("../../config/database");
const logger_1 = require("../../config/logger");
const twinUtils_1 = require("../../utils/twinUtils");
const eventLogger_1 = require("../../services/eventLogger");
const constants_1 = require("../../config/constants");
const getMetricsSummary = async (_req, res) => {
    try {
        const [totalUsersResult, totalTwinsResult, totalChatsResult, totalMessagesResult, totalInvitesResult, totalEventsResult, recentSignupsResult, recentTwinsResult,] = await Promise.all([
            database_1.db.query('SELECT COUNT(*) as count FROM "User"'),
            database_1.db.query('SELECT COUNT(*) as count FROM "Twin"'),
            database_1.db.query('SELECT COUNT(*) as count FROM "Chat"'),
            database_1.db.query('SELECT COUNT(*) as count FROM "Message"'),
            database_1.db.query('SELECT COUNT(*) as count FROM "Invite"'),
            database_1.db.query('SELECT COUNT(*) as count FROM "Event"'),
            database_1.db.query('SELECT COUNT(*) as count FROM "User" WHERE "createdAt" >= NOW() - INTERVAL \'7 days\''),
            database_1.db.query('SELECT COUNT(*) as count FROM "Twin" WHERE "createdAt" >= NOW() - INTERVAL \'7 days\''),
        ]);
        const totalUsers = parseInt(totalUsersResult.rows[0].count);
        const totalTwins = parseInt(totalTwinsResult.rows[0].count);
        const totalChats = parseInt(totalChatsResult.rows[0].count);
        const totalMessages = parseInt(totalMessagesResult.rows[0].count);
        const totalInvites = parseInt(totalInvitesResult.rows[0].count);
        const totalEvents = parseInt(totalEventsResult.rows[0].count);
        const recentSignups = parseInt(recentSignupsResult.rows[0].count);
        const recentTwins = parseInt(recentTwinsResult.rows[0].count);
        const eventTypesResult = await database_1.db.query('SELECT type, COUNT(*) as count FROM "Event" GROUP BY type');
        const eventBreakdown = eventTypesResult.rows.reduce((acc, event) => {
            acc[event.type] = parseInt(event.count);
            return acc;
        }, {});
        res.json({
            summary: {
                totalUsers,
                totalTwins,
                totalChats,
                totalMessages,
                totalInvites,
                totalEvents,
                recentSignups,
                recentTwins,
            },
            eventBreakdown,
            timestamp: new Date().toISOString(),
        });
    }
    catch (error) {
        logger_1.logger.error('Get metrics error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getMetricsSummary = getMetricsSummary;
const getTwinPerformance = async (req, res) => {
    try {
        const { twinId } = req.params;
        const metrics = await database_1.db.query(`
      SELECT 
        COUNT(c.id) as totalChats,
        COUNT(m.id) as totalMessages,
        AVG(CASE WHEN m.sender = 'twin' THEN 1 ELSE 0 END) as responseRate
      FROM "Chat" c
      LEFT JOIN "Message" m ON c.id = m."chatId"
      WHERE c."twinId" = $1
    `, [twinId]);
        res.json({ success: true, metrics: metrics.rows[0] });
    }
    catch (error) {
        logger_1.logger.error('Twin performance error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getTwinPerformance = getTwinPerformance;
const debugUserData = async (req, res) => {
    try {
        let userId = null;
        if (req.user) {
            if (req.user.id) {
                userId = req.user.id;
            }
            else if (req.user.userId) {
                userId = req.user.userId;
            }
        }
        else if (req.session && req.session.userId) {
            userId = req.session.userId;
        }
        if (!userId) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const userResult = await database_1.db.query('SELECT * FROM "User" WHERE id = $1', [userId]);
        const user = userResult.rows[0];
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        const [twinsResult, chatsResult, eventsResult, invitesSentResult, invitesReceivedResult] = await Promise.all([
            database_1.db.query('SELECT COUNT(*) as count FROM "Twin" WHERE "userId" = $1', [userId]),
            database_1.db.query('SELECT COUNT(*) as count FROM "Chat" WHERE "userId" = $1', [userId]),
            database_1.db.query('SELECT COUNT(*) as count FROM "Event" WHERE "userId" = $1', [userId]),
            database_1.db.query('SELECT COUNT(*) as count FROM "Invite" WHERE "inviterId" = $1', [userId]),
            database_1.db.query('SELECT COUNT(*) as count FROM "Invite" WHERE "acceptedBy" = $1', [userId]),
        ]);
        res.json({
            success: true,
            user: user,
            counts: {
                twins: parseInt(twinsResult.rows[0].count),
                chats: parseInt(chatsResult.rows[0].count),
                events: parseInt(eventsResult.rows[0].count),
                invitesSent: parseInt(invitesSentResult.rows[0].count),
                invitesReceived: parseInt(invitesReceivedResult.rows[0].count),
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Debug user data error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.debugUserData = debugUserData;
const createSampleData = async (req, res) => {
    try {
        let userId = null;
        if (req.user) {
            if (req.user.id) {
                userId = req.user.id;
            }
            else if (req.user.userId) {
                userId = req.user.userId;
            }
        }
        else if (req.session && req.session.userId) {
            userId = req.session.userId;
        }
        if (!userId) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const sampleEvents = [
            { type: 'login', meta: { timestamp: new Date() } },
            { type: 'profile_view', meta: { source: 'dashboard' } },
            { type: 'twin_created', meta: { twinName: 'Sample Twin' } },
            { type: 'chat_started', meta: { twinId: 'sample-twin-id' } },
        ];
        for (const event of sampleEvents) {
            await (0, eventLogger_1.logEvent)(userId, event.type, event.meta);
        }
        res.json({
            success: true,
            message: 'Sample data created successfully'
        });
    }
    catch (error) {
        logger_1.logger.error('Create sample data error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.createSampleData = createSampleData;
const getUserAnalytics = async (req, res) => {
    try {
        try {
            logger_1.logger.info('[ANALYTICS_USER:START]', {
                path: req.path,
                method: req.method,
                userFromReq: req.user
                    ? {
                        id: req.user.id || req.user.userId,
                        email: req.user.email,
                        handle: req.user.handle,
                    }
                    : null,
                sessionUserId: req.session?.userId || null,
                headers: {
                    ifNoneMatch: req.headers['if-none-match'] || null,
                    ifModifiedSince: req.headers['if-modified-since'] || null,
                    cacheControl: req.headers['cache-control'] || null,
                },
            });
        }
        catch (logErr) {
            logger_1.logger.warn('[ANALYTICS_USER] Failed to log START:', logErr);
        }
        let userId = null;
        if (req.user) {
            if (req.user.id) {
                userId = req.user.id;
            }
            else if (req.user.userId) {
                userId = req.user.userId;
            }
        }
        else if (req.session && req.session.userId) {
            userId = req.session.userId;
        }
        if (!userId) {
            logger_1.logger.warn('[ANALYTICS_USER] No userId found - returning 401');
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }
        let userTwins = 0, userChats = 0, userMessages = 0, userInvitesSent = 0, userInvitesReceived = 0, userEvents = 0;
        let userEventBreakdown = {};
        let formattedActivity = [];
        try {
            const [twinsResult, chatsResult, messagesResult, invitesSentResult, invitesReceivedResult, eventsResult, userEventTypesResult, recentActivityResult] = await Promise.all([
                database_1.db.query('SELECT COUNT(*) as count FROM "Twin" WHERE "userId" = $1', [userId]),
                database_1.db.query('SELECT COUNT(*) as count FROM "Chat" WHERE "userId" = $1', [userId]),
                database_1.db.query('SELECT COUNT(*) as count FROM "Message" m JOIN "Chat" c ON m."chatId" = c.id WHERE c."userId" = $1', [userId]),
                database_1.db.query('SELECT COUNT(*) as count FROM "Invite" WHERE "inviterId" = $1', [userId]),
                database_1.db.query('SELECT COUNT(*) as count FROM "Invite" WHERE "acceptedBy" = $1', [userId]),
                database_1.db.query('SELECT COUNT(*) as count FROM "Event" WHERE "userId" = $1', [userId]),
                database_1.db.query('SELECT type, COUNT(*) as count FROM "Event" WHERE "userId" = $1 GROUP BY type', [userId]),
                database_1.db.query('SELECT type, "createdAt", meta FROM "Event" WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT ${QUERY_LIMITS.RECENT_ITEMS}', [userId])
            ]);
            userTwins = parseInt(twinsResult.rows[0].count);
            userChats = parseInt(chatsResult.rows[0].count);
            userMessages = parseInt(messagesResult.rows[0].count);
            userInvitesSent = parseInt(invitesSentResult.rows[0].count);
            userInvitesReceived = parseInt(invitesReceivedResult.rows[0].count);
            userEvents = parseInt(eventsResult.rows[0].count);
            console.log('[ANALYTICS] Query results:', {
                userTwins,
                userChats,
                userMessages,
                userInvitesSent,
                userInvitesReceived,
                userEvents,
                eventTypesCount: userEventTypesResult.rows.length,
                recentActivityCount: recentActivityResult.rows.length,
            });
            userEventBreakdown = userEventTypesResult.rows.reduce((acc, event) => {
                acc[event.type] = parseInt(event.count);
                return acc;
            }, {});
            formattedActivity = recentActivityResult.rows.map(event => ({
                description: `${event.type} activity`,
                timestamp: event.createdAt,
                metadata: event.meta,
            }));
        }
        catch (analyticsError) {
            logger_1.logger.error('Error fetching analytics data:', analyticsError);
            return res.status(500).json({ success: false, error: 'Failed to fetch analytics data' });
        }
        const responseData = {
            success: true,
            user: {
                id: userId,
                email: req.user?.email || 'Unknown',
                handle: req.user?.handle || 'Unknown',
            },
            analytics: {
                totalViews: userEvents || 0,
                totalLikes: userInvitesReceived || 0,
                totalFollowers: userInvitesSent || 0,
                totalChats: userChats || 0,
                twins: userTwins || 0,
                messages: userMessages || 0,
                invitesSent: userInvitesSent || 0,
                invitesReceived: userInvitesReceived || 0,
                events: userEvents || 0,
                recentActivity: formattedActivity || [],
            },
            eventBreakdown: userEventBreakdown || {},
        };
        try {
            logger_1.logger.info('[ANALYTICS_USER:RESPONSE]', {
                userId,
                analyticsData: {
                    totalViews: responseData.analytics.totalViews,
                    totalLikes: responseData.analytics.totalLikes,
                    totalChats: responseData.analytics.totalChats,
                    twins: responseData.analytics.twins,
                },
                eventBreakdownKeys: Object.keys(responseData.eventBreakdown),
            });
        }
        catch (logErr) {
            logger_1.logger.warn('[ANALYTICS_USER] Failed to log RESPONSE:', logErr);
        }
        console.log('[ANALYTICS] Final response data:', {
            success: responseData.success,
            userId: responseData.user.id,
            analytics: {
                totalViews: responseData.analytics.totalViews,
                totalLikes: responseData.analytics.totalLikes,
                totalFollowers: responseData.analytics.totalFollowers,
                totalChats: responseData.analytics.totalChats,
                twins: responseData.analytics.twins,
                messages: responseData.analytics.messages,
                events: responseData.analytics.events,
                recentActivityCount: responseData.analytics.recentActivity.length,
            },
            eventBreakdownCount: Object.keys(responseData.eventBreakdown).length,
        });
        res.set({
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0, private',
            'Pragma': 'no-cache',
            'Expires': '0',
        });
        res.json(responseData);
    }
    catch (error) {
        logger_1.logger.error('Get user analytics error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
};
exports.getUserAnalytics = getUserAnalytics;
const getTwinAnalytics = async (req, res) => {
    try {
        const { twinId } = req.params;
        const userId = req.user.id;
        await (0, twinUtils_1.verifyTwinOwnership)(twinId, userId);
        const [styleMetrics, criticScoreTrend, correctionsApplied, avgResponseTime, memoryStats, feedbackStats, chatStats] = await Promise.all([
            getStyleMetrics(twinId),
            getCriticScoreTrend(twinId),
            getCorrectionsCount(twinId),
            getAvgResponseTime(twinId),
            getMemoryStats(twinId),
            getFeedbackStats(twinId),
            getChatStats(twinId)
        ]);
        res.json({
            success: true,
            analytics: {
                styleMetrics,
                criticScoreTrend,
                correctionsApplied,
                avgResponseTime,
                memoryStats,
                feedbackStats,
                chatStats,
                generatedAt: new Date().toISOString()
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Get twin analytics error:', error);
        res.status(500).json({ error: 'Failed to get twin analytics' });
    }
};
exports.getTwinAnalytics = getTwinAnalytics;
async function getStyleMetrics(twinId) {
    const result = await database_1.db.query(`
    SELECT "styleVector" FROM "Twin" WHERE id = $1
  `, [twinId]);
    if (result.rows.length === 0)
        return null;
    const styleVector = result.rows[0].styleVector;
    return {
        tone: styleVector.tone || 'casual',
        formalityLevel: styleVector.formality_level || 0.5,
        emojiUsage: styleVector.emoji_usage || 0.3,
        humorStyle: styleVector.humor_style || 'light',
        questionFrequency: styleVector.question_frequency || 0.4,
        responseLength: styleVector.response_length_preference || 'detailed'
    };
}
async function getCriticScoreTrend(twinId) {
    const result = await database_1.db.query(`
    SELECT 
      DATE(ts) as date,
      AVG(critic_score) as avg_score,
      COUNT(*) as run_count
    FROM ai_runs 
    WHERE twin_id = $1 AND critic_score IS NOT NULL
    AND ts >= NOW() - INTERVAL '30 days'
    GROUP BY DATE(ts)
    ORDER BY date DESC
    LIMIT ${constants_1.QUERY_LIMITS.ANALYTICS_TIMELINE}
  `, [twinId]);
    return result.rows;
}
async function getCorrectionsCount(twinId) {
    const result = await database_1.db.query(`
    SELECT 
      COUNT(*) as total_corrections,
      COUNT(CASE WHEN delta > 0 THEN 1 END) as positive_corrections,
      COUNT(CASE WHEN delta < 0 THEN 1 END) as negative_corrections,
      AVG(delta) as avg_delta
    FROM style_corrections 
    WHERE twin_id = $1
  `, [twinId]);
    return result.rows[0];
}
async function getAvgResponseTime(twinId) {
    const result = await database_1.db.query(`
    SELECT AVG(latency_ms) as avg_latency
    FROM ai_runs 
    WHERE twin_id = $1 AND latency_ms IS NOT NULL
  `, [twinId]);
    return result.rows[0].avg_latency || 0;
}
async function getMemoryStats(twinId) {
    const [longTermResult, anchorsResult] = await Promise.all([
        database_1.db.query(`
      SELECT 
        category as bucket,
        COUNT(*) as count
      FROM "MemoryLongTerm"
      WHERE "twinId" = $1
      GROUP BY category
    `, [twinId]),
        database_1.db.query(`
      SELECT 
        'voice' as bucket,
        COUNT(*) as count
      FROM "style_anchors"
      WHERE twin_id = $1 AND type = 'phrase'
      GROUP BY bucket
    `, [twinId])
    ]);
    return [
        ...longTermResult.rows.map(row => ({
            bucket: row.bucket === 'fact' ? 'facts' : row.bucket,
            count: parseInt(row.count),
            public_count: 0
        })),
        ...anchorsResult.rows.map(row => ({
            bucket: row.bucket,
            count: parseInt(row.count),
            public_count: 0
        }))
    ];
}
async function getFeedbackStats(twinId) {
    const result = await database_1.db.query(`
    SELECT 
      user_rating,
      COUNT(*) as count
    FROM ai_runs 
    WHERE twin_id = $1 AND user_rating IS NOT NULL
    GROUP BY user_rating
  `, [twinId]);
    return result.rows;
}
async function getChatStats(twinId) {
    const result = await database_1.db.query(`
    SELECT 
      COUNT(*) as total_chats,
      COUNT(DISTINCT c.id) as unique_chats,
      AVG(message_count) as avg_messages_per_chat
    FROM "Chat" c
    LEFT JOIN (
      SELECT "chatId", COUNT(*) as message_count
      FROM "Message"
      GROUP BY "chatId"
    ) m ON c.id = m."chatId"
    WHERE c."twinId" = $1
  `, [twinId]);
    return result.rows[0];
}
const getReferralStats = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const totalResult = await database_1.db.query('SELECT COUNT(*) as count FROM "Invite" WHERE "inviterId" = $1 AND "acceptedBy" IS NOT NULL', [req.user.id]);
        const totalReferrals = parseInt(totalResult.rows[0].count);
        const referralsResult = await database_1.db.query(`SELECT 
         i.*, 
         u.id as user_id, u.email, u.name, u.handle, u."createdAt" as user_created
       FROM "Invite" i
       JOIN "User" u ON i."acceptedBy" = u.id
       WHERE i."inviterId" = $1 AND i."acceptedBy" IS NOT NULL
       ORDER BY i."createdAt" DESC
       LIMIT ${constants_1.QUERY_LIMITS.RECENT_ITEMS}`, [req.user.id]);
        res.json({
            success: true,
            stats: {
                totalReferrals,
                recentReferrals: referralsResult.rows.map(r => ({
                    referredUser: {
                        id: r.user_id,
                        email: r.email,
                        name: r.name,
                        handle: r.handle,
                        createdAt: r.user_created
                    },
                    joinedAt: r.createdAt
                }))
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Get referral stats error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getReferralStats = getReferralStats;
const getChattersStats = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const { twinId } = req.query;
        if (!twinId) {
            return res.status(400).json({ error: 'Twin ID is required' });
        }
        await (0, twinUtils_1.verifyTwinOwnership)(twinId, req.user.id);
        const stats = await database_1.db.query(`
      SELECT 
        COUNT(DISTINCT c."userId") as "totalChatters",
        COUNT(DISTINCT c.id) as "totalChats",
        COUNT(DISTINCT CASE 
          WHEN c."createdAt" >= NOW() - INTERVAL '7 days' THEN c."userId" 
        END) as "activeThisWeek"
      FROM "Chat" c
      WHERE c."twinId" = $1
    `, [twinId]);
        res.json({
            success: true,
            totalChatters: parseInt(stats.rows[0].totalChatters) || 0,
            totalChats: parseInt(stats.rows[0].totalChats) || 0,
            activeThisWeek: parseInt(stats.rows[0].activeThisWeek) || 0
        });
    }
    catch (error) {
        logger_1.logger.error('Get chatters stats error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getChattersStats = getChattersStats;
//# sourceMappingURL=analyticsController.js.map