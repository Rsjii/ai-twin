"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTwinManage = getTwinManage;
const database_1 = require("../config/database");
const logger_1 = require("../config/logger");
const dbUtils_1 = require("../utils/dbUtils");
const errorHandler_1 = require("../utils/errorHandler");
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
        const analyticsResult = await (0, dbUtils_1.fastQuery)(`
      SELECT 
        -- Total chats: both PublicChat and private Chat
        (SELECT COUNT(*) FROM "PublicChat" WHERE "twinId" = $1) + 
        (SELECT COUNT(*) FROM "Chat" WHERE "twinId" = $1 AND "userId" = $2) as chats,
        -- Views: not tracked, return 0
        0 as views,
        -- Likes: from TwinLike table (used everywhere in codebase)
        (SELECT COUNT(*) FROM "TwinLike" WHERE "twinId" = $1) as likes,
        -- Follows: from TwinFollow table (used everywhere in codebase)
        (SELECT COUNT(*) FROM "TwinFollow" WHERE "twinId" = $1) as followers,
        -- Memory chunks: from MemoryLongTerm and style_anchors
        (SELECT COUNT(*) FROM "MemoryLongTerm" WHERE "twinId" = $1) + 
        (SELECT COUNT(*) FROM "style_anchors" WHERE twin_id = $1) as memories,        
        -- Style corrections: from style_corrections table (lowercase, snake_case - used in database.ts, performanceService.ts, etc.)
        (SELECT COUNT(*) FROM "style_corrections" WHERE twin_id = $1) as corrections,
        -- AI runs: from ai_runs table (lowercase, snake_case - used in database.ts, performanceService.ts, etc.)
        (SELECT COUNT(*) FROM "ai_runs" WHERE twin_id = $1) as aiRuns,
        -- Learning goals: table doesn't exist, return 0
        0 as goals
    `, [twinId, userId]);
        let recentChats = [];
        try {
            const recentChatsResult = await (0, dbUtils_1.fastQuery)(`
          SELECT 
            pc.id,
            pc.title,
            pc."createdAt",
            pc."lastActivity",
            COUNT(pm.id) as message_count,
            'public' as chat_type
          FROM "PublicChat" pc
          LEFT JOIN "PublicMessage" pm ON pc.id = pm."chatId"
          WHERE pc."twinId" = $1
          GROUP BY pc.id, pc.title, pc."createdAt", pc."lastActivity"
          ORDER BY COALESCE(pc."lastActivity", pc."createdAt") DESC
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
            const publicTwinResult = await (0, dbUtils_1.fastQuery)(`
        SELECT 
          id,
          "publicHandle" as handle,
          "isPublic" as is_public,
          "createdAt" as created_at
        FROM "Twin" 
        WHERE id = $1 AND "isPublic" = true
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
        let user = null;
        if (req.user) {
            const fullUser = await database_1.userQueries.findByEmail(req.user.email);
            if (fullUser) {
                user = {
                    id: fullUser.id,
                    email: fullUser.email,
                    handle: fullUser.handle,
                    name: fullUser.name,
                    profileImage: fullUser.profileImage,
                };
            }
        }
        res.render('twin-manage', {
            title: 'My Twin - Manage',
            user: user,
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
        (0, errorHandler_1.handleControllerError)(error, 'Failed to load twin management page');
    }
}
//# sourceMappingURL=twinManagePageController.js.map