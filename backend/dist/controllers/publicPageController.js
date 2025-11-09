"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLanding = getLanding;
exports.getPublicProfile = getPublicProfile;
exports.getPublicProfileAlt = getPublicProfileAlt;
exports.getSimple = getSimple;
const database_1 = require("../config/database");
const logger_1 = require("../config/logger");
const errors_1 = require("../utils/errors");
function getLanding(req, res) {
    if (req.user) {
        return res.redirect('/dashboard');
    }
    res.render('landing', {
        title: 'AI Twin - Create Your Digital Twin',
        user: req.user,
        csrfToken: res.locals['csrfToken']
    });
}
async function getPublicProfile(req, res) {
    try {
        const { handle } = req.params;
        const publicTwin = await database_1.db.query(`
      SELECT t.*, u.id as userId, u.handle as userHandle, u.name as userName
      FROM "Twin" t
      JOIN "User" u ON t."userId" = u.id
      WHERE t."publicHandle" = $1 AND t."isPublic" = true
    `, [handle]);
        if (publicTwin.rows.length === 0) {
            return res.status(404).render('404', {
                title: 'Twin Not Found',
                message: 'This twin profile is not public or does not exist'
            });
        }
        const twin = publicTwin.rows[0];
        const isOwner = req.user && req.user.id === twin.userId;
        res.render('public-profile', {
            title: `@${handle} - AI Twin`,
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
                userHandle: twin.userHandle,
                userName: twin.userName,
                isOwner: isOwner
            },
            viewer: req.user ? {
                id: req.user.id,
                handle: req.user.handle
            } : null
        });
    }
    catch (error) {
        logger_1.logger.error('Public profile error:', {
            error: error instanceof Error ? error.message : 'Unknown error',
            handle: req.params.handle,
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
        const appError = errors_1.createError.internal('Failed to load public profile', error);
        return res.status(appError.statusCode).render('error', {
            title: 'Error',
            message: appError.message,
            errorCode: appError.errorCode,
            user: req.user || null
        });
    }
}
function getPublicProfileAlt(req, res) {
    res.render('profile_public', {
        title: `Profile - ${req.params.handle}`,
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
//# sourceMappingURL=publicPageController.js.map