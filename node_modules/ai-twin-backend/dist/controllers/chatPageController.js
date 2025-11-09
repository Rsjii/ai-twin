"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getChatContinue = getChatContinue;
exports.getChat = getChat;
exports.getChatHistory = getChatHistory;
exports.getChatEnhanced = getChatEnhanced;
const database_1 = require("../config/database");
const logger_1 = require("../config/logger");
const errors_1 = require("../utils/errors");
async function getChatContinue(req, res) {
    try {
        if (!req.user) {
            return res.redirect('/auth');
        }
        const twins = await database_1.db.query(`
      SELECT id, "styleVector", "sampleReply", "createdAt" 
      FROM "Twin" 
      WHERE "userId" = $1 
      ORDER BY "createdAt" DESC
      LIMIT 1
    `, [req.user.id]);
        if (twins.rows.length === 0) {
            return res.redirect('/twin/create');
        }
        const latestTwin = twins.rows[0];
        let chats = await database_1.db.query(`
      SELECT id, "userId", "twinId", "createdAt"
      FROM "Chat"
      WHERE "userId" = $1 AND "twinId" = $2
      ORDER BY "createdAt" DESC
      LIMIT 1
    `, [req.user.id, latestTwin.id]);
        let chat;
        if (chats.rows.length === 0) {
            const chatId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const newChat = await database_1.db.query(`
        INSERT INTO "Chat" ("id", "userId", "twinId", "createdAt")
        VALUES ($1, $2, $3, NOW())
        RETURNING id
      `, [chatId, req.user.id, latestTwin.id]);
            chat = { id: newChat.rows[0].id };
        }
        else {
            chat = chats.rows[0];
        }
        res.redirect(`/chat/${chat.id}`);
    }
    catch (error) {
        logger_1.logger.error('Chat continue error:', {
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
        const appError = errors_1.createError.internal('Failed to continue chat', error);
        res.redirect('/dashboard');
    }
}
function getChat(req, res) {
    try {
        if (!req.user) {
            return res.redirect('/auth');
        }
        res.render('chat-simple', {
            title: 'Chat - AI Twin',
            user: req.user,
            chatId: req.params.id,
            csrfToken: res.locals['csrfToken'],
        });
    }
    catch (error) {
        logger_1.logger.error('Chat page error:', {
            error: error instanceof Error ? error.message : 'Unknown error',
            userId: req.user?.id,
            chatId: req.params.id,
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
        const appError = errors_1.createError.internal('Failed to load chat page', error);
        return res.status(appError.statusCode).render('error', {
            title: 'Error',
            message: appError.message,
            errorCode: appError.errorCode,
            user: req.user || null
        });
    }
}
function getChatHistory(req, res) {
    res.render('chat-history', {
        title: 'Chat History - AI Twin',
        user: req.user,
        csrfToken: res.locals['csrfToken'],
    });
}
async function getChatEnhanced(req, res) {
    try {
        if (!req.user) {
            return res.redirect('/auth');
        }
        const twins = await database_1.db.query(`
      SELECT id, "styleVector", "sampleReply", "createdAt" 
      FROM "Twin" 
      WHERE "userId" = $1 
      ORDER BY "createdAt" DESC
      LIMIT 1
    `, [req.user.id]);
        if (twins.rows.length === 0) {
            return res.redirect('/twin/create');
        }
        const latestTwin = twins.rows[0];
        let chats = await database_1.db.query(`
      SELECT id, "userId", "twinId", "createdAt"
      FROM "Chat"
      WHERE "userId" = $1 AND "twinId" = $2
      ORDER BY "createdAt" DESC
      LIMIT 1
    `, [req.user.id, latestTwin.id]);
        let chat;
        if (chats.rows.length === 0) {
            const chatId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const newChat = await database_1.db.query(`
        INSERT INTO "Chat" ("id", "userId", "twinId", "createdAt")
        VALUES ($1, $2, $3, NOW())
        RETURNING id
      `, [chatId, req.user.id, latestTwin.id]);
            chat = { id: newChat.rows[0].id };
        }
        else {
            chat = chats.rows[0];
        }
        res.render('chat-enhanced', {
            title: 'Enhanced Chat - AI Twin',
            user: req.user,
            chatId: chat.id,
            twinId: latestTwin.id,
            csrfToken: res.locals['csrfToken']
        });
    }
    catch (error) {
        logger_1.logger.error('Enhanced chat route error:', {
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
        const appError = errors_1.createError.internal('Failed to load enhanced chat', error);
        res.redirect('/dashboard');
    }
}
//# sourceMappingURL=chatPageController.js.map