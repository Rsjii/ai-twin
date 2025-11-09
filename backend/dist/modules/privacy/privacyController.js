"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPrivacyAnalytics = exports.isUserBlocked = exports.unblockUser = exports.blockUser = exports.getPrivacySettings = exports.updatePrivacySettings = void 0;
const database_1 = require("../../config/database");
const logger_1 = require("../../config/logger");
const eventLogger_1 = require("../../services/eventLogger");
const zod_1 = require("zod");
const updatePrivacySettingsSchema = zod_1.z.object({
    twinId: zod_1.z.string().min(1, 'Twin ID is required'),
    settings: zod_1.z.object({
        allowPublicChat: zod_1.z.boolean().optional(),
        showChatHistory: zod_1.z.boolean().optional(),
        allowAnonymousChat: zod_1.z.boolean().optional(),
        requireLogin: zod_1.z.boolean().optional(),
        allowLikes: zod_1.z.boolean().optional(),
        allowFollows: zod_1.z.boolean().optional(),
        allowShares: zod_1.z.boolean().optional(),
        moderateMessages: zod_1.z.boolean().optional(),
        blockSpecificUsers: zod_1.z.array(zod_1.z.string()).optional(),
        allowDirectMessages: zod_1.z.boolean().optional()
    })
});
const blockUserSchema = zod_1.z.object({
    twinId: zod_1.z.string().min(1, 'Twin ID is required'),
    userId: zod_1.z.string().min(1, 'User ID is required')
});
const updatePrivacySettings = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const { twinId, settings } = updatePrivacySettingsSchema.parse(req.body);
        const twinResult = await database_1.db.query(`
      SELECT id, "userId", "isPublic"
      FROM "Twin"
      WHERE id = $1 AND "userId" = $2
    `, [twinId, req.user.id]);
        if (twinResult.rows.length === 0) {
            return res.status(404).json({ error: 'Twin not found or not owned by user' });
        }
        const updateFields = [];
        const updateValues = [];
        let paramIndex = 1;
        if (settings.allowPublicChat !== undefined) {
            updateFields.push(`"allowPublicChat" = $${paramIndex}`);
            updateValues.push(settings.allowPublicChat);
            paramIndex++;
        }
        if (settings.showChatHistory !== undefined) {
            updateFields.push(`"showChatHistory" = $${paramIndex}`);
            updateValues.push(settings.showChatHistory);
            paramIndex++;
        }
        if (settings.allowAnonymousChat !== undefined) {
            updateFields.push(`"allowAnonymousChat" = $${paramIndex}`);
            updateValues.push(settings.allowAnonymousChat);
            paramIndex++;
        }
        if (settings.requireLogin !== undefined) {
            updateFields.push(`"requireLogin" = $${paramIndex}`);
            updateValues.push(settings.requireLogin);
            paramIndex++;
        }
        if (settings.allowLikes !== undefined) {
            updateFields.push(`"allowLikes" = $${paramIndex}`);
            updateValues.push(settings.allowLikes);
            paramIndex++;
        }
        if (settings.allowFollows !== undefined) {
            updateFields.push(`"allowFollows" = $${paramIndex}`);
            updateValues.push(settings.allowFollows);
            paramIndex++;
        }
        if (settings.allowShares !== undefined) {
            updateFields.push(`"allowShares" = $${paramIndex}`);
            updateValues.push(settings.allowShares);
            paramIndex++;
        }
        if (settings.moderateMessages !== undefined) {
            updateFields.push(`"moderateMessages" = $${paramIndex}`);
            updateValues.push(settings.moderateMessages);
            paramIndex++;
        }
        if (settings.allowDirectMessages !== undefined) {
            updateFields.push(`"allowDirectMessages" = $${paramIndex}`);
            updateValues.push(settings.allowDirectMessages);
            paramIndex++;
        }
        if (updateFields.length === 0) {
            return res.status(400).json({ error: 'No valid settings provided' });
        }
        updateValues.push(twinId, req.user.id);
        const updateQuery = `
      UPDATE "Twin"
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex} AND "userId" = $${paramIndex + 1}
      RETURNING *
    `;
        const result = await database_1.db.query(updateQuery, updateValues);
        if (settings.blockSpecificUsers !== undefined) {
            await database_1.db.query(`
        DELETE FROM "TwinBlockedUsers"
        WHERE "twinId" = $1
      `, [twinId]);
            if (settings.blockSpecificUsers.length > 0) {
                const blockValues = settings.blockSpecificUsers.map((userId, index) => `($${index * 3 + 1}, $${index * 3 + 2}, $${index * 3 + 3})`).join(', ');
                const blockQuery = `
          INSERT INTO "TwinBlockedUsers" ("id", "twinId", "userId", "createdAt")
          VALUES ${blockValues}
        `;
                const blockParams = settings.blockSpecificUsers.flatMap(userId => [
                    `block_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    twinId,
                    userId
                ]);
                await database_1.db.query(blockQuery, blockParams);
            }
        }
        await eventLogger_1.EventLogger.logUserEvent(req.user.id, 'privacy_settings_updated', {
            twinId,
            settings: settings
        });
        res.json({
            success: true,
            message: 'Privacy settings updated successfully',
            twin: result.rows[0]
        });
    }
    catch (error) {
        logger_1.logger.error('Update privacy settings error:', error);
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({
                error: 'Invalid input',
                details: error.errors
            });
        }
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.updatePrivacySettings = updatePrivacySettings;
const getPrivacySettings = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const { twinId } = req.params;
        const twinResult = await database_1.db.query(`
      SELECT id, "userId", "allowPublicChat", "showChatHistory", "allowAnonymousChat",
             "requireLogin", "allowLikes", "allowFollows", "allowShares", 
             "moderateMessages", "allowDirectMessages"
      FROM "Twin"
      WHERE id = $1 AND "userId" = $2
    `, [twinId, req.user.id]);
        if (twinResult.rows.length === 0) {
            return res.status(404).json({ error: 'Twin not found or not owned by user' });
        }
        const blockedUsersResult = await database_1.db.query(`
      SELECT u.id, u.handle, u.name
      FROM "TwinBlockedUsers" tbu
      JOIN "User" u ON tbu."userId" = u.id
      WHERE tbu."twinId" = $1
    `, [twinId]);
        const twin = twinResult.rows[0];
        const blockedUsers = blockedUsersResult.rows;
        res.json({
            success: true,
            settings: {
                allowPublicChat: twin.allowPublicChat ?? true,
                showChatHistory: twin.showChatHistory ?? true,
                allowAnonymousChat: twin.allowAnonymousChat ?? true,
                requireLogin: twin.requireLogin ?? false,
                allowLikes: twin.allowLikes ?? true,
                allowFollows: twin.allowFollows ?? true,
                allowShares: twin.allowShares ?? true,
                moderateMessages: twin.moderateMessages ?? false,
                allowDirectMessages: twin.allowDirectMessages ?? true,
                blockedUsers: blockedUsers
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Get privacy settings error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getPrivacySettings = getPrivacySettings;
const blockUser = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const { twinId, userId } = blockUserSchema.parse(req.body);
        const twinResult = await database_1.db.query(`
      SELECT id, "userId"
      FROM "Twin"
      WHERE id = $1 AND "userId" = $2
    `, [twinId, req.user.id]);
        if (twinResult.rows.length === 0) {
            return res.status(404).json({ error: 'Twin not found or not owned by user' });
        }
        const existingBlock = await database_1.db.query(`
      SELECT id FROM "TwinBlockedUsers"
      WHERE "twinId" = $1 AND "userId" = $2
    `, [twinId, userId]);
        if (existingBlock.rows.length > 0) {
            return res.status(400).json({ error: 'User is already blocked' });
        }
        await database_1.db.query(`
      INSERT INTO "TwinBlockedUsers" ("id", "twinId", "userId", "createdAt")
      VALUES ($1, $2, $3, NOW())
    `, [
            `block_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            twinId,
            userId
        ]);
        await eventLogger_1.EventLogger.logUserEvent(req.user.id, 'user_blocked', {
            twinId,
            blockedUserId: userId
        });
        res.json({
            success: true,
            message: 'User blocked successfully'
        });
    }
    catch (error) {
        logger_1.logger.error('Block user error:', error);
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({
                error: 'Invalid input',
                details: error.errors
            });
        }
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.blockUser = blockUser;
const unblockUser = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const { twinId, userId } = blockUserSchema.parse(req.body);
        const twinResult = await database_1.db.query(`
      SELECT id, "userId"
      FROM "Twin"
      WHERE id = $1 AND "userId" = $2
    `, [twinId, req.user.id]);
        if (twinResult.rows.length === 0) {
            return res.status(404).json({ error: 'Twin not found or not owned by user' });
        }
        const result = await database_1.db.query(`
      DELETE FROM "TwinBlockedUsers"
      WHERE "twinId" = $1 AND "userId" = $2
    `, [twinId, userId]);
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'User is not blocked' });
        }
        await eventLogger_1.EventLogger.logUserEvent(req.user.id, 'user_unblocked', {
            twinId,
            unblockedUserId: userId
        });
        res.json({
            success: true,
            message: 'User unblocked successfully'
        });
    }
    catch (error) {
        logger_1.logger.error('Unblock user error:', error);
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({
                error: 'Invalid input',
                details: error.errors
            });
        }
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.unblockUser = unblockUser;
const isUserBlocked = async (req, res) => {
    try {
        const { twinId, userId } = req.params;
        const result = await database_1.db.query(`
      SELECT id FROM "TwinBlockedUsers"
      WHERE "twinId" = $1 AND "userId" = $2
    `, [twinId, userId]);
        res.json({
            success: true,
            isBlocked: result.rows.length > 0
        });
    }
    catch (error) {
        logger_1.logger.error('Check user blocked error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.isUserBlocked = isUserBlocked;
const getPrivacyAnalytics = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const { twinId } = req.params;
        const twinResult = await database_1.db.query(`
      SELECT id, "userId"
      FROM "Twin"
      WHERE id = $1 AND "userId" = $2
    `, [twinId, req.user.id]);
        if (twinResult.rows.length === 0) {
            return res.status(404).json({ error: 'Twin not found or not owned by user' });
        }
        const analytics = await database_1.db.query(`
      SELECT 
        COUNT(CASE WHEN type = 'public_chat_started' THEN 1 END) as total_public_chats,
        COUNT(CASE WHEN type = 'twin_liked' THEN 1 END) as total_likes,
        COUNT(CASE WHEN type = 'twin_followed' THEN 1 END) as total_follows,
        COUNT(CASE WHEN type = 'twin_shared' THEN 1 END) as total_shares,
        COUNT(CASE WHEN type = 'user_blocked' THEN 1 END) as total_blocks,
        COUNT(CASE WHEN type = 'privacy_settings_updated' THEN 1 END) as settings_updates
      FROM "Event"
      WHERE meta->>'twinId' = $1
      AND "createdAt" >= NOW() - INTERVAL '30 days'
    `, [twinId]);
        const stats = analytics.rows[0];
        res.json({
            success: true,
            analytics: {
                totalPublicChats: parseInt(stats.total_public_chats) || 0,
                totalLikes: parseInt(stats.total_likes) || 0,
                totalFollows: parseInt(stats.total_follows) || 0,
                totalShares: parseInt(stats.total_shares) || 0,
                totalBlocks: parseInt(stats.total_blocks) || 0,
                settingsUpdates: parseInt(stats.settings_updates) || 0
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Get privacy analytics error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getPrivacyAnalytics = getPrivacyAnalytics;
//# sourceMappingURL=privacyController.js.map