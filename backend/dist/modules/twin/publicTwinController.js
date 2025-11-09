"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPublicChatPage = exports.getMyTwinProfile = exports.getPublicTwinProfile = exports.updateTwinProfile = exports.makeTwinPrivate = exports.makeTwinPublic = void 0;
const database_1 = require("../../config/database");
const logger_1 = require("../../config/logger");
const eventLogger_1 = require("../../services/eventLogger");
const zod_1 = require("zod");
const errors_1 = require("../../utils/errors");
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
        const twinResult = await database_1.db.query(`
      SELECT id, "isPublic", "publicHandle"
      FROM "Twin"
      WHERE "userId" = $1 and id = $2
      LIMIT 1
    `, [req.user.id, twinId]);
        if (twinResult.rows.length === 0) {
            throw errors_1.createError.notFound('No twin found. Create a twin first.', errors_1.ErrorCodes.TWIN_NOT_FOUND);
        }
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
        if (error instanceof errors_1.AppError) {
            throw error;
        }
        throw errors_1.createError.internal('Failed to make twin public', error);
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
        const twinResult = await database_1.db.query(`
      SELECT id, "isPublic"
      FROM "Twin"
      WHERE "userId" = $1 and id = $2
      LIMIT 1
    `, [req.user.id, twinId]);
        if (twinResult.rows.length === 0) {
            throw errors_1.createError.notFound('No twin found', errors_1.ErrorCodes.TWIN_NOT_FOUND);
        }
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
        if (error instanceof errors_1.AppError) {
            throw error;
        }
        throw errors_1.createError.internal('Failed to make twin private', error);
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
        if (error instanceof errors_1.AppError) {
            throw error;
        }
        throw errors_1.createError.internal('Failed to update twin profile', error);
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
        if (error instanceof errors_1.AppError) {
            throw error;
        }
        throw errors_1.createError.internal('Failed to get public twin profile', error);
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
                createdAt: twin.createdAt,
                userHandle: twin.userHandle,
                userName: twin.userName
            }
        });
    }
    catch (error) {
        logger_1.logger.error('getMyTwinProfile error:', error);
        if (error instanceof errors_1.AppError) {
            return res.status(error.statusCode).json({
                success: false,
                error: error.message,
                errorCode: error.errorCode
            });
        }
        return res.status(500).json({
            success: false,
            error: 'Failed to get twin profile',
            errorCode: 'INTERNAL_ERROR'
        });
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
        const twinResult = await database_1.db.query(`
      SELECT id, "publicHandle", "sampleReply", "isPublic", "profileImage", bio
      FROM "Twin"
      WHERE id = $1 AND "isPublic" = true
    `, [twinId]);
        if (twinResult.rows.length === 0) {
            throw errors_1.createError.notFound('Public twin not found', errors_1.ErrorCodes.TWIN_NOT_FOUND);
        }
        const twin = twinResult.rows[0];
        let initialChatId = null;
        if (chatId && userId) {
            const chatResult = await database_1.db.query(`
        SELECT id FROM "PublicChat" 
        WHERE id = $1 AND "twinId" = $2 AND "userId" = $3
      `, [chatId, twinId, userId]);
            if (chatResult && chatResult.rows && chatResult.rows.length > 0) {
                initialChatId = chatId;
                logger_1.logger.info('Valid chatId found:', { chatId, twinId, userId });
            }
            else {
                logger_1.logger.warn('ChatId not found or not owned by user:', { chatId, twinId, userId });
            }
        }
        else if (chatId && !userId) {
            initialChatId = chatId;
            logger_1.logger.info('Using chatId without userId validation:', { chatId });
        }
        res.render('public-chat', {
            twin,
            initialChatId,
            csrfToken: req.csrfToken?.() || ''
        });
    }
    catch (error) {
        if (error instanceof errors_1.AppError) {
            throw error;
        }
        throw errors_1.createError.internal('Failed to load public chat page', error);
    }
};
exports.getPublicChatPage = getPublicChatPage;
//# sourceMappingURL=publicTwinController.js.map