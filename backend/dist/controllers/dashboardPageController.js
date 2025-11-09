"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDashboard = getDashboard;
const database_1 = require("../config/database");
const database_2 = require("../config/database");
const logger_1 = require("../config/logger");
const errors_1 = require("../utils/errors");
async function getDashboard(req, res) {
    try {
        if (!req.user) {
            return res.redirect('/auth');
        }
        const fullUser = await database_1.userQueries.findByEmail(req.user.email);
        if (!fullUser) {
            return res.redirect('/auth');
        }
        const userTwins = await database_1.twinQueries.findByUserId(fullUser.id);
        const hasTwins = userTwins.length > 0;
        const twin = hasTwins ? userTwins[0] : null;
        const twinId = twin && twin.id ? twin.id : null;
        let stats = {
            totalChats: 0,
            totalViews: 0,
            totalLikes: 0,
            totalFollowers: 0
        };
        try {
            const [chatsResult, eventsResult, twinStatsResult] = await Promise.all([
                database_2.db.query('SELECT COUNT(*) as count FROM "Chat" WHERE "userId" = $1', [fullUser.id]),
                database_2.db.query('SELECT COUNT(*) as count FROM "Event" WHERE "userId" = $1', [fullUser.id]),
                twin ? database_2.db.query(`
          SELECT "likeCount", "followCount", "chatCount"
          FROM "Twin"
          WHERE id = $1
        `, [twin.id]) : Promise.resolve({ rows: [] })
            ]);
            if (chatsResult && chatsResult.rows && chatsResult.rows[0]) {
                stats.totalChats = parseInt(chatsResult.rows[0].count || '0', 10);
            }
            if (eventsResult && eventsResult.rows && eventsResult.rows[0]) {
                stats.totalViews = parseInt(eventsResult.rows[0].count || '0', 10);
            }
            if (twin && twinStatsResult && twinStatsResult.rows && twinStatsResult.rows.length > 0) {
                const twinData = twinStatsResult.rows[0];
                stats.totalLikes = twinData.likeCount || 0;
                stats.totalFollowers = twinData.followCount || 0;
            }
        }
        catch (error) {
            logger_1.logger.warn('Error fetching stats:', {
                error: error instanceof Error ? error.message : 'Unknown error',
                userId: fullUser.id
            });
        }
        let recentActivity = [];
        try {
            const recentChatsResult = await database_2.db.query(`
        SELECT c.id, c.title, c."createdAt", c."updatedAt"
        FROM "Chat" c
        WHERE c."userId" = $1
        ORDER BY c."updatedAt" DESC
        LIMIT 5
      `, [fullUser.id]);
            if (recentChatsResult && recentChatsResult.rows) {
                recentActivity = recentChatsResult.rows.map(chat => ({
                    id: chat.id,
                    title: chat.title || 'Untitled Chat',
                    createdAt: chat.createdAt,
                    updatedAt: chat.updatedAt
                }));
            }
        }
        catch (error) {
            logger_1.logger.warn('Error fetching recent activity:', {
                error: error instanceof Error ? error.message : 'Unknown error',
                userId: fullUser.id
            });
        }
        const user = {
            id: fullUser.id,
            email: fullUser.email,
            handle: fullUser.handle,
            name: fullUser.name,
            profileImage: fullUser.profileImage,
        };
        res.render('dashboard', {
            title: 'Dashboard - AI Twin',
            user: user,
            hasTwins: hasTwins,
            twin: twin,
            twinId: twinId,
            stats: stats,
            recentActivity: recentActivity,
            csrfToken: res.locals['csrfToken']
        });
    }
    catch (error) {
        logger_1.logger.error('Dashboard page error:', {
            error: error instanceof Error ? error.message : 'Unknown error',
            userId: req.user?.id,
            path: req.path
        });
        if (error instanceof errors_1.AppError) {
            return res.status(error.statusCode).render('error', {
                title: 'Error',
                message: error.message,
                errorCode: error.errorCode,
                user: req.user || null
            });
        }
        const appError = errors_1.createError.internal('Failed to load dashboard', error);
        return res.status(appError.statusCode).render('error', {
            title: 'Error',
            message: appError.message,
            errorCode: appError.errorCode,
            user: req.user || null
        });
    }
}
//# sourceMappingURL=dashboardPageController.js.map