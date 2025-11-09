"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMyTwins = getMyTwins;
exports.getTwinCreate = getTwinCreate;
exports.getTwinAiEdit = getTwinAiEdit;
exports.getTwinStyleCustomize = getTwinStyleCustomize;
exports.getTwinLearningDashboard = getTwinLearningDashboard;
const database_1 = require("../config/database");
const logger_1 = require("../config/logger");
const errors_1 = require("../utils/errors");
async function getMyTwins(_req, res) {
    return res.redirect('/twin/manage');
}
function getTwinCreate(req, res) {
    const user = req.user || req.user;
    if (!user) {
        return res.redirect('/auth');
    }
    res.render('twin_create', {
        title: 'Create Twin - AI Twin',
        user: user,
        csrfToken: res.locals['csrfToken'],
    });
}
async function getTwinAiEdit(req, res) {
    try {
        const { id: twinId } = req.params;
        const userId = req.user?.id;
        if (!userId) {
            return res.redirect('/auth');
        }
        const twinResult = await database_1.db.query(`
      SELECT id, "styleVector", "personaData", "systemPrompt", "sampleReply", "createdAt", "last_updated", "style_version"
      FROM "Twin" 
      WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);
        if (twinResult.rows.length === 0) {
            throw errors_1.createError.notFound('Twin not found or access denied', errors_1.ErrorCodes.TWIN_NOT_FOUND);
        }
        res.render('ai-edit', {
            title: 'AI Edit - AI Twin',
            user: req.user,
            twinId: twinId,
            csrfToken: res.locals['csrfToken']
        });
    }
    catch (error) {
        logger_1.logger.error('AI edit route error:', {
            error: error instanceof Error ? error.message : 'Unknown error',
            userId: req.user?.id,
            twinId: req.params.id,
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
        const appError = errors_1.createError.internal('Failed to load AI edit page', error);
        return res.status(appError.statusCode).render('error', {
            title: 'Error',
            message: appError.message,
            errorCode: appError.errorCode,
            user: req.user || null
        });
    }
}
async function getTwinStyleCustomize(req, res) {
    try {
        const { id: twinId } = req.params;
        const userId = req.user?.id;
        if (!userId) {
            return res.redirect('/auth');
        }
        const twinResult = await database_1.db.query(`
      SELECT id, "styleVector", "personaData", "systemPrompt", "sampleReply", "createdAt", "last_updated", "style_version"
      FROM "Twin" 
      WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);
        if (twinResult.rows.length === 0) {
            throw errors_1.createError.notFound('Twin not found or access denied', errors_1.ErrorCodes.TWIN_NOT_FOUND);
        }
        res.render('style-customize', {
            title: 'Style Customize - AI Twin',
            user: req.user,
            twinId: twinId,
            csrfToken: res.locals['csrfToken']
        });
    }
    catch (error) {
        logger_1.logger.error('Style customize route error:', {
            error: error instanceof Error ? error.message : 'Unknown error',
            userId: req.user?.id,
            twinId: req.params.id,
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
        const appError = errors_1.createError.internal('Failed to load style customize page', error);
        return res.status(appError.statusCode).render('error', {
            title: 'Error',
            message: appError.message,
            errorCode: appError.errorCode,
            user: req.user || null
        });
    }
}
async function getTwinLearningDashboard(req, res) {
    try {
        const { id: twinId } = req.params;
        const userId = req.user?.id;
        if (!userId) {
            return res.redirect('/auth');
        }
        const twinResult = await database_1.db.query(`
      SELECT id, "styleVector", "personaData", "systemPrompt", "sampleReply", "createdAt", "last_updated", "style_version"
      FROM "Twin" 
      WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);
        if (twinResult.rows.length === 0) {
            throw errors_1.createError.notFound('Twin not found or access denied', errors_1.ErrorCodes.TWIN_NOT_FOUND);
        }
        res.render('learning-dashboard', {
            title: 'Learning Dashboard - AI Twin',
            user: req.user,
            twinId: twinId,
            csrfToken: res.locals['csrfToken']
        });
    }
    catch (error) {
        logger_1.logger.error('Learning dashboard route error:', {
            error: error instanceof Error ? error.message : 'Unknown error',
            userId: req.user?.id,
            twinId: req.params.id,
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
        const appError = errors_1.createError.internal('Failed to load learning dashboard', error);
        return res.status(appError.statusCode).render('error', {
            title: 'Error',
            message: appError.message,
            errorCode: appError.errorCode,
            user: req.user || null
        });
    }
}
//# sourceMappingURL=twinPageController.js.map