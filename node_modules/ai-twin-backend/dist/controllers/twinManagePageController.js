"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTwinManage = getTwinManage;
const database_1 = require("../config/database");
const logger_1 = require("../config/logger");
const errors_1 = require("../utils/errors");
async function getTwinManage(req, res) {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.redirect('/auth');
        }
        const userTwins = await database_1.twinQueries.findByUserId(userId);
        const twin = userTwins.length > 0 ? userTwins[0] : null;
        if (!twin) {
            return res.redirect('/onboarding');
        }
        const twinId = twin.id;
        const fastQuery = async (queryText, params) => {
            try {
                const client = await database_1.db.getClient();
                try {
                    const result = await client.query(queryText, params);
                    return result || { rows: [] };
                }
                finally {
                    client.release();
                }
            }
            catch (error) {
                if (error?.code === '42P01') {
                    return { rows: [{ count: '0' }] };
                }
                logger_1.logger.warn('Query error (non-retry):', {
                    query: queryText.substring(0, 50),
                    error: error?.message
                });
                return { rows: [{ count: '0' }] };
            }
        };
        const analyticsResult = await fastQuery(`
      SELECT 
        (SELECT COUNT(*) FROM "PublicChat" WHERE "twinId" = $1) as chats,
        (SELECT COUNT(*) FROM "PublicTwinView" WHERE "twinId" = $1) as views,
        (SELECT COUNT(*) FROM "PublicTwinLike" WHERE "twinId" = $1) as likes,
        (SELECT COUNT(*) FROM "PublicTwinFollow" WHERE "twinId" = $1) as followers,
        (SELECT COUNT(*) FROM "mem_chunks" WHERE twin_id = $1) as memories,
        (SELECT COUNT(*) FROM "StyleCorrection" WHERE "twinId" = $1) as corrections,
        (SELECT COUNT(*) FROM "AIRun" WHERE "twinId" = $1) as aiRuns,
        (SELECT COUNT(*) FROM "LearningGoal" WHERE "twinId" = $1) as goals
    `, [twinId]);
        let recentChats = [];
        try {
            const recentChatsResult = await fastQuery(`
        SELECT 
          pc.id,
          pc.title,
          pc."createdAt",
          COUNT(pm.id) as message_count
        FROM "PublicChat" pc
        LEFT JOIN "PublicMessage" pm ON pc.id = pm."chatId"
        WHERE pc."twinId" = $1
        GROUP BY pc.id, pc.title, pc."createdAt"
        ORDER BY pc."createdAt" DESC
        LIMIT 5
      `, [twinId]);
            recentChats = recentChatsResult.rows || [];
        }
        catch (error) {
            logger_1.logger.warn('Error fetching recent chats:', {
                error: error instanceof Error ? error.message : 'Unknown error',
                twinId: twinId
            });
            recentChats = [];
        }
        let publicTwin = null;
        try {
            const publicTwinResult = await fastQuery(`
        SELECT 
          id,
          handle,
          is_public,
          created_at
        FROM "PublicTwin" 
        WHERE twin_id = $1
      `, [twinId]);
            publicTwin = publicTwinResult.rows.length > 0 ? publicTwinResult.rows[0] : null;
        }
        catch (error) {
            logger_1.logger.warn('Error fetching public twin:', {
                error: error instanceof Error ? error.message : 'Unknown error',
                twinId: twinId
            });
            publicTwin = null;
        }
        const row = analyticsResult?.rows?.[0] || {};
        const stats = {
            totalChats: parseInt(row.chats || '0', 10),
            totalViews: parseInt(row.views || '0', 10),
            totalLikes: parseInt(row.likes || '0', 10),
            totalFollowers: parseInt(row.followers || '0', 10),
            memoryChunks: parseInt(row.memories || '0', 10),
            styleCorrections: parseInt(row.corrections || '0', 10),
            aiRuns: parseInt(row.aiRuns || '0', 10),
            learningGoals: parseInt(row.goals || '0', 10)
        };
        res.render('twin-manage', {
            title: 'My Twin - Manage',
            user: req.user,
            twin: twin,
            twinId: twinId,
            stats: stats,
            publicTwin: publicTwin,
            recentChats: recentChats,
            hasTwins: true,
            csrfToken: res.locals['csrfToken']
        });
    }
    catch (error) {
        logger_1.logger.error('Twin manage page error:', {
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
        const appError = errors_1.createError.internal('Failed to load twin management page', error);
        return res.status(appError.statusCode).render('error', {
            title: 'Error',
            message: appError.message,
            errorCode: appError.errorCode,
            user: req.user || null
        });
    }
}
//# sourceMappingURL=twinManagePageController.js.map