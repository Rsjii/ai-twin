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
exports.updatePublicChatTitle = exports.deletePublicChat = exports.getUserPublicChats = exports.createNewPublicChat = exports.getPublicChatsByTwin = exports.getPublicChatByTwin = exports.getPublicChatHistory = exports.sendPublicMessage = exports.startPublicChat = void 0;
const database_1 = require("../../config/database");
const logger_1 = require("../../config/logger");
const eventLogger_1 = require("../../services/eventLogger");
const twinService_1 = require("../twin/twinService");
const zod_1 = require("zod");
const errors_1 = require("../../utils/errors");
const chatUtils = __importStar(require("./chatSharedUtils"));
const startPublicChatSchema = zod_1.z.object({
    twinId: zod_1.z.string().min(1, 'Twin ID is required'),
    visitorId: zod_1.z.string().optional()
});
const sendPublicMessageSchema = zod_1.z.object({
    message: zod_1.z.string()
        .min(1, 'Message cannot be empty')
        .max(1000, 'Message must be less than 1000 characters')
});
const twinService = new twinService_1.TwinService();
const startPublicChat = async (req, res, next) => {
    try {
        const { twinId, visitorId } = startPublicChatSchema.parse(req.body);
        const userId = req.user?.id;
        logger_1.logger.info(`[startPublicChat] Twin: ${twinId}, UserId: ${userId || 'anonymous'}, VisitorId: ${visitorId || 'none'}`);
        const finalVisitorId = userId ? null : (visitorId || `visitor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
        const twinResult = await database_1.db.query(`
      SELECT id, "isPublic", "styleVector", "sampleReply", "requireApproval"
      FROM "Twin"
      WHERE id = $1 AND "isPublic" = true
    `, [twinId]);
        if (twinResult.rows.length === 0) {
            logger_1.logger.warn(`Twin ${twinId} not found or not public, but allowing chat creation`);
            const defaultTwin = {
                id: twinId,
                isPublic: true,
                styleVector: null,
                sampleReply: null,
                requireApproval: false
            };
            const publicChat = await database_1.publicChatQueries.create(twinId, finalVisitorId || undefined, userId || undefined);
            return res.json({
                success: true,
                chatId: publicChat.id,
                twin: {
                    id: defaultTwin.id,
                    sampleReply: defaultTwin.sampleReply
                }
            });
        }
        const twin = twinResult.rows[0];
        let publicChat;
        if (userId) {
            const chatsByUser = await database_1.db.query('SELECT * FROM "PublicChat" WHERE "twinId" = $1 AND "userId" = $2 ORDER BY "createdAt" DESC LIMIT 1', [twinId, userId]);
            publicChat = chatsByUser.rows.length > 0 ? chatsByUser.rows[0] : null;
        }
        else {
            publicChat = await database_1.publicChatQueries.findByTwinAndVisitor(twinId, finalVisitorId);
            if (publicChat && Array.isArray(publicChat)) {
                publicChat = publicChat.length > 0 ? publicChat[0] : null;
            }
        }
        if (!publicChat) {
            logger_1.logger.info(`[startPublicChat] Creating new chat - TwinId: ${twinId}, UserId: ${userId || 'null'}, VisitorId: ${finalVisitorId || 'null'}`);
            publicChat = await database_1.publicChatQueries.create(twinId, finalVisitorId || undefined, userId || undefined);
            logger_1.logger.info(`[startPublicChat] Chat created successfully - ChatId: ${publicChat.id}, UserId set: ${publicChat.userId || 'null'}`);
        }
        else {
            logger_1.logger.info(`[startPublicChat] Existing chat found - ChatId: ${publicChat.id}, UserId: ${publicChat.userId || 'null'}`);
        }
        if (userId) {
            await eventLogger_1.EventLogger.logUserEvent(userId, 'public_chat_started', {
                twinId,
                chatId: publicChat.id
            });
        }
        else if (finalVisitorId && !finalVisitorId.startsWith('visitor_')) {
            await eventLogger_1.EventLogger.logUserEvent(finalVisitorId, 'public_chat_started', {
                twinId,
                chatId: publicChat.id
            });
        }
        res.json({
            success: true,
            chatId: publicChat.id,
            twin: {
                id: twin.id,
                sampleReply: twin.sampleReply
            }
        });
    }
    catch (error) {
        logger_1.logger.error('startPublicChat error:', error);
        if (error instanceof errors_1.AppError) {
            return res.status(error.statusCode).json({
                success: false,
                error: error.message,
                errorCode: error.errorCode
            });
        }
        return res.status(500).json({
            success: false,
            error: 'Failed to start public chat',
            errorCode: 'INTERNAL_ERROR'
        });
    }
};
exports.startPublicChat = startPublicChat;
const sendPublicMessage = async (req, res, next) => {
    try {
        const { chatId } = req.params;
        const { message } = sendPublicMessageSchema.parse(req.body);
        try {
            chatUtils.validateMessage(message);
        }
        catch (error) {
            if (error instanceof errors_1.AppError) {
                return res.status(error.statusCode).json({
                    success: false,
                    error: error.message,
                    errorCode: error.errorCode
                });
            }
            throw error;
        }
        const chatResult = await database_1.db.query(`
      SELECT pc.id, pc."twinId", pc."visitorId", pc."messageCount", pc."userId", pc."title",
             t."styleVector", t."sampleReply", t."personaData", t."systemPrompt", t."tokenLimit"
      FROM "PublicChat" pc
      LEFT JOIN "Twin" t ON pc."twinId" = t.id
      WHERE pc.id = $1
    `, [chatId]);
        if (chatResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Public chat not found',
                errorCode: 'CHAT_NOT_FOUND'
            });
        }
        const chat = chatResult.rows[0];
        let twinInfo = { requireApproval: false };
        try {
            const twinInfoResult = await database_1.db.query(`
        SELECT "requireApproval"
        FROM "Twin"
        WHERE id = $1
      `, [chat.twinId]);
            twinInfo = twinInfoResult.rows[0] || { requireApproval: false };
        }
        catch (error) {
            logger_1.logger.warn('Twin not found for public chat, using defaults:', error);
        }
        const moderation = await chatUtils.checkModerationAndApprove(message, chat.twinId, chat.userId || undefined, twinInfo.requireApproval);
        if (!moderation.approved) {
            logger_1.logger.warn('Public message rejected by moderation:', {
                message: message.substring(0, 50),
                reasons: moderation.moderationResult.reasons,
                chatId: chatId,
                twinId: chat.twinId
            });
            return res.status(400).json(chatUtils.getModerationRejectionResponse(moderation.moderationResult));
        }
        const [isFirstMessage, currentTitle] = await Promise.all([
            chatUtils.checkFirstMessage(chatId, 'PublicMessage'),
            chatUtils.getChatTitle(chatId, 'PublicChat')
        ]);
        const shouldGenerateTitle = isFirstMessage && (!currentTitle || currentTitle === 'New Chat' || currentTitle === '' || currentTitle === null);
        const recentMessages = await chatUtils.getRecentMessages(chatId, 'PublicMessage', 10);
        const userIdOrVisitor = chat.userId || chat.visitorId || `visitor_${Date.now()}`;
        const requestId = chatUtils.createRequestId(userIdOrVisitor);
        const duplicateCheck = await chatUtils.checkDuplicateRequest(chatId, requestId, 'PublicMessage');
        if (duplicateCheck.isDuplicate) {
            logger_1.logger.info('Duplicate public message requestId detected:', requestId);
            return res.status(400).json({
                success: false,
                error: 'Duplicate request',
                message: 'Message already sent.',
                duplicate: true
            });
        }
        const context = chatUtils.buildChatContext({
            styleVector: chat.styleVector,
            personaData: chat.personaData,
            systemPrompt: chat.systemPrompt,
            tokenLimit: chat.tokenLimit || 500,
            chatMemory: recentMessages.map(msg => ({
                content: msg.content,
                sender: msg.sender,
                timestamp: msg.createdAt
            })),
            currentMessages: [message.trim()],
            twinId: chat.twinId,
            isFirstMessage: shouldGenerateTitle
        });
        const { aiResponse, generatedTitle } = await chatUtils.generateAIResponse(context);
        const userMessage = await chatUtils.saveUserMessage({
            chatId,
            message,
            approved: moderation.approved,
            requestId,
            messageTable: 'PublicMessage',
            messageIdPrefix: 'pub_msg'
        });
        const aiMessage = await chatUtils.saveAIMessage({
            chatId,
            aiResponse,
            messageTable: 'PublicMessage',
            messageIdPrefix: 'pub_msg'
        });
        await chatUtils.updateChatMetadata({
            chatId,
            chatTable: 'PublicChat',
            generatedTitle,
            isFirstMessage,
            currentTitle,
            userMessage: message,
            aiResponse,
            updatedAtField: 'lastActivity'
        });
        res.json({
            success: true,
            messages: [
                {
                    id: userMessage.id,
                    content: message,
                    sender: 'human',
                    createdAt: userMessage.createdAt
                },
                {
                    id: aiMessage.id,
                    content: aiResponse,
                    sender: 'twin',
                    createdAt: aiMessage.createdAt
                }
            ],
            generatedTitle: generatedTitle || null,
            isFirstMessage: isFirstMessage
        });
    }
    catch (error) {
        logger_1.logger.error('sendPublicMessage error:', error);
        if (error instanceof errors_1.AppError) {
            return res.status(error.statusCode).json({
                success: false,
                error: error.message,
                errorCode: error.errorCode
            });
        }
        return res.status(500).json({
            success: false,
            error: 'Failed to send public message',
            errorCode: 'INTERNAL_ERROR'
        });
    }
};
exports.sendPublicMessage = sendPublicMessage;
const getPublicChatHistory = async (req, res, next) => {
    try {
        const { chatId } = req.params;
        const chatResult = await database_1.db.query(`
      SELECT pc.id, pc."twinId", pc."visitorId", pc."messageCount",
             t."publicHandle", t."sampleReply"
      FROM "PublicChat" pc
      LEFT JOIN "Twin" t ON pc."twinId" = t.id
      WHERE pc.id = $1
    `, [chatId]);
        if (chatResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Public chat not found',
                errorCode: errors_1.ErrorCodes.CHAT_NOT_FOUND
            });
        }
        const chat = chatResult.rows[0];
        const messagesResult = await database_1.db.query(`
      SELECT id, content, sender, "createdAt"
      FROM "PublicMessage"
      WHERE "chatId" = $1
      ORDER BY "createdAt" ASC
    `, [chatId]);
        res.json({
            success: true,
            chat: {
                id: chat.id,
                twinId: chat.twinId,
                visitorId: chat.visitorId,
                messageCount: chat.messageCount,
                twinHandle: chat.publicHandle,
                sampleReply: chat.sampleReply
            },
            messages: messagesResult.rows
        });
    }
    catch (error) {
        logger_1.logger.error('getPublicChatHistory error:', error);
        if (error instanceof errors_1.AppError) {
            return res.status(error.statusCode).json({
                success: false,
                error: error.message,
                errorCode: error.errorCode
            });
        }
        return res.status(500).json({
            success: false,
            error: 'Failed to get public chat history',
            errorCode: 'INTERNAL_ERROR'
        });
    }
};
exports.getPublicChatHistory = getPublicChatHistory;
const getPublicChatByTwin = async (req, res, next) => {
    try {
        const { twinId } = req.params;
        const { visitorId } = req.query;
        const twinResult = await database_1.db.query(`
      SELECT id, "isPublic", "publicHandle", "sampleReply"
      FROM "Twin"
      WHERE id = $1 AND "isPublic" = true
    `, [twinId]);
        if (twinResult.rows.length === 0) {
            throw errors_1.createError.notFound('Public twin not found', errors_1.ErrorCodes.TWIN_NOT_FOUND);
        }
        const twin = twinResult.rows[0];
        const existingChat = await database_1.publicChatQueries.findByTwinAndVisitor(twinId, visitorId);
        if (existingChat) {
            const messagesResult = await database_1.db.query(`
        SELECT id, content, sender, "createdAt"
        FROM "PublicMessage"
        WHERE "chatId" = $1
        ORDER BY "createdAt" ASC
      `, [existingChat.id]);
            return res.json({
                success: true,
                chatId: existingChat.id,
                twin: {
                    id: twin.id,
                    publicHandle: twin.publicHandle,
                    sampleReply: twin.sampleReply
                },
                messages: messagesResult.rows
            });
        }
        res.json({
            success: true,
            chatId: null,
            twin: {
                id: twin.id,
                publicHandle: twin.publicHandle,
                sampleReply: twin.sampleReply
            },
            messages: []
        });
    }
    catch (error) {
        if (error instanceof errors_1.AppError) {
            throw error;
        }
        throw errors_1.createError.internal('Failed to get public chat by twin', error);
    }
};
exports.getPublicChatByTwin = getPublicChatByTwin;
const getPublicChatsByTwin = async (req, res, next) => {
    try {
        const { twinId } = req.params;
        const { visitorId } = req.query;
        const userId = req.user?.id;
        const twinResult = await database_1.db.query(`
      SELECT id, "isPublic", "publicHandle", "sampleReply"
      FROM "Twin"
      WHERE id = $1 AND "isPublic" = true
    `, [twinId]);
        if (twinResult.rows.length === 0) {
            throw errors_1.createError.notFound('Public twin not found', errors_1.ErrorCodes.TWIN_NOT_FOUND);
        }
        const twin = twinResult.rows[0];
        const chatsResult = await database_1.db.query(`
      SELECT pc.id, pc."messageCount", pc."createdAt", pc."lastActivity", pc."title",
             m.content as last_message, m."createdAt" as last_message_time
      FROM "PublicChat" pc
      LEFT JOIN LATERAL (
        SELECT content, "createdAt"
        FROM "PublicMessage" 
        WHERE "chatId" = pc.id 
        ORDER BY "createdAt" DESC 
        LIMIT 1
      ) m ON true
      WHERE pc."twinId" = $1 
        AND (
          (pc."userId" = $2 AND $2 IS NOT NULL) 
          OR 
          (pc."visitorId" = $3 AND $2 IS NULL AND $3 IS NOT NULL)
        )
      ORDER BY pc."lastActivity" DESC, pc."createdAt" DESC
    `, [twinId, userId || null, visitorId || null]);
        const chats = chatsResult.rows.map(chat => ({
            id: chat.id,
            messageCount: chat.messageCount || 0,
            createdAt: chat.createdAt,
            lastActivity: chat.lastActivity,
            title: chat.title || null,
            lastMessage: chat.last_message ? {
                content: chat.last_message,
                createdAt: chat.last_message_time
            } : null
        }));
        res.json({
            success: true,
            twin: {
                id: twin.id,
                publicHandle: twin.publicHandle,
                sampleReply: twin.sampleReply
            },
            chats
        });
    }
    catch (error) {
        if (error instanceof errors_1.AppError) {
            throw error;
        }
        throw errors_1.createError.internal('Failed to get public chats by twin', error);
    }
};
exports.getPublicChatsByTwin = getPublicChatsByTwin;
const createNewPublicChat = async (req, res, next) => {
    try {
        const { twinId, visitorId } = req.body;
        const userId = req.user?.id;
        logger_1.logger.info(`[createNewPublicChat] Twin: ${twinId}, UserId: ${userId || 'anonymous'}, VisitorId: ${visitorId || 'none'}`);
        const twinResult = await database_1.db.query(`
      SELECT id, "isPublic", "styleVector", "sampleReply"
      FROM "Twin"
      WHERE id = $1 AND "isPublic" = true
    `, [twinId]);
        if (twinResult.rows.length === 0) {
            throw errors_1.createError.notFound('Public twin not found', errors_1.ErrorCodes.TWIN_NOT_FOUND);
        }
        const twin = twinResult.rows[0];
        const publicChat = await database_1.publicChatQueries.create(twinId, visitorId, userId);
        logger_1.logger.info(`[createNewPublicChat] Chat created - ChatId: ${publicChat.id}, UserId: ${publicChat.userId || 'null'}`);
        res.json({
            success: true,
            chatId: publicChat.id,
            twin: {
                id: twin.id,
                sampleReply: twin.sampleReply
            }
        });
    }
    catch (error) {
        if (error instanceof errors_1.AppError) {
            throw error;
        }
        throw errors_1.createError.internal('Failed to create new public chat', error);
    }
};
exports.createNewPublicChat = createNewPublicChat;
const getUserPublicChats = async (req, res, next) => {
    try {
        if (!req.user) {
            throw errors_1.createError.unauthorized();
        }
        const userId = req.user.id;
        logger_1.logger.info(`[getUserPublicChats] Fetching chats for userId: ${userId}`);
        const chatsResult = await database_1.db.query(`
      SELECT DISTINCT ON (pc."twinId")
        pc.id as chat_id,
        pc."twinId",
        pc."messageCount",
        pc."createdAt",
        pc."lastActivity",
        pc."title",
        t."publicHandle",
        t.bio,
        t."profileImage",
        t."likeCount",
        t."chatCount",
        t."followCount",
        t."verified",
        (
          SELECT content 
          FROM "PublicMessage" 
          WHERE "chatId" = pc.id 
          ORDER BY "createdAt" DESC 
          LIMIT 1
        ) as last_message_content,
        (
          SELECT "createdAt" 
          FROM "PublicMessage" 
          WHERE "chatId" = pc.id 
          ORDER BY "createdAt" DESC 
          LIMIT 1
        ) as last_message_time
      FROM "PublicChat" pc
      JOIN "Twin" t ON pc."twinId" = t.id
      WHERE pc."userId" = $1 
        AND t."isPublic" = true
      ORDER BY pc."twinId", pc."lastActivity" DESC
    `, [userId]);
        logger_1.logger.info(`[getUserPublicChats] Query returned ${chatsResult?.rows?.length || 0} rows`);
        const twinChatsMap = new Map();
        chatsResult.rows.forEach(row => {
            const twinId = row.twinId;
            if (!twinChatsMap.has(twinId)) {
                twinChatsMap.set(twinId, {
                    twin: {
                        id: twinId,
                        publicHandle: row.publicHandle,
                        bio: row.bio,
                        profileImage: row.profileImage,
                        likeCount: row.likeCount || 0,
                        chatCount: row.chatCount || 0,
                        followCount: row.followCount || 0,
                        verified: row.verified || false
                    },
                    latestChat: {
                        id: row.chat_id,
                        messageCount: row.messageCount || 0,
                        createdAt: row.createdAt,
                        lastActivity: row.lastActivity,
                        title: row.title
                    },
                    lastMessage: row.last_message_content ? {
                        content: row.last_message_content,
                        createdAt: row.last_message_time
                    } : null
                });
            }
            else {
                const existing = twinChatsMap.get(twinId);
                if (new Date(row.lastActivity) > new Date(existing.latestChat.lastActivity)) {
                    existing.latestChat = {
                        id: row.chat_id,
                        messageCount: row.messageCount || 0,
                        createdAt: row.createdAt,
                        lastActivity: row.lastActivity,
                        title: row.title
                    };
                    existing.lastMessage = row.last_message_content ? {
                        content: row.last_message_content,
                        createdAt: row.last_message_time
                    } : null;
                }
            }
        });
        const twinChats = Array.from(twinChatsMap.values())
            .sort((a, b) => {
            const timeA = a.latestChat.lastActivity;
            const timeB = b.latestChat.lastActivity;
            return new Date(timeB).getTime() - new Date(timeA).getTime();
        });
        logger_1.logger.info(`[getUserPublicChats] Found ${twinChats.length} unique twins with chats for userId: ${userId}`);
        logger_1.logger.debug(`[getUserPublicChats] Raw query result count: ${chatsResult.rows.length}`);
        res.json({
            success: true,
            chats: twinChats,
            total: twinChats.length
        });
    }
    catch (error) {
        if (error instanceof errors_1.AppError) {
            throw error;
        }
        throw errors_1.createError.internal('Failed to get user public chats', error);
    }
};
exports.getUserPublicChats = getUserPublicChats;
const deletePublicChat = async (req, res, next) => {
    try {
        const { chatId } = req.params;
        if (!chatId) {
            return res.status(400).json({
                success: false,
                error: 'Chat ID is required',
                errorCode: 'VALIDATION_ERROR'
            });
        }
        const chatResult = await database_1.db.query(`
      SELECT id FROM "PublicChat" WHERE id = $1
    `, [chatId]);
        if (!chatResult || chatResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Public chat not found',
                errorCode: errors_1.ErrorCodes.CHAT_NOT_FOUND
            });
        }
        await database_1.db.query(`
      DELETE FROM "PublicChat" WHERE id = $1
    `, [chatId]);
        logger_1.logger.info('Public chat deleted successfully:', { chatId });
        res.json({
            success: true,
            message: 'Chat deleted successfully'
        });
    }
    catch (error) {
        logger_1.logger.error('deletePublicChat error:', error);
        if (error instanceof errors_1.AppError) {
            return res.status(error.statusCode).json({
                success: false,
                error: error.message,
                errorCode: error.errorCode
            });
        }
        return res.status(500).json({
            success: false,
            error: 'Failed to delete public chat',
            errorCode: 'INTERNAL_ERROR'
        });
    }
};
exports.deletePublicChat = deletePublicChat;
const updatePublicChatTitle = async (req, res, next) => {
    try {
        const { chatId } = req.params;
        const { title } = req.body;
        if (!chatId) {
            return res.status(400).json({
                success: false,
                error: 'Chat ID is required',
                errorCode: 'VALIDATION_ERROR'
            });
        }
        if (!title || typeof title !== 'string' || title.trim().length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Title is required',
                errorCode: 'VALIDATION_ERROR'
            });
        }
        const chatResult = await database_1.db.query(`
      SELECT id FROM "PublicChat" WHERE id = $1
    `, [chatId]);
        if (!chatResult || chatResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Public chat not found',
                errorCode: errors_1.ErrorCodes.CHAT_NOT_FOUND
            });
        }
        await database_1.db.query(`
      UPDATE "PublicChat" SET "title" = $1, "lastActivity" = NOW() WHERE id = $2
    `, [title.trim(), chatId]);
        logger_1.logger.info('Public chat title updated:', { chatId, title: title.trim() });
        res.json({
            success: true,
            message: 'Chat title updated successfully'
        });
    }
    catch (error) {
        logger_1.logger.error('updatePublicChatTitle error:', error);
        if (error instanceof errors_1.AppError) {
            return res.status(error.statusCode).json({
                success: false,
                error: error.message,
                errorCode: error.errorCode
            });
        }
        return res.status(500).json({
            success: false,
            error: 'Failed to update chat title',
            errorCode: 'INTERNAL_ERROR'
        });
    }
};
exports.updatePublicChatTitle = updatePublicChatTitle;
//# sourceMappingURL=publicChatController.js.map