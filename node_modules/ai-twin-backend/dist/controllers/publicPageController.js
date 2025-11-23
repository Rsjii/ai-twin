"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLanding = getLanding;
exports.getPublicProfile = getPublicProfile;
exports.getPublicProfileAlt = getPublicProfileAlt;
exports.getSimple = getSimple;
exports.getUserProfile = getUserProfile;
const database_1 = require("../config/database");
const logger_1 = require("../config/logger");
const errors_1 = require("../utils/errors");
const errorHandler_1 = require("../utils/errorHandler");
function getLanding(req, res) {
    try {
        if (req.user) {
            return res.redirect('/dashboard');
        }
        res.render('landing', {
            title: 'AI Twin - Create Your Digital Twin',
            user: req.user || null,
            csrfToken: res.locals['csrfToken'] || ''
        });
    }
    catch (error) {
        logger_1.logger.error('Landing page error:', {
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
            path: req.path
        });
        (0, errorHandler_1.handleControllerError)(error, 'Failed to load landing page');
    }
}
async function getPublicProfile(req, res) {
    try {
        const { handle } = req.params;
        const userId = req.user?.id || null;
        let query;
        let params;
        if (userId) {
            query = `
        SELECT 
          t.id, t."userId", t."publicHandle", t.bio, t."profileImage", t.verified, 
          t."likeCount", t."followCount", t."chatCount", t."sampleReply", t."createdAt",
          t."allowShares", t."requireLogin",
          u.id as "userId", u.handle as "userHandle", u.name as "userName"
        FROM "Twin" t
        JOIN "User" u ON t."userId" = u.id
        WHERE t."publicHandle" = $1 
          AND t."isPublic" = true
      `;
            params = [handle];
        }
        else {
            query = `
        SELECT 
          t.id, t."userId", t."publicHandle", t.bio, t."profileImage", t.verified, 
          t."likeCount", t."followCount", t."chatCount", t."sampleReply", t."createdAt",
          t."allowShares", t."requireLogin",
          u.id as "userId", u.handle as "userHandle", u.name as "userName"
        FROM "Twin" t
        JOIN "User" u ON t."userId" = u.id
        WHERE t."publicHandle" = $1 
          AND t."isPublic" = true
          AND (t."blockNonLoggedUsers" = false OR t."blockNonLoggedUsers" IS NULL)
      `;
            params = [handle];
        }
        const publicTwin = await database_1.db.query(query, params);
        if (publicTwin.rows.length === 0) {
            throw errors_1.createError.notFound('This twin profile is not public or does not exist');
        }
        const twin = publicTwin.rows[0];
        if (userId) {
            const blockedCheck = await database_1.db.query(`
        SELECT id FROM "TwinBlockedUsers"
        WHERE "twinId" = $1 AND "userId" = $2
      `, [twin.id, userId]);
            if (blockedCheck.rows.length > 0) {
                throw errors_1.createError.notFound('This profile is not available');
            }
        }
        const isOwner = userId && userId === twin.userId;
        let hasLiked = false;
        let hasFollowed = false;
        if (userId) {
            const [likeStatus, followStatus] = await Promise.all([
                database_1.db.query('SELECT id FROM "TwinLike" WHERE "twinId" = $1 AND "userId" = $2', [twin.id, userId]),
                database_1.db.query('SELECT id FROM "TwinFollow" WHERE "twinId" = $1 AND "userId" = $2', [twin.id, userId])
            ]);
            hasLiked = likeStatus.rows.length > 0;
            hasFollowed = followStatus.rows.length > 0;
        }
        const creatorName = twin.userName || twin.userHandle || 'Unknown';
        res.render('public-profile', {
            title: `@${handle} - AI Twin`,
            user: req.user || null,
            twin: {
                id: twin.id,
                publicHandle: twin.publicHandle,
                bio: twin.bio,
                profileImage: twin.profileImage,
                verified: twin.verified,
                likeCount: twin.likeCount,
                followCount: twin.followCount,
                chatCount: twin.chatCount,
                sampleReply: twin.sampleReply,
                createdAt: twin.createdAt,
                allowShares: twin.allowShares ?? true,
                requireLogin: twin.requireLogin ?? false,
                userHandle: twin.userHandle || 'Unknown',
                userName: twin.userName || twin.userHandle || 'Unknown',
                isOwner: isOwner,
                hasLiked: hasLiked,
                hasFollowed: hasFollowed
            },
            viewer: req.user ? {
                id: req.user.id,
                handle: req.user.handle
            } : null,
            csrfToken: res.locals['csrfToken']
        });
    }
    catch (error) {
        logger_1.logger.error('Public profile error:', {
            error: error instanceof Error ? error.message : 'Unknown error',
            handle: req.params.handle,
            path: req.path
        });
        (0, errorHandler_1.handleControllerError)(error, 'Failed to load public profile');
    }
}
function getPublicProfileAlt(req, res) {
    res.render('profile_public', {
        title: `Profile - ${req.params.handle}`,
        user: req.user || null,
        handle: req.params.handle,
        token: req.query['t'],
        csrfToken: res.locals['csrfToken'],
    });
}
function getSimple(req, res) {
    res.render('landing', {
        title: 'AI Twin - Create Your Digital Twin',
        user: null,
        csrfToken: 'test-token',
    });
}
async function getUserProfile(req, res) {
    try {
        const { handle } = req.params;
        const userId = req.user?.id || null;
        const userResult = await database_1.db.query(`
      SELECT id, handle, name, "profileImage", bio, "createdAt"
      FROM "User"
      WHERE handle = $1
    `, [handle]);
        if (userResult.rows.length === 0) {
            throw errors_1.createError.notFound('This user does not exist');
        }
        const user = userResult.rows[0];
        let twinsQuery;
        let twinsParams;
        if (userId) {
            twinsQuery = `
        SELECT 
          t.id, t."publicHandle", t.bio, t."profileImage", t.verified, 
          t."likeCount", t."followCount", t."chatCount", t."sampleReply", t."createdAt",
          t."allowShares", t."requireLogin"
        FROM "Twin" t
        WHERE t."userId" = $1 
          AND t."isPublic" = true
        ORDER BY t."createdAt" DESC
      `;
            twinsParams = [user.id];
        }
        else {
            twinsQuery = `
        SELECT 
          t.id, t."publicHandle", t.bio, t."profileImage", t.verified, 
          t."likeCount", t."followCount", t."chatCount", t."sampleReply", t."createdAt",
          t."allowShares", t."requireLogin"
        FROM "Twin" t
        WHERE t."userId" = $1 
          AND t."isPublic" = true
          AND (t."blockNonLoggedUsers" = false OR t."blockNonLoggedUsers" IS NULL)
        ORDER BY t."createdAt" DESC
      `;
            twinsParams = [user.id];
        }
        const twinsResult = await database_1.db.query(twinsQuery, twinsParams);
        const twins = twinsResult.rows;
        const isOwner = userId && userId === user.id;
        res.render('user-profile', {
            title: `@${handle} - User Profile`,
            user: req.user || null,
            profileUser: {
                id: user.id,
                handle: user.handle,
                name: user.name || user.handle,
                profileImage: user.profileImage,
                bio: user.bio,
                createdAt: user.createdAt,
                isOwner: isOwner
            },
            twins: twins,
            hasTwins: twins.length > 0,
            viewer: req.user ? {
                id: req.user.id,
                handle: req.user.handle
            } : null,
            csrfToken: res.locals['csrfToken']
        });
    }
    catch (error) {
        logger_1.logger.error('User profile error:', {
            error: error instanceof Error ? error.message : 'Unknown error',
            handle: req.params.handle,
            path: req.path
        });
        (0, errorHandler_1.handleControllerError)(error, 'Failed to load user profile');
    }
}
//# sourceMappingURL=publicPageController.js.map