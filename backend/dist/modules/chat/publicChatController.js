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
exports.viewPublicChatHistory = exports.getUserWisePublicChats = exports.getAllPublicChatsForTwin = exports.updatePublicChatTitle = exports.deletePublicChat = exports.getUserPublicChats = exports.createNewPublicChat = exports.getPublicChatsByTwin = exports.getPublicChatByTwin = exports.getPublicChatHistory = exports.sendPublicMessage = exports.startPublicChat = void 0;
const database_1 = require("../../config/database");
const idGenerator_1 = require("../../utils/idGenerator");
const logger_1 = require("../../config/logger");
const eventLogger_1 = require("../../services/eventLogger");
const twinService_1 = require("../twin/twinService");
const zod_1 = require("zod");
const errors_1 = require("../../utils/errors");
const chatUtils = __importStar(require("./chatSharedUtils"));
const errorHandler_1 = require("../../utils/errorHandler");
const timestampUtils_1 = require("../../utils/timestampUtils");
const startPublicChatSchema = zod_1.z.object({
    twinId: zod_1.z.string().min(1, 'Twin ID is required'),
    visitorId: zod_1.z.string().nullish()
});
const sendPublicMessageSchema = zod_1.z.object({
    message: zod_1.z.string()
        .min(1, 'Message cannot be empty')
        .max(1000, 'Message must be less than 1000 characters')
});
const twinService = new twinService_1.TwinService();
const startPublicChat = async (req, res, next) => {
    let twinId;
    let visitorId;
    let userId;
    let finalVisitorId;
    try {
        const parsed = startPublicChatSchema.parse(req.body);
        twinId = parsed.twinId;
        visitorId = parsed.visitorId;
        userId = req.user?.id;
        logger_1.logger.info(`[startPublicChat] Twin: ${twinId}, UserId: ${userId || 'anonymous'}, VisitorId: ${visitorId || 'none'}`);
        finalVisitorId = userId ? null : (visitorId || idGenerator_1.generateId.visitor());
        const twinResult = await database_1.db.query(`
      SELECT id, "isPublic", "styleVector", "sampleReply", "requireApproval", "requireLogin"
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
                requireApproval: false,
                requireLogin: false
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
        if (twin.requireLogin && !userId) {
            return res.status(401).json({
                success: false,
                error: 'Login required to chat with this twin',
                errorCode: 'LOGIN_REQUIRED'
            });
        }
        if (userId) {
            const blockedCheck = await database_1.db.query(`
        SELECT id FROM "TwinBlockedUsers"
        WHERE "twinId" = $1 AND "userId" = $2
      `, [twinId, userId]);
            if (blockedCheck.rows.length > 0) {
                return res.status(403).json({
                    success: false,
                    error: 'You are blocked from chatting with this twin',
                    errorCode: 'USER_BLOCKED'
                });
            }
        }
        if (userId) {
            const twinOwnerCheck = await database_1.db.query(`
        SELECT "userId" FROM "Twin" WHERE id = $1
      `, [twinId]);
            if (twinOwnerCheck.rows.length > 0 && twinOwnerCheck.rows[0].userId === userId) {
                return res.status(403).json({
                    success: false,
                    error: 'You cannot chat with your own twin in public chat. Please use Enhanced Chat.',
                    errorCode: 'OWN_TWIN_CHAT',
                    redirectUrl: `/chat-enhanced?twinId=${twinId}`
                });
            }
        }
        logger_1.logger.info(`[startPublicChat] Creating new chat - TwinId: ${twinId}, UserId: ${userId || 'null'}, VisitorId: ${finalVisitorId || 'null'}`);
        let publicChat;
        try {
            publicChat = await database_1.publicChatQueries.create(twinId, finalVisitorId || undefined, userId || undefined);
            logger_1.logger.info(`[startPublicChat] Chat created successfully - ChatId: ${publicChat.id}, UserId set: ${publicChat.userId || 'null'}`);
        }
        catch (createError) {
            const createErrorMessage = createError?.message || String(createError) || 'Unknown create error';
            logger_1.logger.error('[startPublicChat] Failed to create chat:', {
                error: createErrorMessage,
                errorType: createError?.constructor?.name,
                errorCode: createError?.code,
                errorDetail: createError?.detail,
                errorConstraint: createError?.constraint,
                stack: createError?.stack,
                twinId,
                userId: userId || 'null',
                visitorId: finalVisitorId || 'null',
                fullError: JSON.stringify(createError, Object.getOwnPropertyNames(createError))
            });
            throw createError;
        }
        if (userId) {
            try {
                await eventLogger_1.EventLogger.logUserEvent(userId, 'public_chat_started', {
                    twinId,
                    chatId: publicChat.id
                });
            }
            catch (eventError) {
                logger_1.logger.warn('[startPublicChat] Failed to log event:', eventError);
            }
        }
        else if (finalVisitorId && !finalVisitorId.startsWith('visitor_')) {
            try {
                await eventLogger_1.EventLogger.logUserEvent(finalVisitorId, 'public_chat_started', {
                    twinId,
                    chatId: publicChat.id
                });
            }
            catch (eventError) {
                logger_1.logger.warn('[startPublicChat] Failed to log event:', eventError);
            }
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
        const errorMessage = error?.message || String(error) || 'Unknown error';
        const errorStack = error?.stack || 'No stack trace';
        logger_1.logger.error('startPublicChat error:', {
            message: errorMessage,
            stack: errorStack,
            name: error?.name,
            code: error?.code,
            twinId: twinId || 'undefined',
            userId: userId || 'undefined',
            visitorId: visitorId || 'undefined',
            finalVisitorId: finalVisitorId || 'undefined',
            body: req.body,
            errorString: String(error),
            errorJSON: JSON.stringify(error, Object.getOwnPropertyNames(error))
        });
        const errorMessageToReturn = process.env.NODE_ENV === 'development'
            ? errorMessage
            : 'Failed to start public chat';
        (0, errorHandler_1.handleErrorWithSuccessFormat)(error, res, errorMessageToReturn);
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
            (0, errorHandler_1.handleErrorWithSuccessFormat)(error, res, 'Message validation failed');
            return;
        }
        const chatResult = await database_1.db.query(`
      SELECT pc.id, pc."twinId", pc."visitorId", pc."messageCount", pc."userId", pc."title",
             t."styleVector", t."sampleReply", t."personaData", t."systemPrompt", t."tokenLimit", t."requireLogin"
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
        const userId = req.user?.id;
        if (chat.requireLogin && !userId) {
            return res.status(401).json({
                success: false,
                error: 'Login required to send messages to this twin',
                errorCode: 'LOGIN_REQUIRED'
            });
        }
        if (userId) {
            const twinOwnerCheck = await database_1.db.query(`
        SELECT "userId" FROM "Twin" WHERE id = $1
      `, [chat.twinId]);
            if (twinOwnerCheck.rows.length > 0 && twinOwnerCheck.rows[0].userId === userId) {
                return res.status(403).json({
                    success: false,
                    error: 'You cannot chat with your own twin in public chat. Please use Enhanced Chat.',
                    errorCode: 'OWN_TWIN_CHAT',
                    redirectUrl: `/chat-enhanced?twinId=${chat.twinId}`
                });
            }
        }
        if (chat.userId) {
            const blockedCheck = await database_1.db.query(`
        SELECT id FROM "TwinBlockedUsers"
        WHERE "twinId" = $1 AND "userId" = $2
      `, [chat.twinId, chat.userId]);
            if (blockedCheck.rows.length > 0) {
                return res.status(403).json({
                    success: false,
                    error: 'You are blocked from chatting with this twin',
                    errorCode: 'USER_BLOCKED'
                });
            }
        }
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
        const shouldGenerateTitle = isFirstMessage === true;
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
        if (chat.twinId) {
            const rememberPatterns = [
                /remember\s+(?:that|this|my|i|me|my\s+name)/i,
                /save\s+(?:this|it|that|my\s+name)/i,
                /don'?t\s+forget/i,
                /keep\s+in\s+mind/i,
                /memorize/i,
                /store\s+(?:this|it|that)/i,
                /isko\s+yaad\s+rakho/i,
                /yaad\s+rakhna/i
            ];
            const shouldExtractFacts = rememberPatterns.some(pattern => pattern.test(message));
            if (shouldExtractFacts) {
                logger_1.logger.info('✅ User requested to remember something - extracting facts');
                const recentMessages = await chatUtils.getRecentMessages(chatId, 'PublicMessage', 5);
                const contextText = recentMessages.map(m => m.content).join('\n');
                const { memoryService } = await Promise.resolve().then(() => __importStar(require('../../services/memoryService')));
                memoryService.extractLongTermFacts(chat.twinId, contextText)
                    .then(() => {
                    logger_1.logger.info(`✅ Facts extracted from user's "remember this" request for twin ${chat.twinId}`);
                })
                    .catch(err => logger_1.logger.error('Fact extraction failed:', err));
            }
        }
        res.json({
            success: true,
            messages: [
                {
                    id: userMessage.id,
                    content: message,
                    sender: 'human',
                    createdAt: (0, timestampUtils_1.normalizeTimestamp)(userMessage.createdAt),
                    relativeTime: (0, timestampUtils_1.formatRelativeTime)(userMessage.createdAt)
                },
                {
                    id: aiMessage.id,
                    content: aiResponse,
                    sender: 'twin',
                    createdAt: (0, timestampUtils_1.normalizeTimestamp)(aiMessage.createdAt),
                    relativeTime: (0, timestampUtils_1.formatRelativeTime)(aiMessage.createdAt)
                }
            ],
            generatedTitle: generatedTitle || null,
            isFirstMessage: isFirstMessage,
            serverTime: new Date().toISOString()
        });
    }
    catch (error) {
        logger_1.logger.error('sendPublicMessage error:', error);
        (0, errorHandler_1.handleErrorWithSuccessFormat)(error, res, 'Failed to send public message');
    }
};
exports.sendPublicMessage = sendPublicMessage;
const getPublicChatHistory = async (req, res, next) => {
    try {
        const { chatId } = req.params;
        const userId = req.user?.id;
        const chatResult = await database_1.db.query(`
      SELECT pc.id, pc."twinId", pc."visitorId", pc."messageCount", pc."userId",
             t."publicHandle", t."sampleReply", t."showChatHistory", t."userId" as twin_owner_id
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
        const isTwinOwner = userId && chat.twin_owner_id === userId;
        const isChatOwner = chat.userId === userId;
        const showChatHistoryValue = chat.showChatHistory;
        const isHistoryEnabled = showChatHistoryValue === true || showChatHistoryValue === null || showChatHistoryValue === undefined;
        const isHistoryDisabled = showChatHistoryValue === false;
        logger_1.logger.info(`[getPublicChatHistory] ChatId: ${chatId}, showChatHistory: ${showChatHistoryValue} (type: ${typeof showChatHistoryValue}), isTwinOwner: ${isTwinOwner}, isChatOwner: ${isChatOwner}, isHistoryEnabled: ${isHistoryEnabled}`);
        let canViewMessages = false;
        if (isTwinOwner || isChatOwner) {
            canViewMessages = true;
            logger_1.logger.info(`[getPublicChatHistory] Allowing access - Owner (twin: ${isTwinOwner}, chat: ${isChatOwner})`);
        }
        else if (isHistoryEnabled) {
            canViewMessages = true;
            logger_1.logger.info(`[getPublicChatHistory] Allowing access - History enabled (value: ${showChatHistoryValue})`);
        }
        else if (isHistoryDisabled) {
            const latestChatResult = await database_1.db.query(`
        SELECT id FROM "PublicChat"
        WHERE "twinId" = $1
          AND (
            ("userId" = $2 AND $2 IS NOT NULL)
            OR
            ("visitorId" = $3 AND $2 IS NULL AND $3 IS NOT NULL)
          )
        ORDER BY "lastActivity" DESC NULLS LAST, "createdAt" DESC
        LIMIT 1
      `, [chat.twinId, userId || null, chat.visitorId || null]);
            const isLatestChat = latestChatResult && latestChatResult.rows.length > 0 && latestChatResult.rows[0].id === chatId;
            canViewMessages = isLatestChat;
            logger_1.logger.info(`[getPublicChatHistory] History disabled - isLatestChat: ${isLatestChat}, latestChatId: ${latestChatResult?.rows[0]?.id || 'none'}`);
        }
        let messagesResult;
        if (canViewMessages) {
            messagesResult = await database_1.db.query(`
        SELECT id, content, sender, "createdAt"
        FROM "PublicMessage"
        WHERE "chatId" = $1
        ORDER BY "createdAt" ASC
      `, [chatId]);
            logger_1.logger.info(`[getPublicChatHistory] Returning ${messagesResult.rows.length} messages for chatId: ${chatId}`);
        }
        else {
            messagesResult = { rows: [] };
            logger_1.logger.info(`[getPublicChatHistory] Returning empty messages - access denied for chatId: ${chatId}`);
        }
        res.json({
            success: true,
            chat: {
                id: chat.id,
                twinId: chat.twinId,
                visitorId: chat.visitorId,
                messageCount: chat.messageCount,
                twinHandle: chat.publicHandle,
                sampleReply: chat.sampleReply,
                isTwinOwner: isTwinOwner,
                showChatHistory: chat.showChatHistory
            },
            messages: messagesResult.rows.map(msg => ({
                id: msg.id,
                content: msg.content,
                sender: msg.sender,
                createdAt: (0, timestampUtils_1.normalizeTimestamp)(msg.createdAt),
                relativeTime: (0, timestampUtils_1.formatRelativeTime)(msg.createdAt)
            })),
            serverTime: new Date().toISOString()
        });
    }
    catch (error) {
        logger_1.logger.error('getPublicChatHistory error:', error);
        (0, errorHandler_1.handleErrorWithSuccessFormat)(error, res, 'Failed to get public chat history');
    }
};
exports.getPublicChatHistory = getPublicChatHistory;
const getPublicChatByTwin = async (req, res, next) => {
    try {
        const { twinId } = req.params;
        const { visitorId } = req.query;
        const twinResult = await database_1.db.query(`
  SELECT id, "isPublic", "publicHandle", "sampleReply"
  FROM "Twin" t
  WHERE t.id = $1 
    AND t."isPublic" = true
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
        (0, errorHandler_1.handleControllerError)(error, 'Failed to get public chat by twin');
    }
};
exports.getPublicChatByTwin = getPublicChatByTwin;
const getPublicChatsByTwin = async (req, res, next) => {
    try {
        const { twinId } = req.params;
        const { visitorId } = req.query;
        const userId = req.user?.id;
        const twinResult = await database_1.db.query(`
      SELECT id, "isPublic", "publicHandle", "sampleReply", "showChatHistory", "userId"
      FROM "Twin"
      WHERE id = $1 AND "isPublic" = true
    `, [twinId]);
        if (twinResult.rows.length === 0) {
            throw errors_1.createError.notFound('Public twin not found', errors_1.ErrorCodes.TWIN_NOT_FOUND);
        }
        const twin = twinResult.rows[0];
        const isTwinOwner = userId && twin.userId === userId;
        const showChatHistoryValue = twin.showChatHistory;
        const isHistoryEnabled = showChatHistoryValue === true || showChatHistoryValue === null || showChatHistoryValue === undefined;
        const isHistoryDisabled = showChatHistoryValue === false;
        logger_1.logger.info(`[getPublicChatsByTwin] TwinId: ${twinId}, showChatHistory: ${showChatHistoryValue} (type: ${typeof showChatHistoryValue}), isTwinOwner: ${isTwinOwner}, isHistoryEnabled: ${isHistoryEnabled}`);
        const shouldFilterHistory = isHistoryDisabled && !isTwinOwner;
        let chatsResult;
        if (shouldFilterHistory) {
            logger_1.logger.info(`[getPublicChatsByTwin] Filtering - showing only latest chat (history disabled)`);
            chatsResult = await database_1.db.query(`
        SELECT pc.id, pc."messageCount", pc."createdAt", pc."lastActivity", pc."title", pc."userId",
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
        ORDER BY pc."lastActivity" DESC NULLS LAST, pc."createdAt" DESC
        LIMIT 1
      `, [twinId, userId || null, visitorId || null]);
        }
        else {
            logger_1.logger.info(`[getPublicChatsByTwin] Showing all chats (history enabled: ${isHistoryEnabled} or owner: ${isTwinOwner})`);
            chatsResult = await database_1.db.query(`
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
        ORDER BY pc."lastActivity" DESC NULLS LAST, pc."createdAt" DESC
      `, [twinId, userId || null, visitorId || null]);
        }
        const chats = chatsResult.rows.map(chat => ({
            id: chat.id,
            messageCount: chat.messageCount || 0,
            createdAt: (0, timestampUtils_1.normalizeTimestamp)(chat.createdAt),
            lastActivity: (0, timestampUtils_1.normalizeTimestamp)(chat.lastActivity),
            title: chat.title || null,
            lastMessage: chat.last_message ? {
                content: chat.last_message,
                createdAt: (0, timestampUtils_1.normalizeTimestamp)(chat.last_message_time),
                relativeTime: (0, timestampUtils_1.formatRelativeTime)(chat.last_message_time)
            } : null
        }));
        logger_1.logger.info(`[getPublicChatsByTwin] Returning ${chats.length} chats for twinId: ${twinId}`);
        logger_1.logger.info(`[getPublicChatsByTwin] First chat sample:`, chats[0] ? JSON.stringify(chats[0]) : 'no chats');
        const responseData = {
            success: true,
            twin: {
                id: twin.id,
                publicHandle: twin.publicHandle,
                sampleReply: twin.sampleReply,
                showChatHistory: twin.showChatHistory
            },
            chats,
            serverTime: new Date().toISOString()
        };
        logger_1.logger.info(`[getPublicChatsByTwin] Sending response with ${responseData.chats.length} chats`);
        res.json(responseData);
    }
    catch (error) {
        (0, errorHandler_1.handleControllerError)(error, 'Failed to get public chats by twin');
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
        (0, errorHandler_1.handleControllerError)(error, 'Failed to create new public chat');
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
      WITH twin_stats AS (
        SELECT 
          pc."twinId",
          COUNT(DISTINCT pc.id) as total_chats,
          COALESCE(SUM(pc."messageCount"), 0) as total_messages,
          MAX(pc."lastActivity") as latest_activity
        FROM "PublicChat" pc
        JOIN "Twin" t ON pc."twinId" = t.id
        WHERE pc."userId" = $1 
          AND t."isPublic" = true
        GROUP BY pc."twinId"
      ),
      latest_chats AS (
        SELECT DISTINCT ON (pc."twinId")
          pc.id as chat_id,
          pc."twinId",
          pc."messageCount" as latest_chat_message_count,
          pc."createdAt" as latest_chat_created_at,
          pc."lastActivity" as latest_chat_last_activity,
          pc."title" as latest_chat_title,
          t."publicHandle",
          t.bio,
          t."profileImage",
          t."likeCount",
          t."chatCount",
          t."followCount",
          t."verified"
        FROM "PublicChat" pc
        JOIN "Twin" t ON pc."twinId" = t.id
        WHERE pc."userId" = $1 
          AND t."isPublic" = true
        ORDER BY pc."twinId", pc."lastActivity" DESC
      )
      SELECT 
        lc.*,
        ts.total_chats,
        ts.total_messages,
        (
          SELECT content 
          FROM "PublicMessage" 
          WHERE "chatId" = lc.chat_id 
          ORDER BY "createdAt" DESC 
          LIMIT 1
        ) as last_message_content,
        (
          SELECT "createdAt" 
          FROM "PublicMessage" 
          WHERE "chatId" = lc.chat_id 
          ORDER BY "createdAt" DESC 
          LIMIT 1
        ) as last_message_time
      FROM latest_chats lc
      JOIN twin_stats ts ON lc."twinId" = ts."twinId"
      ORDER BY lc.latest_chat_last_activity DESC
    `, [userId]);
        logger_1.logger.info(`[getUserPublicChats] Query returned ${chatsResult?.rows?.length || 0} rows`);
        const twinChats = chatsResult.rows.map(row => ({
            twin: {
                id: row.twinId,
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
                messageCount: row.latest_chat_message_count || 0,
                createdAt: (0, timestampUtils_1.normalizeTimestamp)(row.latest_chat_created_at),
                lastActivity: (0, timestampUtils_1.normalizeTimestamp)(row.latest_chat_last_activity),
                title: row.latest_chat_title
            },
            totalChats: parseInt(row.total_chats || '0', 10),
            totalMessages: parseInt(row.total_messages || '0', 10),
            lastMessage: row.last_message_content ? {
                content: row.last_message_content,
                createdAt: (0, timestampUtils_1.normalizeTimestamp)(row.last_message_time),
                relativeTime: (0, timestampUtils_1.formatRelativeTime)(row.last_message_time)
            } : null
        }));
        logger_1.logger.info(`[getUserPublicChats] Found ${twinChats.length} unique twins with chats for userId: ${userId}`);
        res.json({
            success: true,
            chats: twinChats,
            total: twinChats.length,
            serverTime: new Date().toISOString()
        });
    }
    catch (error) {
        (0, errorHandler_1.handleControllerError)(error, 'Failed to get user public chats');
    }
};
exports.getUserPublicChats = getUserPublicChats;
const deletePublicChat = async (req, res, next) => {
    try {
        const { chatId } = req.params;
        const userId = req.user?.id;
        if (!chatId) {
            return res.status(400).json({
                success: false,
                error: 'Chat ID is required',
                errorCode: 'VALIDATION_ERROR'
            });
        }
        const chatResult = await database_1.db.query(`
      SELECT id, "userId", "visitorId", "twinId" FROM "PublicChat" WHERE id = $1
    `, [chatId]);
        if (!chatResult || chatResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Public chat not found',
                errorCode: errors_1.ErrorCodes.CHAT_NOT_FOUND
            });
        }
        const chat = chatResult.rows[0];
        if (userId) {
            if (chat.userId !== userId) {
                const twinCheck = await database_1.db.query(`
          SELECT "userId" FROM "Twin" WHERE id = $1
        `, [chat.twinId]);
                if (twinCheck.rows.length === 0 || twinCheck.rows[0].userId !== userId) {
                    return res.status(403).json({
                        success: false,
                        error: 'You do not have permission to delete this chat',
                        errorCode: 'UNAUTHORIZED'
                    });
                }
            }
        }
        else {
            return res.status(401).json({
                success: false,
                error: 'Authentication required to delete chat',
                errorCode: 'AUTH_REQUIRED'
            });
        }
        await database_1.db.query(`
      DELETE FROM "PublicChat" WHERE id = $1
    `, [chatId]);
        logger_1.logger.info('Public chat deleted successfully:', { chatId, userId });
        res.json({
            success: true,
            message: 'Chat deleted successfully'
        });
    }
    catch (error) {
        logger_1.logger.error('deletePublicChat error:', error);
        (0, errorHandler_1.handleErrorWithSuccessFormat)(error, res, 'Failed to delete public chat');
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
        const utcTimestamp = new Date().toISOString();
        await database_1.db.query(`
      UPDATE "PublicChat" SET "title" = $1, "lastActivity" = $2::timestamptz WHERE id = $3
    `, [title.trim(), utcTimestamp, chatId]);
        logger_1.logger.info('Public chat title updated:', { chatId, title: title.trim() });
        res.json({
            success: true,
            message: 'Chat title updated successfully'
        });
    }
    catch (error) {
        logger_1.logger.error('updatePublicChatTitle error:', error);
        (0, errorHandler_1.handleErrorWithSuccessFormat)(error, res, 'Failed to update chat title');
    }
};
exports.updatePublicChatTitle = updatePublicChatTitle;
const getAllPublicChatsForTwin = async (req, res, next) => {
    try {
        const { twinId } = req.params;
        const userId = req.user?.id;
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 5, 50);
        const offset = (page - 1) * limit;
        const view = req.query.view || 'chat';
        const filterUserId = req.query.userId;
        const dateFrom = req.query.dateFrom;
        const dateTo = req.query.dateTo;
        const search = req.query.search;
        const sortBy = req.query.sortBy || 'lastActivity';
        if (!userId) {
            throw errors_1.createError.unauthorized('Authentication required');
        }
        const twinResult = await database_1.db.query(`
      SELECT id, "publicHandle", "isPublic", "userId"
      FROM "Twin"
      WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);
        if (twinResult.rows.length === 0) {
            throw errors_1.createError.notFound('Twin not found or access denied', errors_1.ErrorCodes.TWIN_NOT_FOUND);
        }
        const twin = twinResult.rows[0];
        let whereConditions = ['pc."twinId" = $1'];
        let params = [twinId];
        let paramIndex = 2;
        if (filterUserId) {
            whereConditions.push(`pc."userId" = $${paramIndex}`);
            params.push(filterUserId);
            paramIndex++;
        }
        if (dateFrom) {
            whereConditions.push(`pc."createdAt" >= $${paramIndex}::timestamptz`);
            params.push(dateFrom);
            paramIndex++;
        }
        if (dateTo) {
            whereConditions.push(`pc."createdAt" <= $${paramIndex}::timestamptz`);
            params.push(dateTo);
            paramIndex++;
        }
        let searchJoin = '';
        let searchCondition = '';
        if (search && search.trim()) {
            searchJoin = `
        INNER JOIN "PublicMessage" pm_search ON pc.id = pm_search."chatId"
      `;
            searchCondition = `AND pm_search.content ILIKE $${paramIndex}`;
            params.push(`%${search.trim()}%`);
            paramIndex++;
        }
        let orderByClause = '';
        switch (sortBy) {
            case 'createdAt':
                orderByClause = 'pc."createdAt" DESC';
                break;
            case 'messageCount':
                orderByClause = 'pc."messageCount" DESC';
                break;
            case 'lastActivity':
            default:
                orderByClause = 'COALESCE(pc."lastActivity", pc."createdAt") DESC';
                break;
        }
        const totalResult = await database_1.db.query(`
      SELECT COUNT(DISTINCT pc.id) as total
      FROM "PublicChat" pc
      ${searchJoin}
      WHERE ${whereConditions.join(' AND ')}
      ${searchCondition}
    `, params);
        const total = parseInt(totalResult.rows[0]?.total || '0', 10);
        const chatsResult = await database_1.db.query(`
      SELECT 
        pc.id,
        pc."twinId",
        pc."userId",
        pc."visitorId",
        pc."messageCount",
        pc."title",
        pc."createdAt",
        pc."lastActivity",
        u.id as user_id,
        u.handle as user_handle,
        u.name as user_name,
        u."profileImage" as user_profile_image,
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
        ) as last_message_time,
        CASE WHEN pc."userId" IS NOT NULL THEN 0 ELSE 1 END as user_priority
      FROM "PublicChat" pc
      LEFT JOIN "User" u ON pc."userId" = u.id
      ${searchJoin}
      WHERE ${whereConditions.join(' AND ')}
      ${searchCondition}
      ${search && search.trim() ? 'GROUP BY pc.id, pc."twinId", pc."userId", pc."visitorId", pc."messageCount", pc."title", pc."createdAt", pc."lastActivity", u.id, u.handle, u.name, u."profileImage"' : ''}
      ORDER BY 
        user_priority,
        ${orderByClause}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, [...params, limit, offset]);
        const chats = chatsResult.rows.map(chat => ({
            id: chat.id,
            twinId: chat.twinId,
            userId: chat.userId,
            visitorId: chat.visitorId || null,
            messageCount: chat.messageCount || 0,
            title: chat.title || 'Untitled Chat',
            createdAt: (0, timestampUtils_1.normalizeTimestamp)(chat.createdAt),
            lastActivity: (0, timestampUtils_1.normalizeTimestamp)(chat.lastActivity),
            user: chat.user_id ? {
                id: chat.user_id,
                handle: chat.user_handle,
                name: chat.user_name,
                profileImage: chat.user_profile_image
            } : null,
            isAnonymous: !chat.userId && (chat.visitorId !== null && chat.visitorId !== undefined),
            lastMessage: chat.last_message_content ? {
                content: chat.last_message_content,
                createdAt: (0, timestampUtils_1.normalizeTimestamp)(chat.last_message_time),
                relativeTime: (0, timestampUtils_1.formatRelativeTime)(chat.last_message_time)
            } : null
        }));
        res.json({
            success: true,
            chats: chats,
            twin: {
                id: twin.id,
                publicHandle: twin.publicHandle
            },
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(total / limit),
                totalItems: total,
                itemsPerPage: limit
            },
            filters: {
                view,
                userId: filterUserId,
                dateFrom,
                dateTo,
                search,
                sortBy
            }
        });
    }
    catch (error) {
        (0, errorHandler_1.handleControllerError)(error, 'Failed to get public chats for twin');
    }
};
exports.getAllPublicChatsForTwin = getAllPublicChatsForTwin;
const getUserWisePublicChats = async (req, res, next) => {
    try {
        const { twinId } = req.params;
        const userId = req.user?.id;
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 10, 50);
        const offset = (page - 1) * limit;
        const dateFrom = req.query.dateFrom;
        const dateTo = req.query.dateTo;
        const search = req.query.search;
        const sortBy = req.query.sortBy || 'lastActivity';
        const userSortBy = req.query.userSortBy || 'lastActivity';
        const minMessages = req.query.minMessages ? parseInt(req.query.minMessages, 10) : undefined;
        const maxMessages = req.query.maxMessages ? parseInt(req.query.maxMessages, 10) : undefined;
        if (!userId) {
            throw errors_1.createError.unauthorized('Authentication required');
        }
        const twinResult = await database_1.db.query(`
      SELECT id, "publicHandle", "isPublic", "userId"
      FROM "Twin"
      WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);
        if (twinResult.rows.length === 0) {
            throw errors_1.createError.notFound('Twin not found or access denied', errors_1.ErrorCodes.TWIN_NOT_FOUND);
        }
        const twin = twinResult.rows[0];
        let whereConditions = ['pc."twinId" = $1', 'pc."userId" IS NOT NULL'];
        let params = [twinId];
        let paramIndex = 2;
        if (dateFrom) {
            whereConditions.push(`pc."createdAt" >= $${paramIndex}::timestamptz`);
            params.push(dateFrom);
            paramIndex++;
        }
        if (dateTo) {
            whereConditions.push(`pc."createdAt" <= $${paramIndex}::timestamptz`);
            params.push(dateTo);
            paramIndex++;
        }
        if (minMessages !== undefined && !isNaN(minMessages)) {
            whereConditions.push(`pc."messageCount" >= $${paramIndex}`);
            params.push(minMessages);
            paramIndex++;
        }
        if (maxMessages !== undefined && !isNaN(maxMessages)) {
            whereConditions.push(`pc."messageCount" <= $${paramIndex}`);
            params.push(maxMessages);
            paramIndex++;
        }
        let searchJoin = '';
        let searchCondition = '';
        if (search && search.trim()) {
            searchJoin = `
        INNER JOIN "PublicMessage" pm_search ON pc.id = pm_search."chatId"
      `;
            searchCondition = `AND pm_search.content ILIKE $${paramIndex}`;
            params.push(`%${search.trim()}%`);
            paramIndex++;
        }
        let userOrderByClause = '';
        switch (userSortBy) {
            case 'totalMessages':
                userOrderByClause = 'total_messages DESC';
                break;
            case 'totalChats':
                userOrderByClause = 'total_chats DESC';
                break;
            case 'lastActivity':
            default:
                userOrderByClause = 'last_activity DESC';
                break;
        }
        const usersResult = await database_1.db.query(`
      SELECT DISTINCT
        u.id as user_id,
        u.handle as user_handle,
        u.name as user_name,
        u."profileImage" as user_profile_image,
        COUNT(DISTINCT pc.id) as total_chats,
        SUM(pc."messageCount") as total_messages,
        MAX(COALESCE(pc."lastActivity", pc."createdAt")) as last_activity
      FROM "PublicChat" pc
      INNER JOIN "User" u ON pc."userId" = u.id
      ${searchJoin}
      WHERE ${whereConditions.join(' AND ')}
      ${searchCondition}
      GROUP BY u.id, u.handle, u.name, u."profileImage"
      ORDER BY ${userOrderByClause}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, [...params, limit, offset]);
        const totalUsersResult = await database_1.db.query(`
      SELECT COUNT(DISTINCT u.id) as total
      FROM "PublicChat" pc
      INNER JOIN "User" u ON pc."userId" = u.id
      ${searchJoin}
      WHERE ${whereConditions.join(' AND ')}
      ${searchCondition}
    `, params);
        const totalUsers = parseInt(totalUsersResult.rows[0]?.total || '0', 10);
        let chatOrderByClause = '';
        switch (sortBy) {
            case 'messageCount':
                chatOrderByClause = 'pc."messageCount" DESC';
                break;
            case 'createdAt':
                chatOrderByClause = 'pc."createdAt" DESC';
                break;
            case 'lastActivity':
            default:
                chatOrderByClause = 'COALESCE(pc."lastActivity", pc."createdAt") DESC';
                break;
        }
        const usersWithChats = await Promise.all(usersResult.rows.map(async (userRow) => {
            let chatWhereConditions = ['pc."twinId" = $1', 'pc."userId" = $2'];
            let chatParams = [twinId, userRow.user_id];
            let chatParamIndex = 3;
            if (dateFrom) {
                chatWhereConditions.push(`pc."createdAt" >= $${chatParamIndex}::timestamptz`);
                chatParams.push(dateFrom);
                chatParamIndex++;
            }
            if (dateTo) {
                chatWhereConditions.push(`pc."createdAt" <= $${chatParamIndex}::timestamptz`);
                chatParams.push(dateTo);
                chatParamIndex++;
            }
            if (minMessages !== undefined && !isNaN(minMessages)) {
                chatWhereConditions.push(`pc."messageCount" >= $${chatParamIndex}`);
                chatParams.push(minMessages);
                chatParamIndex++;
            }
            if (maxMessages !== undefined && !isNaN(maxMessages)) {
                chatWhereConditions.push(`pc."messageCount" <= $${chatParamIndex}`);
                chatParams.push(maxMessages);
                chatParamIndex++;
            }
            let chatSearchJoin = '';
            let chatSearchCondition = '';
            if (search && search.trim()) {
                chatSearchJoin = `
            INNER JOIN "PublicMessage" pm_chat_search ON pc.id = pm_chat_search."chatId"
          `;
                chatSearchCondition = `AND pm_chat_search.content ILIKE $${chatParamIndex}`;
                chatParams.push(`%${search.trim()}%`);
                chatParamIndex++;
            }
            const userChatsResult = await database_1.db.query(`
          SELECT DISTINCT
            pc.id,
            pc."messageCount",
            pc."title",
            pc."createdAt",
            pc."lastActivity",
            COALESCE(pc."lastActivity", pc."createdAt") as sort_date,
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
          ${chatSearchJoin}
          WHERE ${chatWhereConditions.join(' AND ')}
          ${chatSearchCondition}
          ORDER BY ${chatOrderByClause}
          LIMIT 10
        `, chatParams);
            return {
                user: {
                    id: userRow.user_id,
                    handle: userRow.user_handle,
                    name: userRow.user_name,
                    profileImage: userRow.user_profile_image
                },
                totalChats: parseInt(userRow.total_chats || '0', 10),
                totalMessages: parseInt(userRow.total_messages || '0', 10),
                lastActivity: (0, timestampUtils_1.normalizeTimestamp)(userRow.last_activity),
                chats: userChatsResult.rows.map(chat => ({
                    id: chat.id,
                    messageCount: chat.messageCount || 0,
                    title: chat.title || 'Untitled Chat',
                    createdAt: (0, timestampUtils_1.normalizeTimestamp)(chat.createdAt),
                    lastActivity: (0, timestampUtils_1.normalizeTimestamp)(chat.lastActivity),
                    lastMessage: chat.last_message_content ? {
                        content: chat.last_message_content,
                        createdAt: (0, timestampUtils_1.normalizeTimestamp)(chat.last_message_time),
                        relativeTime: (0, timestampUtils_1.formatRelativeTime)(chat.last_message_time)
                    } : null
                }))
            };
        }));
        res.json({
            success: true,
            users: usersWithChats,
            twin: {
                id: twin.id,
                publicHandle: twin.publicHandle
            },
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(totalUsers / limit),
                totalItems: totalUsers,
                itemsPerPage: limit
            },
            filters: {
                dateFrom,
                dateTo,
                search,
                sortBy,
                userSortBy,
                minMessages,
                maxMessages
            }
        });
    }
    catch (error) {
        (0, errorHandler_1.handleControllerError)(error, 'Failed to get user-wise public chats');
    }
};
exports.getUserWisePublicChats = getUserWisePublicChats;
const viewPublicChatHistory = async (req, res, next) => {
    try {
        const { chatId } = req.params;
        const userId = req.user?.id;
        if (!userId) {
            throw errors_1.createError.unauthorized('Authentication required');
        }
        const chatResult = await database_1.db.query(`
      SELECT 
        pc.id, 
        pc."twinId", 
        pc."visitorId", 
        pc."messageCount", 
        pc."userId",
        pc."title",
        pc."createdAt",
        pc."lastActivity",
        t."publicHandle", 
        t."sampleReply", 
        t."showChatHistory",
        t."userId" as twin_owner_id,
        u.id as user_id,
        u.handle as user_handle,
        u.name as user_name,
        u."profileImage" as user_profile_image
      FROM "PublicChat" pc
      LEFT JOIN "Twin" t ON pc."twinId" = t.id
      LEFT JOIN "User" u ON pc."userId" = u.id
      WHERE pc.id = $1
    `, [chatId]);
        if (chatResult.rows.length === 0) {
            throw errors_1.createError.notFound('Chat not found', errors_1.ErrorCodes.CHAT_NOT_FOUND);
        }
        const chat = chatResult.rows[0];
        const isTwinOwner = chat.twin_owner_id === userId;
        if (!isTwinOwner) {
            throw errors_1.createError.forbidden('Access denied. Only twin owner can view this chat.', errors_1.ErrorCodes.ACCESS_DENIED);
        }
        const messagesResult = await database_1.db.query(`
      SELECT id, content, sender, "createdAt"
      FROM "PublicMessage"
      WHERE "chatId" = $1
      ORDER BY "createdAt" ASC NULLS LAST
    `, [chatId]);
        res.json({
            success: true,
            chat: {
                id: chat.id,
                twinId: chat.twinId,
                twinHandle: chat.publicHandle,
                title: chat.title || 'Untitled Chat',
                messageCount: chat.messageCount || 0,
                createdAt: (0, timestampUtils_1.normalizeTimestamp)(chat.createdAt),
                lastActivity: (0, timestampUtils_1.normalizeTimestamp)(chat.lastActivity),
                user: chat.user_id ? {
                    id: chat.user_id,
                    handle: chat.user_handle,
                    name: chat.user_name,
                    profileImage: chat.user_profile_image
                } : null,
                isAnonymous: !chat.userId && !!chat.visitorId,
                visitorId: chat.visitorId
            },
            messages: messagesResult.rows.map(msg => ({
                id: msg.id,
                content: msg.content,
                sender: msg.sender,
                createdAt: (0, timestampUtils_1.normalizeTimestamp)(msg.createdAt),
                relativeTime: (0, timestampUtils_1.formatRelativeTime)(msg.createdAt)
            })),
            serverTime: new Date().toISOString()
        });
    }
    catch (error) {
        (0, errorHandler_1.handleControllerError)(error, 'Failed to get chat history');
    }
};
exports.viewPublicChatHistory = viewPublicChatHistory;
//# sourceMappingURL=publicChatController.js.map