"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTwinChatters = exports.getTwinFollowers = exports.getTwinLikers = exports.toggleFollow = exports.toggleLike = exports.getUserFollowedTwins = exports.getUserLikedTwins = exports.getTwinStats = exports.unfollowTwin = exports.followTwin = exports.unlikeTwin = exports.likeTwin = void 0;
const database_1 = require("../../config/database");
const logger_1 = require("../../config/logger");
const eventLogger_1 = require("../../services/eventLogger");
const zod_1 = require("zod");
const likeTwinSchema = zod_1.z.object({
    twinId: zod_1.z.string().min(1, 'Twin ID is required')
});
const followTwinSchema = zod_1.z.object({
    twinId: zod_1.z.string().min(1, 'Twin ID is required')
});
const likeTwin = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const { twinId } = likeTwinSchema.parse(req.body);
        const twinResult = await database_1.db.query(`
      SELECT id, "isPublic", "likeCount", "allowLikes"
      FROM "Twin"
      WHERE id = $1 AND "isPublic" = true
    `, [twinId]);
        if (twinResult.rows.length === 0) {
            return res.status(404).json({ error: 'Public twin not found' });
        }
        const twin = twinResult.rows[0];
        const twinOwnerCheck = await database_1.db.query(`
      SELECT "userId" FROM "Twin" WHERE id = $1
    `, [twinId]);
        if (twinOwnerCheck.rows.length > 0 && twinOwnerCheck.rows[0].userId === req.user.id) {
            return res.status(403).json({
                error: 'You cannot like your own twin',
                errorCode: 'OWN_TWIN_INTERACTION'
            });
        }
        const blockedCheck = await database_1.db.query(`
      SELECT id FROM "TwinBlockedUsers"
      WHERE "twinId" = $1 AND "userId" = $2
    `, [twinId, req.user.id]);
        if (blockedCheck.rows.length > 0) {
            return res.status(403).json({
                error: 'You are blocked from interacting with this twin',
                errorCode: 'USER_BLOCKED'
            });
        }
        if (twin.allowLikes === false) {
            return res.status(403).json({
                error: 'Likes are disabled for this twin',
                errorCode: 'LIKES_DISABLED'
            });
        }
        const existingLike = await database_1.twinLikeQueries.findByTwinAndUser(twinId, req.user.id);
        if (existingLike) {
            return res.status(400).json({ error: 'You have already liked this twin' });
        }
        await database_1.twinLikeQueries.create(twinId, req.user.id);
        const updatedTwin = await database_1.db.query(`
      SELECT "likeCount" FROM "Twin" WHERE id = $1
    `, [twinId]);
        await eventLogger_1.EventLogger.logUserEvent(req.user.id, 'twin_liked', {
            twinId,
            newLikeCount: updatedTwin.rows[0].likeCount
        });
        res.json({
            success: true,
            message: 'Twin liked successfully',
            likeCount: updatedTwin.rows[0].likeCount
        });
    }
    catch (error) {
        logger_1.logger.error('Like twin error:', error);
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({
                error: 'Invalid input',
                details: error.errors
            });
        }
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.likeTwin = likeTwin;
const unlikeTwin = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const { twinId } = likeTwinSchema.parse(req.body);
        const twinResult = await database_1.db.query(`
      SELECT id, "isPublic", "allowLikes"
      FROM "Twin"
      WHERE id = $1 AND "isPublic" = true
    `, [twinId]);
        if (twinResult.rows.length === 0) {
            return res.status(404).json({ error: 'Public twin not found' });
        }
        const twin = twinResult.rows[0];
        if (twin.allowLikes === false) {
            return res.status(403).json({
                error: 'Likes are disabled for this twin',
                errorCode: 'LIKES_DISABLED'
            });
        }
        const existingLike = await database_1.twinLikeQueries.findByTwinAndUser(twinId, req.user.id);
        if (!existingLike) {
            return res.status(400).json({ error: 'You have not liked this twin' });
        }
        await database_1.twinLikeQueries.remove(twinId, req.user.id);
        const updatedTwin = await database_1.db.query(`
      SELECT "likeCount" FROM "Twin" WHERE id = $1
    `, [twinId]);
        await eventLogger_1.EventLogger.logUserEvent(req.user.id, 'twin_unliked', {
            twinId,
            newLikeCount: updatedTwin.rows[0].likeCount
        });
        res.json({
            success: true,
            message: 'Twin unliked successfully',
            likeCount: updatedTwin.rows[0].likeCount
        });
    }
    catch (error) {
        logger_1.logger.error('Unlike twin error:', error);
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({
                error: 'Invalid input',
                details: error.errors
            });
        }
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.unlikeTwin = unlikeTwin;
const followTwin = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const { twinId } = followTwinSchema.parse(req.body);
        const twinResult = await database_1.db.query(`
      SELECT id, "isPublic", "followCount", "allowFollows"
      FROM "Twin"
      WHERE id = $1 AND "isPublic" = true
    `, [twinId]);
        if (twinResult.rows.length === 0) {
            return res.status(404).json({ error: 'Public twin not found' });
        }
        const twin = twinResult.rows[0];
        const twinOwnerCheck = await database_1.db.query(`
      SELECT "userId" FROM "Twin" WHERE id = $1
    `, [twinId]);
        if (twinOwnerCheck.rows.length > 0 && twinOwnerCheck.rows[0].userId === req.user.id) {
            return res.status(403).json({
                error: 'You cannot follow your own twin',
                errorCode: 'OWN_TWIN_INTERACTION'
            });
        }
        const blockedCheck = await database_1.db.query(`
      SELECT id FROM "TwinBlockedUsers"
      WHERE "twinId" = $1 AND "userId" = $2
    `, [twinId, req.user.id]);
        if (blockedCheck.rows.length > 0) {
            return res.status(403).json({
                error: 'You are blocked from interacting with this twin',
                errorCode: 'USER_BLOCKED'
            });
        }
        if (twin.allowFollows === false) {
            return res.status(403).json({
                error: 'Follows are disabled for this twin',
                errorCode: 'FOLLOWS_DISABLED'
            });
        }
        const existingFollow = await database_1.twinFollowQueries.findByTwinAndUser(twinId, req.user.id);
        if (existingFollow) {
            return res.status(400).json({ error: 'You are already following this twin' });
        }
        await database_1.twinFollowQueries.create(twinId, req.user.id);
        const updatedTwin = await database_1.db.query(`
      SELECT "followCount" FROM "Twin" WHERE id = $1
    `, [twinId]);
        await eventLogger_1.EventLogger.logUserEvent(req.user.id, 'twin_followed', {
            twinId,
            newFollowCount: updatedTwin.rows[0].followCount
        });
        res.json({
            success: true,
            message: 'Twin followed successfully',
            followCount: updatedTwin.rows[0].followCount
        });
    }
    catch (error) {
        logger_1.logger.error('Follow twin error:', error);
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({
                error: 'Invalid input',
                details: error.errors
            });
        }
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.followTwin = followTwin;
const unfollowTwin = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const { twinId } = followTwinSchema.parse(req.body);
        const twinResult = await database_1.db.query(`
      SELECT id, "isPublic", "allowFollows"
      FROM "Twin"
      WHERE id = $1 AND "isPublic" = true
    `, [twinId]);
        if (twinResult.rows.length === 0) {
            return res.status(404).json({ error: 'Public twin not found' });
        }
        const twin = twinResult.rows[0];
        if (twin.allowFollows === false) {
            return res.status(403).json({
                error: 'Follows are disabled for this twin',
                errorCode: 'FOLLOWS_DISABLED'
            });
        }
        const existingFollow = await database_1.twinFollowQueries.findByTwinAndUser(twinId, req.user.id);
        if (!existingFollow) {
            return res.status(400).json({ error: 'You are not following this twin' });
        }
        await database_1.twinFollowQueries.remove(twinId, req.user.id);
        const updatedTwin = await database_1.db.query(`
      SELECT "followCount" FROM "Twin" WHERE id = $1
    `, [twinId]);
        await eventLogger_1.EventLogger.logUserEvent(req.user.id, 'twin_unfollowed', {
            twinId,
            newFollowCount: updatedTwin.rows[0].followCount
        });
        res.json({
            success: true,
            message: 'Twin unfollowed successfully',
            followCount: updatedTwin.rows[0].followCount
        });
    }
    catch (error) {
        logger_1.logger.error('Unfollow twin error:', error);
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({
                error: 'Invalid input',
                details: error.errors
            });
        }
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.unfollowTwin = unfollowTwin;
const getTwinStats = async (req, res) => {
    try {
        const { twinId } = req.params;
        if (!twinId) {
            return res.status(400).json({ error: 'Twin ID is required' });
        }
        const twinResult = await database_1.db.query(`
      SELECT "likeCount", "followCount", "chatCount", "isPublic"
      FROM "Twin"
      WHERE id = $1
    `, [twinId]);
        if (twinResult.rows.length === 0) {
            return res.status(404).json({ error: 'Twin not found' });
        }
        const twin = twinResult.rows[0];
        let userInteraction = null;
        if (req.user) {
            const [likeStatus, followStatus] = await Promise.all([
                database_1.twinLikeQueries.findByTwinAndUser(twinId, req.user.id),
                database_1.twinFollowQueries.findByTwinAndUser(twinId, req.user.id)
            ]);
            userInteraction = {
                hasLiked: !!likeStatus,
                hasFollowed: !!followStatus
            };
        }
        res.json({
            success: true,
            stats: {
                likeCount: twin.likeCount,
                followCount: twin.followCount,
                chatCount: twin.chatCount,
                isPublic: twin.isPublic
            },
            userInteraction
        });
    }
    catch (error) {
        logger_1.logger.error('Get twin stats error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getTwinStats = getTwinStats;
const getUserLikedTwins = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const likedTwins = await database_1.db.query(`
      SELECT t.id, t."publicHandle", t."bio", t."profileImage", t."likeCount", t."followCount", t."chatCount",
             u.handle as userHandle, u.name as userName
      FROM "TwinLike" tl
      JOIN "Twin" t ON tl."twinId" = t.id
      JOIN "User" u ON t."userId" = u.id
      WHERE tl."userId" = $1 AND t."isPublic" = true
      ORDER BY tl."createdAt" DESC
    `, [req.user.id]);
        res.json({
            success: true,
            twins: likedTwins.rows
        });
    }
    catch (error) {
        logger_1.logger.error('Get user liked twins error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getUserLikedTwins = getUserLikedTwins;
const getUserFollowedTwins = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const followedTwins = await database_1.db.query(`
      SELECT t.id, t."publicHandle", t."bio", t."profileImage", t."likeCount", t."followCount", t."chatCount",
             u.handle as userHandle, u.name as userName
      FROM "TwinFollow" tf
      JOIN "Twin" t ON tf."twinId" = t.id
      JOIN "User" u ON t."userId" = u.id
      WHERE tf."userId" = $1 AND t."isPublic" = true
      ORDER BY tf."createdAt" DESC
    `, [req.user.id]);
        res.json({
            success: true,
            twins: followedTwins.rows
        });
    }
    catch (error) {
        logger_1.logger.error('Get user followed twins error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getUserFollowedTwins = getUserFollowedTwins;
const toggleLike = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const { twinId } = likeTwinSchema.parse(req.body);
        const twinResult = await database_1.db.query(`
      SELECT id, "isPublic", "allowLikes"
      FROM "Twin"
      WHERE id = $1 AND "isPublic" = true
    `, [twinId]);
        if (twinResult.rows.length === 0) {
            return res.status(404).json({ error: 'Public twin not found' });
        }
        const twin = twinResult.rows[0];
        const twinOwnerCheck = await database_1.db.query(`
      SELECT "userId" FROM "Twin" WHERE id = $1
    `, [twinId]);
        if (twinOwnerCheck.rows.length > 0 && twinOwnerCheck.rows[0].userId === req.user.id) {
            return res.status(403).json({
                error: 'You cannot like your own twin',
                errorCode: 'OWN_TWIN_INTERACTION'
            });
        }
        if (twin.allowLikes === false) {
            return res.status(403).json({
                error: 'Likes are disabled for this twin',
                errorCode: 'LIKES_DISABLED'
            });
        }
        const existingLike = await database_1.twinLikeQueries.findByTwinAndUser(twinId, req.user.id);
        let action, message, likeCount;
        if (existingLike) {
            await database_1.twinLikeQueries.remove(twinId, req.user.id);
            action = 'unliked';
            message = 'Twin unliked successfully';
            await eventLogger_1.EventLogger.logUserEvent(req.user.id, 'twin_unliked', { twinId });
        }
        else {
            await database_1.twinLikeQueries.create(twinId, req.user.id);
            action = 'liked';
            message = 'Twin liked successfully';
            await eventLogger_1.EventLogger.logUserEvent(req.user.id, 'twin_liked', { twinId });
        }
        const updatedTwin = await database_1.db.query(`
      SELECT "likeCount" FROM "Twin" WHERE id = $1
    `, [twinId]);
        likeCount = updatedTwin.rows[0].likeCount;
        res.json({
            success: true,
            action,
            message,
            likeCount
        });
    }
    catch (error) {
        logger_1.logger.error('Toggle like error:', error);
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({
                error: 'Invalid input',
                details: error.errors
            });
        }
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.toggleLike = toggleLike;
const toggleFollow = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const { twinId } = followTwinSchema.parse(req.body);
        const twinResult = await database_1.db.query(`
      SELECT id, "isPublic", "allowFollows"
      FROM "Twin"
      WHERE id = $1 AND "isPublic" = true
    `, [twinId]);
        if (twinResult.rows.length === 0) {
            return res.status(404).json({ error: 'Public twin not found' });
        }
        const twin = twinResult.rows[0];
        const twinOwnerCheck = await database_1.db.query(`
      SELECT "userId" FROM "Twin" WHERE id = $1
    `, [twinId]);
        if (twinOwnerCheck.rows.length > 0 && twinOwnerCheck.rows[0].userId === req.user.id) {
            return res.status(403).json({
                error: 'You cannot follow your own twin',
                errorCode: 'OWN_TWIN_INTERACTION'
            });
        }
        if (twin.allowFollows === false) {
            return res.status(403).json({
                error: 'Follows are disabled for this twin',
                errorCode: 'FOLLOWS_DISABLED'
            });
        }
        const existingFollow = await database_1.twinFollowQueries.findByTwinAndUser(twinId, req.user.id);
        let action, message, followCount;
        if (existingFollow) {
            await database_1.twinFollowQueries.remove(twinId, req.user.id);
            action = 'unfollowed';
            message = 'Twin unfollowed successfully';
            await eventLogger_1.EventLogger.logUserEvent(req.user.id, 'twin_unfollowed', { twinId });
        }
        else {
            await database_1.twinFollowQueries.create(twinId, req.user.id);
            action = 'followed';
            message = 'Twin followed successfully';
            await eventLogger_1.EventLogger.logUserEvent(req.user.id, 'twin_followed', { twinId });
        }
        const updatedTwin = await database_1.db.query(`
      SELECT "followCount" FROM "Twin" WHERE id = $1
    `, [twinId]);
        followCount = updatedTwin.rows[0].followCount;
        res.json({
            success: true,
            action,
            message,
            followCount
        });
    }
    catch (error) {
        logger_1.logger.error('Toggle follow error:', error);
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({
                error: 'Invalid input',
                details: error.errors
            });
        }
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.toggleFollow = toggleFollow;
const getTwinLikers = async (req, res) => {
    try {
        const { twinId } = req.params;
        const twinResult = await database_1.db.query('SELECT id, "isPublic" FROM "Twin" WHERE id = $1', [twinId]);
        if (twinResult.rows.length === 0) {
            return res.status(404).json({ error: 'Twin not found' });
        }
        const likersResult = await database_1.db.query(`SELECT 
        u.id,
        u.name,
        u.handle,
        u.email,
        tl."createdAt" as likedAt
       FROM "TwinLike" tl
       JOIN "User" u ON tl."userId" = u.id
       WHERE tl."twinId" = $1
       ORDER BY tl."createdAt" DESC
       LIMIT 100`, [twinId]);
        res.json({
            success: true,
            likers: likersResult.rows.map(row => ({
                id: row.id,
                name: row.name,
                handle: row.handle,
                likedAt: row.likedAt
            }))
        });
    }
    catch (error) {
        logger_1.logger.error('Get twin likers error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getTwinLikers = getTwinLikers;
const getTwinFollowers = async (req, res) => {
    try {
        const { twinId } = req.params;
        const twinResult = await database_1.db.query('SELECT id, "isPublic" FROM "Twin" WHERE id = $1', [twinId]);
        if (twinResult.rows.length === 0) {
            return res.status(404).json({ error: 'Twin not found' });
        }
        const followersResult = await database_1.db.query(`SELECT 
        u.id,
        u.name,
        u.handle,
        tf."createdAt" as followedAt
       FROM "TwinFollow" tf
       JOIN "User" u ON tf."userId" = u.id
       WHERE tf."twinId" = $1
       ORDER BY tf."createdAt" DESC
       LIMIT 100`, [twinId]);
        res.json({
            success: true,
            followers: followersResult.rows.map(row => ({
                id: row.id,
                name: row.name,
                handle: row.handle,
                followedAt: row.followedAt
            }))
        });
    }
    catch (error) {
        logger_1.logger.error('Get twin followers error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getTwinFollowers = getTwinFollowers;
const getTwinChatters = async (req, res) => {
    try {
        const { twinId } = req.params;
        const twinResult = await database_1.db.query('SELECT id, "userId" FROM "Twin" WHERE id = $1', [twinId]);
        if (twinResult.rows.length === 0) {
            return res.status(404).json({ error: 'Twin not found' });
        }
        const chattersResult = await database_1.db.query(`SELECT DISTINCT
        u.id,
        u.name,
        u.handle,
        u."profileImage",
        MAX(c."createdAt") as "lastChatAt",
        COUNT(DISTINCT c.id) as "chatCount"
       FROM "Chat" c
       JOIN "User" u ON c."userId" = u.id
       WHERE c."twinId" = $1
       GROUP BY u.id, u.name, u.handle, u."profileImage"
       ORDER BY "lastChatAt" DESC
       LIMIT 100`, [twinId]);
        res.json({
            success: true,
            chatters: chattersResult.rows.map(row => ({
                id: row.id,
                name: row.name,
                handle: row.handle,
                profileImage: row.profileImage,
                lastChatAt: row.lastChatAt,
                chatCount: parseInt(row.chatCount) || 0
            }))
        });
    }
    catch (error) {
        logger_1.logger.error('Get twin chatters error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getTwinChatters = getTwinChatters;
//# sourceMappingURL=socialController.js.map