"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteAccount = exports.exportUserData = void 0;
const database_1 = require("../../config/database");
const logger_1 = require("../../config/logger");
const errors_1 = require("../../utils/errors");
const authService_1 = require("../auth/authService");
const database_2 = require("../../config/database");
const exportUserData = async (req, res) => {
    try {
        if (!req.user) {
            throw errors_1.createError.unauthorized();
        }
        const userId = req.user.id;
        const userData = {
            exportInfo: {
                exportDate: new Date().toISOString(),
                formatVersion: "2.0",
                userId: userId
            },
            profile: {
                basicInfo: {},
                accountInfo: {}
            },
            twins: [],
            activitySummary: {
                totalChats: 0,
                totalPublicChats: 0,
                totalLikesGiven: 0,
                totalLikesReceived: 0,
                totalFollowsGiven: 0,
                totalFollowsReceived: 0
            },
            recentActivity: {
                chats: [],
                publicChats: [],
                likes: { given: [], received: [] },
                follows: { given: [], received: [] }
            },
            preferences: {}
        };
        const userResult = await database_1.db.query('SELECT email, handle, name, bio, "createdAt" FROM "User" WHERE id = $1', [userId]);
        if (userResult.rows[0]) {
            userData.profile.basicInfo = {
                email: userResult.rows[0].email,
                handle: userResult.rows[0].handle,
                name: userResult.rows[0].name,
                bio: userResult.rows[0].bio
            };
            userData.profile.accountInfo = {
                createdAt: userResult.rows[0].createdAt,
                referralCode: userResult.rows[0].referralCode || null
            };
        }
        const twinsResult = await database_1.db.query(`SELECT id, "isPublic", "publicHandle", bio, 
              "profileImage", "verified", "likeCount", "followCount", "chatCount", "createdAt"
       FROM "Twin" WHERE "userId" = $1`, [userId]);
        userData.twins = twinsResult.rows.map(twin => ({
            id: twin.id,
            publicHandle: twin.publicHandle,
            isPublic: twin.isPublic,
            bio: twin.bio,
            profileImage: twin.profileImage,
            verified: twin.verified,
            stats: {
                likes: twin.likeCount || 0,
                followers: twin.followCount || 0,
                chats: twin.chatCount || 0
            },
            createdAt: twin.createdAt
        }));
        const [chatsCount, publicChatsCount, likesGivenCount, likesReceivedCount, followsGivenCount, followsReceivedCount] = await Promise.all([
            database_1.db.query('SELECT COUNT(*) as count FROM "Chat" WHERE "userId" = $1', [userId]),
            database_1.db.query('SELECT COUNT(*) as count FROM "PublicChat" WHERE "userId" = $1', [userId]),
            database_1.db.query('SELECT COUNT(*) as count FROM "TwinLike" WHERE "userId" = $1', [userId]),
            database_1.db.query(`SELECT COUNT(*) as count FROM "TwinLike" tl 
                JOIN "Twin" t ON tl."twinId" = t.id WHERE t."userId" = $1`, [userId]),
            database_1.db.query('SELECT COUNT(*) as count FROM "TwinFollow" WHERE "userId" = $1', [userId]),
            database_1.db.query(`SELECT COUNT(*) as count FROM "TwinFollow" tf 
                JOIN "Twin" t ON tf."twinId" = t.id WHERE t."userId" = $1`, [userId])
        ]);
        userData.activitySummary = {
            totalChats: parseInt(chatsCount.rows[0]?.count || '0', 10),
            totalPublicChats: parseInt(publicChatsCount.rows[0]?.count || '0', 10),
            totalLikesGiven: parseInt(likesGivenCount.rows[0]?.count || '0', 10),
            totalLikesReceived: parseInt(likesReceivedCount.rows[0]?.count || '0', 10),
            totalFollowsGiven: parseInt(followsGivenCount.rows[0]?.count || '0', 10),
            totalFollowsReceived: parseInt(followsReceivedCount.rows[0]?.count || '0', 10)
        };
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const recentChatsResult = await database_1.db.query(`SELECT c.id, c."createdAt", 
              (SELECT COUNT(*) FROM "Message" m WHERE m."chatId" = c.id) as messageCount
       FROM "Chat" c WHERE c."userId" = $1 
       ORDER BY c."createdAt" DESC LIMIT 10`, [userId]);
        userData.recentActivity.chats = recentChatsResult.rows;
        const recentPublicChatsResult = await database_1.db.query(`SELECT pc.id, pc."createdAt", pc."messageCount"
       FROM "PublicChat" pc WHERE pc."userId" = $1 
       ORDER BY pc."createdAt" DESC LIMIT 10`, [userId]);
        userData.recentActivity.publicChats = recentPublicChatsResult.rows;
        const recentLikesGivenResult = await database_1.db.query(`SELECT tl.id, tl."twinId", tl."createdAt", t."publicHandle" as twinHandle
       FROM "TwinLike" tl
       JOIN "Twin" t ON tl."twinId" = t.id
       WHERE tl."userId" = $1
       ORDER BY tl."createdAt" DESC LIMIT 20`, [userId]);
        userData.recentActivity.likes.given = recentLikesGivenResult.rows;
        const recentLikesReceivedResult = await database_1.db.query(`SELECT tl.id, tl."twinId", tl."userId", tl."createdAt",
              u.handle as userHandle, u.name as userName
       FROM "TwinLike" tl
       JOIN "Twin" t ON tl."twinId" = t.id
       JOIN "User" u ON tl."userId" = u.id
       WHERE t."userId" = $1
       ORDER BY tl."createdAt" DESC LIMIT 20`, [userId]);
        userData.recentActivity.likes.received = recentLikesReceivedResult.rows;
        const recentFollowsGivenResult = await database_1.db.query(`SELECT tf.id, tf."twinId", tf."createdAt", t."publicHandle" as twinHandle
       FROM "TwinFollow" tf
       JOIN "Twin" t ON tf."twinId" = t.id
       WHERE tf."userId" = $1
       ORDER BY tf."createdAt" DESC LIMIT 20`, [userId]);
        userData.recentActivity.follows.given = recentFollowsGivenResult.rows;
        const recentFollowsReceivedResult = await database_1.db.query(`SELECT tf.id, tf."twinId", tf."userId", tf."createdAt",
              u.handle as userHandle, u.name as userName
       FROM "TwinFollow" tf
       JOIN "Twin" t ON tf."twinId" = t.id
       JOIN "User" u ON tf."userId" = u.id
       WHERE t."userId" = $1
       ORDER BY tf."createdAt" DESC LIMIT 20`, [userId]);
        userData.recentActivity.follows.received = recentFollowsReceivedResult.rows;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="user-data-${userId}-${Date.now()}.json"`);
        res.json(userData);
    }
    catch (error) {
        logger_1.logger.error('Export user data error:', error);
        if (error instanceof Error && error.message.includes('unauthorized')) {
            throw error;
        }
        throw errors_1.createError.internal('Failed to export user data', error);
    }
};
exports.exportUserData = exportUserData;
const deleteAccount = async (req, res) => {
    try {
        if (!req.user) {
            throw errors_1.createError.unauthorized();
        }
        const userId = req.user.id;
        const { password } = req.body;
        if (password) {
            const user = await database_2.userQueries.findByEmail(req.user.email);
            if (!user || !user.passwordHash) {
                throw errors_1.createError.validation('Password verification failed');
            }
            const isValidPassword = await (0, authService_1.verifyPassword)(password, user.passwordHash);
            if (!isValidPassword) {
                throw errors_1.createError.validation('Incorrect password');
            }
        }
        await database_1.db.query('DELETE FROM "User" WHERE id = $1', [userId]);
        logger_1.logger.info(`User account deleted: ${userId}`);
        req.session?.destroy(() => { });
        res.json({
            success: true,
            message: 'Account deleted successfully'
        });
    }
    catch (error) {
        logger_1.logger.error('Delete account error:', error);
        if (error instanceof Error && (error.message.includes('unauthorized') || error.message.includes('validation'))) {
            throw error;
        }
        throw errors_1.createError.internal('Failed to delete account', error);
    }
};
exports.deleteAccount = deleteAccount;
//# sourceMappingURL=userController.js.map