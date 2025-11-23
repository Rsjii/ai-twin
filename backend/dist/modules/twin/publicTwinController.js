"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkTwinOwner = exports.getPublicChatPage = exports.getMyTwinProfile = exports.getPublicTwinProfile = exports.updateTwinProfile = exports.makeTwinPrivate = exports.makeTwinPublic = void 0;
const database_1 = require("../../config/database");
const logger_1 = require("../../config/logger");
const eventLogger_1 = require("../../services/eventLogger");
const zod_1 = require("zod");
const errors_1 = require("../../utils/errors");
const twinUtils_1 = require("../../utils/twinUtils");
const errorHandler_1 = require("../../utils/errorHandler");
const database_2 = require("../../config/database");
const makePublicSchema = zod_1.z.object({
    twinId: zod_1.z.string().min(1, 'Twin ID is required'),
    publicHandle: zod_1.z.string()
        .min(3, 'Handle must be at least 3 characters')
        .max(30, 'Handle must be less than 30 characters')
        .regex(/^[a-zA-Z0-9_-]+$/, 'Handle can only contain letters, numbers, hyphens, and underscores'),
    bio: zod_1.z.string().max(500, 'Bio must be less than 500 characters').optional(),
    profileImage: zod_1.z.string().url('Profile image must be a valid URL').optional()
});
const updateProfileSchema = zod_1.z.object({
    bio: zod_1.z.string().max(500, 'Bio must be less than 500 characters').optional(),
    profileImage: zod_1.z.string().url('Profile image must be a valid URL').optional(),
    publicHandle: zod_1.z.string()
        .min(3, 'Handle must be at least 3 characters')
        .max(30, 'Handle must be less than 30 characters')
        .regex(/^[a-zA-Z0-9_-]+$/, 'Handle can only contain letters, numbers, hyphens, and underscores')
        .optional()
});
const makeTwinPublic = async (req, res, next) => {
    try {
        if (!req.user) {
            throw errors_1.createError.unauthorized('Authentication required');
        }
        const { twinId, publicHandle, bio, profileImage } = makePublicSchema.parse(req.body);
        await (0, twinUtils_1.verifyTwinOwnership)(twinId, req.user.id);
        const twinResult = await database_1.db.query(`
      SELECT id, "isPublic", "publicHandle"
      FROM "Twin"
      WHERE id = $1
      LIMIT 1
    `, [twinId]);
        const twin = twinResult.rows[0];
        if (twin.isPublic) {
            throw errors_1.createError.conflict('Twin is already public');
        }
        const existingHandle = await database_1.db.query(`
      SELECT id FROM "Twin" WHERE "publicHandle" = $1 AND id != $2
    `, [publicHandle, twin.id]);
        if (existingHandle.rows.length > 0) {
            throw errors_1.createError.conflict('This handle is already taken');
        }
        const updatedTwin = await database_1.publicTwinQueries.makePublic(twin.id, publicHandle, bio, profileImage);
        await eventLogger_1.EventLogger.logUserEvent(req.user.id, 'twin_made_public', {
            twinId: twin.id,
            publicHandle,
            bio: bio?.length || 0
        });
        res.json({
            success: true,
            message: 'Twin is now public!',
            twin: {
                id: updatedTwin.id,
                publicHandle: updatedTwin.publicHandle,
                bio: updatedTwin.bio,
                profileImage: updatedTwin.profileImage,
                isPublic: updatedTwin.isPublic
            }
        });
    }
    catch (error) {
        (0, errorHandler_1.handleControllerError)(error, 'Failed to make twin public');
    }
};
exports.makeTwinPublic = makeTwinPublic;
const makeTwinPrivate = async (req, res, next) => {
    try {
        if (!req.user) {
            throw errors_1.createError.unauthorized('Authentication required');
        }
        const { twinId } = req.body;
        if (!twinId) {
            throw errors_1.createError.validation('Twin ID is required');
        }
        await (0, twinUtils_1.verifyTwinOwnership)(twinId, req.user.id);
        const twinResult = await database_1.db.query(`
      SELECT id, "isPublic"
      FROM "Twin"
      WHERE id = $1
      LIMIT 1
    `, [twinId]);
        const twin = twinResult.rows[0];
        if (!twin.isPublic) {
            throw errors_1.createError.conflict('Twin is already private');
        }
        await database_1.publicTwinQueries.makePrivate(twin.id);
        await eventLogger_1.EventLogger.logUserEvent(req.user.id, 'twin_made_private', {
            twinId: twin.id
        });
        res.json({
            success: true,
            message: 'Twin is now private'
        });
    }
    catch (error) {
        (0, errorHandler_1.handleControllerError)(error, 'Failed to make twin private');
    }
};
exports.makeTwinPrivate = makeTwinPrivate;
const updateTwinProfile = async (req, res, next) => {
    try {
        if (!req.user) {
            throw errors_1.createError.unauthorized('Authentication required');
        }
        const updateData = updateProfileSchema.parse(req.body);
        const twinResult = await database_1.db.query(`
      SELECT id, "isPublic", "publicHandle"
      FROM "Twin"
      WHERE "userId" = $1
      LIMIT 1
    `, [req.user.id]);
        if (twinResult.rows.length === 0) {
            throw errors_1.createError.notFound('No twin found', errors_1.ErrorCodes.TWIN_NOT_FOUND);
        }
        const twin = twinResult.rows[0];
        if (updateData.publicHandle && updateData.publicHandle !== twin.publicHandle) {
            const existingHandle = await database_1.db.query(`
        SELECT id FROM "Twin" WHERE "publicHandle" = $1 AND id != $2
      `, [updateData.publicHandle, twin.id]);
            if (existingHandle.rows.length > 0) {
                throw errors_1.createError.conflict('This handle is already taken');
            }
        }
        const updatedTwin = await database_1.publicTwinQueries.updateProfile(twin.id, updateData.bio, updateData.profileImage, updateData.publicHandle);
        res.json({
            success: true,
            message: 'Profile updated successfully',
            twin: {
                id: updatedTwin.id,
                publicHandle: updatedTwin.publicHandle,
                bio: updatedTwin.bio,
                profileImage: updatedTwin.profileImage,
                isPublic: updatedTwin.isPublic
            }
        });
    }
    catch (error) {
        (0, errorHandler_1.handleControllerError)(error, 'Failed to update twin profile');
    }
};
exports.updateTwinProfile = updateTwinProfile;
const getPublicTwinProfile = async (req, res, next) => {
    try {
        const { handle } = req.params;
        if (!handle) {
            throw errors_1.createError.validation('Handle is required');
        }
        const publicTwin = await database_1.publicTwinQueries.findByPublicHandle(handle);
        if (!publicTwin) {
            throw errors_1.createError.notFound('Public twin not found', errors_1.ErrorCodes.TWIN_NOT_FOUND);
        }
        res.json({
            success: true,
            twin: {
                id: publicTwin.id,
                publicHandle: publicTwin.publicHandle,
                bio: publicTwin.bio,
                profileImage: publicTwin.profileImage,
                verified: publicTwin.verified,
                likeCount: publicTwin.likeCount,
                followCount: publicTwin.followCount,
                chatCount: publicTwin.chatCount,
                sampleReply: publicTwin.sampleReply,
                createdAt: publicTwin.createdAt,
                userHandle: publicTwin.userHandle,
                userName: publicTwin.userName
            }
        });
    }
    catch (error) {
        (0, errorHandler_1.handleControllerError)(error, 'Failed to get public twin profile');
    }
};
exports.getPublicTwinProfile = getPublicTwinProfile;
const getMyTwinProfile = async (req, res, next) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required',
                errorCode: 'UNAUTHORIZED'
            });
        }
        const twinResult = await database_1.db.query(`
      SELECT t.*, u.handle as userHandle, u.name as userName
      FROM "Twin" t
      JOIN "User" u ON t."userId" = u.id
      WHERE t."userId" = $1
      LIMIT 1
    `, [req.user.id]);
        if (twinResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'No twin found. Please create a twin first.',
                errorCode: 'TWIN_NOT_FOUND',
                hasTwin: false
            });
        }
        const twin = twinResult.rows[0];
        const userResult = await database_1.db.query(`
      SELECT "personaData", "onboardingCompleted" 
      FROM "User" 
      WHERE id = $1
    `, [req.user.id]);
        const userData = userResult?.rows?.[0] || {};
        res.json({
            success: true,
            twin: {
                id: twin.id,
                isPublic: twin.isPublic,
                publicHandle: twin.publicHandle,
                bio: twin.bio,
                profileImage: twin.profileImage,
                verified: twin.verified,
                likeCount: twin.likeCount,
                followCount: twin.followCount,
                chatCount: twin.chatCount,
                styleVector: twin.styleVector,
                sampleReply: twin.sampleReply,
                personaData: twin.personaData,
                systemPrompt: twin.systemPrompt,
                createdAt: twin.createdAt,
                userHandle: twin.userHandle,
                userName: twin.userName
            },
            user: {
                personaData: userData.personaData,
                onboardingCompleted: userData.onboardingCompleted || false
            }
        });
    }
    catch (error) {
        logger_1.logger.error('getMyTwinProfile error:', error);
        (0, errorHandler_1.handleControllerError)(error, 'Failed to get twin profile');
    }
};
exports.getMyTwinProfile = getMyTwinProfile;
const getPublicChatPage = async (req, res, next) => {
    try {
        const { twinId } = req.params;
        const chatIdParam = req.query.chatId;
        const chatId = Array.isArray(chatIdParam) ? chatIdParam[0] : chatIdParam;
        const userId = req.user?.id;
        logger_1.logger.info('getPublicChatPage:', { twinId, chatId, userId });
        if (userId) {
            try {
                await (0, twinUtils_1.verifyTwinOwnership)(twinId, userId);
                logger_1.logger.info('Own twin detected, redirecting to enhanced chat:', { twinId, userId });
                const message = encodeURIComponent('You cannot chat with your own twin in public chat. Use Enhanced Chat for interactive conversations.');
                return res.redirect(`/chat-enhanced?twinId=${twinId}&message=${message}`);
            }
            catch (error) {
            }
        }
        const twinCheck = await database_1.db.query(`
  SELECT id, "isPublic", "blockNonLoggedUsers", "publicHandle"
  FROM "Twin" t
  WHERE t.id = $1
`, [twinId]);
        if (twinCheck.rows.length === 0) {
            logger_1.logger.warn('getPublicChatPage: Twin not found', { twinId, userId });
            throw errors_1.createError.notFound('Twin not found', errors_1.ErrorCodes.TWIN_NOT_FOUND);
        }
        const twinInfo = twinCheck.rows[0];
        if (!userId && twinInfo.blockNonLoggedUsers === true) {
            logger_1.logger.warn('getPublicChatPage: Non-logged user blocked', { twinId });
            return res.status(403).render('403', {
                title: 'Access Denied',
                message: 'This twin requires you to be logged in to access',
                csrfToken: res.locals['csrfToken'],
                user: null
            });
        }
        if (userId) {
            const blockedCheck = await database_1.db.query(`
    SELECT id FROM "TwinBlockedUsers"
    WHERE "twinId" = $1 AND "userId" = $2
  `, [twinId, userId]);
            if (blockedCheck.rows.length > 0) {
                logger_1.logger.warn('getPublicChatPage: Blocked user tried to access', { twinId, userId });
                return res.status(403).render('403', {
                    title: 'Access Denied',
                    message: 'You are blocked from accessing this twin',
                    csrfToken: res.locals['csrfToken'],
                    user: req.user || null
                });
            }
        }
        if (!twinInfo.isPublic) {
            logger_1.logger.warn('getPublicChatPage: Twin is not public', { twinId, userId, isPublic: twinInfo.isPublic });
            throw errors_1.createError.notFound('Twin is not public', errors_1.ErrorCodes.TWIN_NOT_FOUND);
        }
        const twinResult = await database_1.db.query(`
  SELECT id, "publicHandle", "sampleReply", "isPublic", "profileImage", bio, "requireLogin"
  FROM "Twin" t
  WHERE t.id = $1
`, [twinId]);
        if (twinResult.rows.length === 0) {
            logger_1.logger.error('getPublicChatPage: Unexpected error - twin disappeared', { twinId, userId });
            throw errors_1.createError.notFound('Public twin not found', errors_1.ErrorCodes.TWIN_NOT_FOUND);
        }
        const twin = twinResult.rows[0];
        let initialChatId = null;
        if (chatId) {
            const chatResult = await database_1.db.query(`
        SELECT id, "userId", "visitorId" 
        FROM "PublicChat" 
        WHERE id = $1 AND "twinId" = $2
      `, [chatId, twinId]);
            if (chatResult && chatResult.rows && chatResult.rows.length > 0) {
                const chat = chatResult.rows[0];
                if (userId) {
                    const ownsChat = chat.userId === userId;
                    let ownsTwin = false;
                    if (userId) {
                        try {
                            await (0, twinUtils_1.verifyTwinOwnership)(twinId, userId);
                            ownsTwin = true;
                        }
                        catch (error) {
                            ownsTwin = false;
                        }
                    }
                    if (ownsChat || ownsTwin) {
                        initialChatId = chatId;
                        logger_1.logger.info('Valid chatId found:', { chatId, twinId, userId, ownsChat, ownsTwin });
                    }
                    else {
                        logger_1.logger.warn('ChatId not found or access denied:', { chatId, twinId, userId });
                    }
                }
                else {
                    if (chat.visitorId) {
                        initialChatId = chatId;
                        logger_1.logger.info('Using anonymous chatId:', { chatId });
                    }
                }
            }
            else {
                logger_1.logger.warn('ChatId not found for twin:', { chatId, twinId });
            }
        }
        let user = null;
        let hasTwins = false;
        let userTwinId = null;
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
                const userTwins = await database_2.twinQueries.findByUserId(fullUser.id);
                hasTwins = userTwins.length > 0;
                const userTwin = hasTwins ? userTwins[0] : null;
                userTwinId = userTwin && userTwin.id ? userTwin.id : null;
            }
        }
        res.render('public-chat', {
            title: 'Public Chat - AI Twin',
            user: user,
            twin,
            initialChatId,
            requiresLogin: twin.requireLogin && !userId,
            hasTwins: hasTwins,
            twinId: userTwinId,
            csrfToken: req.csrfToken?.() || ''
        });
    }
    catch (error) {
        (0, errorHandler_1.handleControllerError)(error, 'Failed to load public chat page');
    }
};
exports.getPublicChatPage = getPublicChatPage;
const checkTwinOwner = async (req, res, next) => {
    try {
        if (!req.user) {
            return res.json({
                isOwner: false
            });
        }
        const { twinId } = req.params;
        const twinResult = await database_1.db.query(`
      SELECT "userId" FROM "Twin" WHERE id = $1
    `, [twinId]);
        if (twinResult.rows.length === 0) {
            return res.json({
                isOwner: false
            });
        }
        const isOwner = twinResult.rows[0].userId === req.user.id;
        res.json({
            isOwner
        });
    }
    catch (error) {
        logger_1.logger.error('Check twin owner error:', error);
        res.json({
            isOwner: false
        });
    }
};
exports.checkTwinOwner = checkTwinOwner;
//# sourceMappingURL=publicTwinController.js.map