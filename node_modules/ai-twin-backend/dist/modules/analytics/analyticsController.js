"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getReferralStats = exports.getTwinAnalytics = exports.getUserAnalytics = exports.createSampleData = exports.debugUserData = exports.getTwinPerformance = exports.getMetricsSummary = void 0;
const database_1 = require("../../config/database");
const logger_1 = require("../../config/logger");
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
            const eventId = 'c' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
            await database_1.db.query('INSERT INTO "Event" (id, "userId", type, meta) VALUES ($1, $2, $3, $4)', [eventId, userId, event.type, JSON.stringify(event.meta)]);
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
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }
        let userExists;
        try {
            const userResult = await database_1.db.query('SELECT id FROM "User" WHERE id = $1', [userId]);
            userExists = userResult.rows[0];
        }
        catch (dbError) {
            logger_1.logger.error('Database error checking user:', dbError);
            return res.status(500).json({ success: false, error: 'Database connection error' });
        }
        if (!userExists) {
            try {
                await database_1.db.query('INSERT INTO "User" (id, email, handle, active) VALUES ($1, $2, $3, $4)', [userId, req.user?.email || 'unknown@example.com', req.user?.handle || 'unknown', true]);
            }
            catch (createError) {
                logger_1.logger.error('Error creating user record:', createError);
                return res.status(500).json({ success: false, error: 'Failed to create user record' });
            }
        }
        let userTwins = 0, userChats = 0, userMessages = 0, userInvitesSent = 0, userInvitesReceived = 0, userEvents = 0;
        try {
            const [twinsResult, chatsResult, messagesResult, invitesSentResult, invitesReceivedResult, eventsResult] = await Promise.all([
                database_1.db.query('SELECT COUNT(*) as count FROM "Twin" WHERE "userId" = $1', [userId]),
                database_1.db.query('SELECT COUNT(*) as count FROM "Chat" WHERE "userId" = $1', [userId]),
                database_1.db.query('SELECT COUNT(*) as count FROM "Message" m JOIN "Chat" c ON m."chatId" = c.id WHERE c."userId" = $1', [userId]),
                database_1.db.query('SELECT COUNT(*) as count FROM "Invite" WHERE "inviterId" = $1', [userId]),
                database_1.db.query('SELECT COUNT(*) as count FROM "Invite" WHERE "acceptedBy" = $1', [userId]),
                database_1.db.query('SELECT COUNT(*) as count FROM "Event" WHERE "userId" = $1', [userId]),
            ]);
            userTwins = parseInt(twinsResult.rows[0].count);
            userChats = parseInt(chatsResult.rows[0].count);
            userMessages = parseInt(messagesResult.rows[0].count);
            userInvitesSent = parseInt(invitesSentResult.rows[0].count);
            userInvitesReceived = parseInt(invitesReceivedResult.rows[0].count);
            userEvents = parseInt(eventsResult.rows[0].count);
        }
        catch (analyticsError) {
            logger_1.logger.error('Error fetching analytics data:', analyticsError);
            return res.status(500).json({ success: false, error: 'Failed to fetch analytics data' });
        }
        let userEventBreakdown = {};
        let formattedActivity = [];
        try {
            const userEventTypesResult = await database_1.db.query('SELECT type, COUNT(*) as count FROM "Event" WHERE "userId" = $1 GROUP BY type', [userId]);
            userEventBreakdown = userEventTypesResult.rows.reduce((acc, event) => {
                acc[event.type] = parseInt(event.count);
                return acc;
            }, {});
            const recentActivityResult = await database_1.db.query('SELECT type, "createdAt", meta FROM "Event" WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT 10', [userId]);
            formattedActivity = recentActivityResult.rows.map(event => ({
                description: `${event.type} activity`,
                timestamp: event.createdAt,
                metadata: event.meta,
            }));
        }
        catch (eventError) {
            logger_1.logger.error('Error fetching event data:', eventError);
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
        const twinResult = await database_1.db.query(`
      SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);
        if (twinResult.rows.length === 0) {
            return res.status(404).json({ error: 'Twin not found or access denied' });
        }
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
    LIMIT 30
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
    const result = await database_1.db.query(`
    SELECT 
      bucket,
      COUNT(*) as count,
      COUNT(CASE WHEN is_public THEN 1 END) as public_count
    FROM mem_chunks 
    WHERE twin_id = $1
    GROUP BY bucket
  `, [twinId]);
    return result.rows;
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
       LIMIT 10`, [req.user.id]);
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
//# sourceMappingURL=analyticsController.js.map