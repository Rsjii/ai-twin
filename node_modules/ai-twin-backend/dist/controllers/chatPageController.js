"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getChatEnhanced = getChatEnhanced;
const database_1 = require("../config/database");
const logger_1 = require("../config/logger");
const idGenerator_1 = require("../utils/idGenerator");
const errorHandler_1 = require("../utils/errorHandler");
async function getChatEnhanced(req, res) {
    try {
        if (!req.user) {
            return res.redirect('/auth');
        }
        const { userQueries } = await Promise.resolve().then(() => __importStar(require('../config/database')));
        const fullUser = await userQueries.findByEmail(req.user.email);
        if (!fullUser) {
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
        let chat;
        const requestedChatId = req.query.chatId;
        if (requestedChatId) {
            const chatResult = await database_1.db.query(`
        SELECT id, "userId", "twinId", "createdAt"
        FROM "Chat"
        WHERE id = $1 AND "userId" = $2
      `, [requestedChatId, req.user.id]);
            if (chatResult.rows.length > 0) {
                chat = chatResult.rows[0];
            }
            else {
                logger_1.logger.warn('Requested chat not found or unauthorized', {
                    requestedChatId,
                    userId: req.user.id
                });
                const chats = await database_1.db.query(`
          SELECT id, "userId", "twinId", "createdAt"
          FROM "Chat"
          WHERE "userId" = $1 AND "twinId" = $2
          ORDER BY "createdAt" DESC
          LIMIT 1
        `, [req.user.id, latestTwin.id]);
                if (chats.rows.length === 0) {
                    const chatId = idGenerator_1.generateId.chat();
                    const utcTimestamp = new Date().toISOString();
                    const newChat = await database_1.db.query(`
            INSERT INTO "Chat" ("id", "userId", "twinId", "createdAt")
            VALUES ($1, $2, $3, $4::timestamptz)
            RETURNING id
          `, [chatId, req.user.id, latestTwin.id, utcTimestamp]);
                    chat = { id: newChat.rows[0].id };
                }
                else {
                    chat = chats.rows[0];
                }
            }
        }
        else {
            const chats = await database_1.db.query(`
        SELECT id, "userId", "twinId", "createdAt"
        FROM "Chat"
        WHERE "userId" = $1 AND "twinId" = $2
        ORDER BY "createdAt" DESC
        LIMIT 1
      `, [req.user.id, latestTwin.id]);
            if (chats.rows.length === 0) {
                const chatId = idGenerator_1.generateId.chat();
                const utcTimestamp = new Date().toISOString();
                const newChat = await database_1.db.query(`
          INSERT INTO "Chat" ("id", "userId", "twinId", "createdAt")
          VALUES ($1, $2, $3, $4::timestamptz)
          RETURNING id
        `, [chatId, req.user.id, latestTwin.id, utcTimestamp]);
                chat = { id: newChat.rows[0].id };
            }
            else {
                chat = chats.rows[0];
            }
        }
        const user = {
            id: fullUser.id,
            email: fullUser.email,
            handle: fullUser.handle,
            name: fullUser.name,
            profileImage: fullUser.profileImage,
        };
        res.render('chat-enhanced', {
            title: 'Enhanced Chat - AI Twin',
            user: user,
            pathname: '/chat-enhanced',
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
        (0, errorHandler_1.handleControllerError)(error, 'Failed to load enhanced chat');
    }
}
//# sourceMappingURL=chatPageController.js.map