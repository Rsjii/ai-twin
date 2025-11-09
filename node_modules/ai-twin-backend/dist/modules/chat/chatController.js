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
exports.getChatSummary = exports.generateChatTitle = exports.updateChatTitle = exports.createNewChat = exports.deleteChat = exports.updateChatMetadata = exports.handleUserMessage = exports.sendMessage = exports.generateDraft = exports.continueChat = exports.getChatMessages = exports.getChatHistory = exports.getUserChats = exports.getChat = exports.startChat = void 0;
const database_1 = require("../../config/database");
const twinService_1 = require("../twin/twinService");
const logger_1 = require("../../config/logger");
const zod_1 = require("zod");
const safety_1 = require("../../utils/safety");
const errors_1 = require("../../utils/errors");
const chatUtils = __importStar(require("./chatSharedUtils"));
const twinService = new twinService_1.TwinService();
const startChatSchema = zod_1.z.object({
    twinId: zod_1.z.string().min(1, 'Twin ID is required'),
});
const sendMessageSchema = zod_1.z.object({
    content: zod_1.z.string().min(1, 'Message cannot be empty').max(300, 'Message too long (max 300 characters)'),
});
const generateDraftSchema = zod_1.z.object({
    messages: zod_1.z.array(zod_1.z.string()).min(1, 'At least one message required'),
});
const createNewChatSchema = zod_1.z.object({
    twinId: zod_1.z.string().min(1, 'Twin ID is required')
});
const updateChatTitleSchema = zod_1.z.object({
    title: zod_1.z.string().min(1, 'Title is required').max(100, 'Title too long')
});
const generateTitleSchema = zod_1.z.object({
    firstMessage: zod_1.z.string().min(1, 'First message is required')
});
const startChat = async (req, res, next) => {
    try {
        const { twinId } = startChatSchema.parse(req.body);
        if (!req.user) {
            throw errors_1.createError.unauthorized();
        }
        let twin;
        if (twinId === 'latest') {
            const twinResult = await database_1.db.query(`
        SELECT * FROM "Twin"
        WHERE "userId" = $1
        ORDER BY "createdAt" DESC
        LIMIT 1
      `, [req.user.id]);
            twin = twinResult.rows[0];
        }
        else {
            const twinResult = await database_1.db.query(`
        SELECT * FROM "Twin"
        WHERE id = $1 AND "userId" = $2
      `, [twinId, req.user.id]);
            twin = twinResult.rows[0];
        }
        if (!twin) {
            throw errors_1.createError.notFound('Twin not found', errors_1.ErrorCodes.TWIN_NOT_FOUND);
        }
        const chatId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const chatResult = await database_1.db.query(`
      INSERT INTO "Chat" (id, "userId", "twinId", "createdAt")
      VALUES ($1, $2, $3, NOW())
      RETURNING *
    `, [chatId, req.user.id, twin.id]);
        const chat = chatResult.rows[0];
        const eventId = `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await database_1.db.query(`
      INSERT INTO "Event" (id, "userId", type, meta, "createdAt")
      VALUES ($1, $2, $3, $4, NOW())
    `, [eventId, req.user.id, 'chat_started', JSON.stringify({ chatId: chat.id, twinId: twin.id })]);
        res.json({
            success: true,
            chatId: chat.id,
            redirect: `/chat/${chat.id}`,
        });
    }
    catch (error) {
        if (error instanceof errors_1.AppError) {
            throw error;
        }
        throw errors_1.createError.internal('Failed to start chat', error);
    }
};
exports.startChat = startChat;
const getChat = async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!req.user) {
            throw errors_1.createError.unauthorized();
        }
        if (!id) {
            throw errors_1.createError.validation('Chat ID is required');
        }
        const chatResult = await database_1.db.query(`
      SELECT c.id, c."userId", c."twinId", c."createdAt", c."chatVector",
             t.id as twin_id, t."styleVector", t."sampleReply"
      FROM "Chat" c
      JOIN "Twin" t ON c."twinId" = t.id
      WHERE c.id = $1 AND c."userId" = $2
    `, [id, req.user.id]);
        if (chatResult.rows.length === 0) {
            throw errors_1.createError.notFound('Chat not found', errors_1.ErrorCodes.CHAT_NOT_FOUND);
        }
        const chat = chatResult.rows[0];
        const messagesResult = await database_1.db.query(`
      SELECT id, "chatId", sender, content, approved, "createdAt"
      FROM "Message"
      WHERE "chatId" = $1
      ORDER BY "createdAt" ASC
    `, [id]);
        const chatData = {
            id: chat.id,
            userId: chat.userId,
            twinId: chat.twinId,
            createdAt: chat.createdAt,
            chatVector: chat.chatVector,
            twin: {
                id: chat.twin_id,
                styleVector: chat.styleVector,
                sampleReply: chat.sampleReply,
            },
            messages: messagesResult.rows
        };
        res.json({ chat: chatData });
    }
    catch (error) {
        if (error instanceof errors_1.AppError) {
            throw error;
        }
        throw errors_1.createError.internal('Failed to get chat', error);
    }
};
exports.getChat = getChat;
const getUserChats = async (req, res, next) => {
    try {
        if (!req.user) {
            throw errors_1.createError.unauthorized();
        }
        const chats = await database_1.db.query(`
      SELECT c.id, c."twinId", c."title", c."createdAt", c."updatedAt", c."messageCount",
             t.id as twin_id, t."sampleReply",
             m.content as last_message, m."createdAt" as last_message_time
      FROM "Chat" c
      JOIN "Twin" t ON c."twinId" = t.id
      LEFT JOIN LATERAL (
        SELECT content, "createdAt"
        FROM "Message" 
        WHERE "chatId" = c.id 
        ORDER BY "createdAt" DESC 
        LIMIT 1
      ) m ON true
      WHERE c."userId" = $1
      ORDER BY c."updatedAt" DESC, c."createdAt" DESC
    `, [req.user.id]);
        const formattedChats = chats.rows.map(chat => ({
            id: chat.id,
            twinId: chat.twinId,
            title: chat.title || null,
            createdAt: chat.createdAt,
            updatedAt: chat.updatedAt || chat.createdAt,
            messageCount: chat.messageCount || 0,
            lastMessage: chat.last_message || null,
            twin: {
                id: chat.twin_id,
                sampleReply: chat.sampleReply
            }
        }));
        res.json({ chats: formattedChats });
    }
    catch (error) {
        if (error instanceof errors_1.AppError) {
            throw error;
        }
        throw errors_1.createError.internal('Failed to get chats', error);
    }
};
exports.getUserChats = getUserChats;
const getChatHistory = async (req, res, next) => {
    try {
        if (!req.user) {
            throw errors_1.createError.unauthorized();
        }
        const userId = req.user.id;
        const page = parseInt(req.query['page']) || 1;
        const limit = Math.min(parseInt(req.query['limit']) || 50, 100);
        const offset = (page - 1) * limit;
        const chatsResult = await database_1.db.query(`
      SELECT 
        c.id,
        c."twinId",
        c."title",
        c."summary",
        c."lastMessage",
        c."messageCount",
        c."createdAt",
        c."updatedAt",
        t."sampleReply" as twinName
      FROM "Chat" c
      JOIN "Twin" t ON c."twinId" = t.id
      WHERE c."userId" = $1
      ORDER BY c."updatedAt" DESC, c."createdAt" DESC
      LIMIT $2 OFFSET $3
    `, [userId, limit, offset]);
        const totalResult = await database_1.db.query(`
      SELECT COUNT(*) as total
      FROM "Chat" c
      WHERE c."userId" = $1
    `, [userId]);
        const chats = chatsResult.rows.map(chat => ({
            id: chat.id,
            twinId: chat.twinId,
            title: chat.title || 'New Chat',
            summary: chat.summary || '',
            lastMessage: chat.lastMessage || '',
            messageCount: chat.messageCount || 0,
            createdAt: chat.createdAt,
            updatedAt: chat.updatedAt,
            twinName: chat.twinName || 'AI Twin'
        }));
        const total = parseInt(totalResult.rows[0]?.total || '0', 10);
        res.json({
            success: true,
            chats,
            total: total,
            page: page,
            limit: limit,
            totalPages: Math.ceil(total / limit)
        });
    }
    catch (error) {
        if (error instanceof errors_1.AppError) {
            throw error;
        }
        throw errors_1.createError.internal('Failed to get chat history', error);
    }
};
exports.getChatHistory = getChatHistory;
const getChatMessages = async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!req.user) {
            throw errors_1.createError.unauthorized();
        }
        if (!id) {
            throw errors_1.createError.validation('Chat ID is required');
        }
        const chatResult = await database_1.db.query(`
      SELECT c.id, c."userId", c."twinId", c."createdAt", c."chatVector",
             t.id as twin_id, t."styleVector", t."sampleReply"
      FROM "Chat" c
      JOIN "Twin" t ON c."twinId" = t.id
      WHERE c.id = $1 AND c."userId" = $2
    `, [id, req.user.id]);
        if (chatResult.rows.length === 0) {
            throw errors_1.createError.notFound('Chat not found', errors_1.ErrorCodes.CHAT_NOT_FOUND);
        }
        const chat = chatResult.rows[0];
        const messagesResult = await database_1.db.query(`
      SELECT id, "chatId", sender, content, approved, "createdAt"
      FROM "Message"
      WHERE "chatId" = $1 AND approved = true
      ORDER BY "createdAt" ASC
    `, [id]);
        res.json({
            success: true,
            chat: {
                id: chat.id,
                twinId: chat.twinId,
                chatVector: chat.chatVector,
                twin: {
                    id: chat.twin_id,
                    styleVector: chat.styleVector,
                    sampleReply: chat.sampleReply,
                },
                messages: messagesResult.rows,
                createdAt: chat.createdAt,
            },
        });
    }
    catch (error) {
        if (error instanceof errors_1.AppError) {
            throw error;
        }
        throw errors_1.createError.internal('Failed to get chat messages', error);
    }
};
exports.getChatMessages = getChatMessages;
const continueChat = async (req, res, next) => {
    try {
        const { twinId } = req.body;
        if (!req.user) {
            throw errors_1.createError.unauthorized();
        }
        if (!twinId) {
            throw errors_1.createError.validation('Twin ID is required');
        }
        let twin;
        if (twinId === 'latest') {
            const twinResult = await database_1.db.query(`
        SELECT id, "userId"
        FROM "Twin"
        WHERE "userId" = $1
        ORDER BY "createdAt" DESC
        LIMIT 1
      `, [req.user.id]);
            twin = twinResult.rows[0];
        }
        else {
            const twinResult = await database_1.db.query(`
        SELECT id, "userId"
        FROM "Twin"
        WHERE id = $1 AND "userId" = $2
      `, [twinId, req.user.id]);
            twin = twinResult.rows[0];
        }
        if (!twin) {
            throw errors_1.createError.notFound('Twin not found', errors_1.ErrorCodes.TWIN_NOT_FOUND);
        }
        const existingChatResult = await database_1.db.query(`
      SELECT c.id, c."userId", c."twinId", c."createdAt", c."chatVector"
      FROM "Chat" c
      WHERE c."userId" = $1 AND c."twinId" = $2
      ORDER BY c."createdAt" DESC
      LIMIT 1
    `, [req.user.id, twin.id]);
        let chat;
        let existingChat = null;
        if (existingChatResult.rows.length > 0) {
            existingChat = existingChatResult.rows[0];
            chat = existingChat;
        }
        else {
            const newChatResult = await database_1.db.query(`
        INSERT INTO "Chat" ("id", "userId", "twinId", "createdAt")
        VALUES ($1, $2, $3, NOW())
        RETURNING id, "userId", "twinId", "createdAt"
      `, [
                `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                req.user.id,
                twin.id
            ]);
            chat = newChatResult.rows[0];
        }
        await database_1.db.query(`
      INSERT INTO "Event" ("id", "userId", "type", "meta", "createdAt")
      VALUES ($1, $2, $3, $4, NOW())
    `, [
            `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            req.user.id,
            existingChat ? 'chat_continued' : 'chat_started',
            JSON.stringify({ chatId: chat.id, twinId: twin.id })
        ]);
        res.json({
            success: true,
            chatId: chat.id,
            isNewChat: !existingChat,
            redirect: `/chat/${chat.id}`,
        });
    }
    catch (error) {
        if (error instanceof errors_1.AppError) {
            throw error;
        }
        throw errors_1.createError.internal('Failed to continue chat', error);
    }
};
exports.continueChat = continueChat;
const generateDraft = async (req, res, next) => {
    try {
        const { messages } = generateDraftSchema.parse(req.body);
        const { id } = req.params;
        if (!req.user) {
            throw errors_1.createError.unauthorized();
        }
        if (!id) {
            throw errors_1.createError.validation('Chat ID is required');
        }
        for (const message of messages) {
            if (!(0, safety_1.validateMessageLength)(message)) {
                throw errors_1.createError.validation('Message length invalid');
            }
        }
        const chatResult = await database_1.db.query(`
      SELECT c.id, c."userId", c."twinId", c."createdAt", c."chatVector",
             t.id as twin_id, t."styleVector", t."sampleReply", t."personaData", t."systemPrompt", t."tokenLimit"
      FROM "Chat" c
      JOIN "Twin" t ON c."twinId" = t.id
      WHERE c.id = $1 AND c."userId" = $2
    `, [id, req.user.id]);
        if (chatResult.rows.length === 0) {
            throw errors_1.createError.notFound('Chat not found', errors_1.ErrorCodes.CHAT_NOT_FOUND);
        }
        const chat = chatResult.rows[0];
        const chatMessagesResult = await database_1.db.query(`
      SELECT content, sender, "createdAt"
      FROM "Message"
      WHERE "chatId" = $1
      ORDER BY "createdAt" ASC
    `, [chat.id]);
        const chatMessages = chatMessagesResult.rows;
        const context = {
            styleVector: chat.styleVector,
            personaData: chat.personaData,
            systemPrompt: chat.systemPrompt,
            tokenLimit: chat.tokenLimit,
            chatVector: chat.chatVector,
            chatMemory: chatMessages.map(msg => ({
                content: msg.content,
                sender: msg.sender,
                timestamp: msg.createdAt
            })),
            currentMessages: messages,
            twinId: chat.twinId
        };
        const draftResult = await twinService.generateDraftWithContext(context);
        const draft = typeof draftResult === 'object' && draftResult.response
            ? draftResult.response
            : (typeof draftResult === 'string' ? draftResult : '');
        await database_1.db.query(`
      INSERT INTO "Event" ("id", "userId", "type", "meta", "createdAt")
      VALUES ($1, $2, $3, $4, NOW())
    `, [
            `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            req.user.id,
            'draft_generated',
            JSON.stringify({ chatId: chat.id, twinId: chat.twinId })
        ]);
        res.json({ draft });
    }
    catch (error) {
        if (error instanceof errors_1.AppError) {
            throw error;
        }
        throw errors_1.createError.internal('Failed to generate draft', error);
    }
};
exports.generateDraft = generateDraft;
const sendMessage = async (req, res, next) => {
    try {
        const { content } = sendMessageSchema.parse(req.body);
        const { id } = req.params;
        if (!req.user) {
            throw errors_1.createError.unauthorized();
        }
        if (!(0, safety_1.validateMessageLength)(content)) {
            throw errors_1.createError.validation('Message length invalid');
        }
        if ((0, safety_1.checkBlacklist)(content)) {
            throw errors_1.createError.validation('Message contains restricted content');
        }
        if (!id) {
            throw errors_1.createError.validation('Chat ID is required');
        }
        const chatResult = await database_1.db.query(`
      SELECT id, "userId", "twinId"
      FROM "Chat"
      WHERE id = $1 AND "userId" = $2
    `, [id, req.user.id]);
        if (chatResult.rows.length === 0) {
            throw errors_1.createError.notFound('Chat not found', errors_1.ErrorCodes.CHAT_NOT_FOUND);
        }
        const chat = chatResult.rows[0];
        const messageResult = await database_1.db.query(`
      INSERT INTO "Message" ("id", "chatId", sender, content, approved, "createdAt")
      VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING id, "chatId", sender, content, approved, "createdAt"
    `, [
            `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            chat.id,
            'twin',
            content,
            true
        ]);
        const message = messageResult.rows[0];
        await database_1.db.query(`
      INSERT INTO "Event" ("id", "userId", "type", "meta", "createdAt")
      VALUES ($1, $2, $3, $4, NOW())
    `, [
            `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            req.user.id,
            'message_approved',
            JSON.stringify({ chatId: chat.id, messageId: message.id })
        ]);
        updateStyleVectorAfterChat(chat.twinId, req.user.id).catch(error => {
            logger_1.logger.error('Style vector update failed:', error);
        });
        res.json({
            success: true,
            message: {
                id: message.id,
                content: message.content,
                sender: message.sender,
                createdAt: message.createdAt,
            },
        });
    }
    catch (error) {
        if (error instanceof errors_1.AppError) {
            throw error;
        }
        throw errors_1.createError.internal('Failed to send message', error);
    }
};
exports.sendMessage = sendMessage;
const handleUserMessage = async (req, res, next) => {
    try {
        const { message } = req.body;
        const { id } = req.params;
        if (!req.user) {
            throw errors_1.createError.unauthorized();
        }
        chatUtils.validateMessage(message);
        if (!id) {
            throw errors_1.createError.validation('Chat ID is required');
        }
        const chatResult = await database_1.db.query(`
      SELECT c.id, c."userId", c."twinId", c."createdAt", c."chatVector",
             t.id as twin_id, t."styleVector", t."sampleReply", t."instructions", 
             t."personaData", t."systemPrompt", t."tokenLimit"
      FROM "Chat" c
      JOIN "Twin" t ON c."twinId" = t.id
      WHERE c.id = $1 AND c."userId" = $2
    `, [id, req.user.id]);
        let chat;
        if (chatResult.rows.length === 0) {
            logger_1.logger.info('Chat not found, creating new chat for user:', { chatId: id, userId: req.user.id });
            const twinResult = await database_1.db.query(`
        SELECT id, "styleVector", "sampleReply", "instructions", "personaData", "systemPrompt", "tokenLimit"
        FROM "Twin"
        WHERE "userId" = $1
        ORDER BY "createdAt" DESC
        LIMIT 1
      `, [req.user.id]);
            if (twinResult.rows.length === 0) {
                logger_1.logger.error('No twin found for user:', req.user.id);
                throw errors_1.createError.notFound('No twin found. Please create a twin first.', errors_1.ErrorCodes.TWIN_NOT_FOUND);
            }
            const twin = twinResult.rows[0];
            logger_1.logger.info('Found twin for new chat:', twin.id);
            const newChatResult = await database_1.db.query(`
        INSERT INTO "Chat" ("id", "userId", "twinId", "createdAt")
        VALUES ($1, $2, $3, NOW())
        RETURNING id, "userId", "twinId", "createdAt"
      `, [id, req.user.id, twin.id]);
            if (newChatResult.rows.length === 0) {
                logger_1.logger.error('Failed to create new chat');
                throw errors_1.createError.internal('Failed to create chat');
            }
            const newChat = newChatResult.rows[0];
            logger_1.logger.info('New chat created:', newChat.id);
            try {
                await database_1.db.query(`
          INSERT INTO "Event" ("id", "userId", "type", "meta", "createdAt")
          VALUES ($1, $2, $3, $4, NOW())
        `, [
                    `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    req.user.id,
                    'chat_started',
                    JSON.stringify({ chatId: newChat.id, twinId: twin.id })
                ]);
                logger_1.logger.info('Chat started event logged');
            }
            catch (error) {
                logger_1.logger.error('Failed to log chat started event:', error);
            }
            chatResult.rows = [{
                    id: newChat.id,
                    userId: newChat.userId,
                    twinId: newChat.twinId,
                    createdAt: newChat.createdAt,
                    chatVector: null,
                    twin_id: twin.id,
                    styleVector: twin.styleVector,
                    sampleReply: twin.sampleReply,
                    instructions: twin.instructions,
                    personaData: twin.personaData,
                    systemPrompt: twin.systemPrompt,
                    tokenLimit: twin.tokenLimit
                }];
        }
        chat = chatResult.rows[0];
        logger_1.logger.info('Chat found:', {
            chatId: chat.id,
            twinId: chat.twinId,
            userId: chat.userId,
            styleVector: chat.styleVector
        });
        const moderation = await chatUtils.checkModerationAndApprove(message, chat.twinId, req.user.id);
        if (!moderation.approved) {
            logger_1.logger.warn('Message rejected by moderation:', {
                message: message.substring(0, 50),
                reasons: moderation.moderationResult.reasons,
                userId: req.user.id,
                chatId: chat.id
            });
            return res.status(400).json(chatUtils.getModerationRejectionResponse(moderation.moderationResult));
        }
        const [isFirstMessage, currentTitle] = await Promise.all([
            chatUtils.checkFirstMessage(chat.id, 'Message'),
            chatUtils.getChatTitle(chat.id, 'Chat')
        ]);
        const shouldGenerateTitle = isFirstMessage && (!currentTitle || currentTitle === 'New Chat' || currentTitle === '' || currentTitle === null);
        const [sessionMemory, recentMessages] = await Promise.all([
            chatUtils.getSessionMemoryForContext(chat.id).catch(() => null),
            chatUtils.getRecentMessages(chat.id, 'Message', 10)
        ]);
        const requestId = chatUtils.createRequestId(req.user.id);
        const duplicateCheck = await chatUtils.checkDuplicateRequest(chat.id, requestId, 'Message');
        if (duplicateCheck.isDuplicate) {
            logger_1.logger.info('Duplicate requestId detected:', requestId);
            return res.json({
                success: true,
                duplicate: true,
                message: 'Message already sent.',
                userMessage: {
                    id: duplicateCheck.existingMessage.id,
                    content: duplicateCheck.existingMessage.content,
                    sender: duplicateCheck.existingMessage.sender,
                    createdAt: duplicateCheck.existingMessage.createdAt,
                },
                aiMessage: null
            });
        }
        const context = chatUtils.buildChatContext({
            styleVector: chat.styleVector,
            personaData: chat.personaData,
            systemPrompt: chat.systemPrompt,
            tokenLimit: chat.tokenLimit,
            chatMemory: recentMessages.map(msg => ({
                content: msg.content,
                sender: msg.sender,
                timestamp: msg.createdAt
            })),
            currentMessages: [message.trim()],
            twinId: chat.twinId,
            isFirstMessage: shouldGenerateTitle,
            chatVector: chat.chatVector,
            sessionMemory: sessionMemory
        });
        const { aiResponse, generatedTitle } = await chatUtils.generateAIResponse(context);
        const userMessage = await chatUtils.saveUserMessage({
            chatId: chat.id,
            message,
            approved: moderation.approved,
            requestId,
            messageTable: 'Message',
            messageIdPrefix: 'msg'
        });
        const aiMessage = await chatUtils.saveAIMessage({
            chatId: chat.id,
            aiResponse,
            messageTable: 'Message',
            messageIdPrefix: 'msg'
        });
        res.json({
            success: true,
            response: aiResponse,
            generatedTitle: generatedTitle || null,
            isFirstMessage: isFirstMessage,
            userMessage: {
                id: userMessage.id,
                content: userMessage.content,
                sender: userMessage.sender,
                createdAt: userMessage.createdAt,
            },
            aiMessage: {
                id: aiMessage.id,
                content: aiMessage.content,
                sender: aiMessage.sender,
                createdAt: aiMessage.createdAt,
            },
        });
        (async () => {
            try {
                const userId = req.user?.id;
                if (!userId)
                    return;
                await Promise.all([
                    chatUtils.updateChatMetadata({
                        chatId: chat.id,
                        chatTable: 'Chat',
                        generatedTitle,
                        isFirstMessage,
                        currentTitle,
                        userMessage: message,
                        aiResponse,
                        lastMessageField: 'lastMessage',
                        updatedAtField: 'updatedAt'
                    }),
                    database_1.db.query(`
            INSERT INTO "Event" ("id", "userId", "type", "meta", "createdAt")
            VALUES ($1, $2, $3, $4, NOW())
          `, [
                        `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                        userId,
                        'chat_message',
                        JSON.stringify({
                            chatId: chat.id,
                            twinId: chat.twinId,
                            userMessageId: userMessage.id,
                            aiMessageId: aiMessage.id
                        })
                    ]).catch(err => logger_1.logger.warn('Event logging failed:', err)),
                    updateStyleVectorAfterChat(chat.twinId, userId).catch(err => logger_1.logger.warn('Style vector update failed:', err)),
                    updateChatVectorAfterMessage(chat.id, [userMessage, aiMessage]).catch(err => logger_1.logger.warn('Chat vector update failed:', err))
                ]);
                await chatUtils.updateSessionMemory(chat.id, chat.twinId);
            }
            catch (error) {
                logger_1.logger.error('Post-response cleanup failed:', error);
            }
        })();
    }
    catch (error) {
        if (error instanceof errors_1.AppError) {
            throw error;
        }
        throw errors_1.createError.internal('Failed to handle user message', error);
    }
};
exports.handleUserMessage = handleUserMessage;
const updateChatMetadata = async (chatId, message, sender) => {
    logger_1.logger.warn('updateChatMetadata called but is deprecated. Title generation handled in handleUserMessage.');
    return;
};
exports.updateChatMetadata = updateChatMetadata;
async function updateStyleVectorAfterChat(twinId, userId) {
    try {
        logger_1.logger.info('Starting style vector update for twin:', twinId);
        const twinResult = await database_1.db.query(`
      SELECT id, "styleVector"
      FROM "Twin"
      WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);
        if (twinResult.rows.length === 0) {
            logger_1.logger.warn('Twin not found for style vector update:', twinId);
            return;
        }
        const twin = twinResult.rows[0];
        logger_1.logger.info('Found twin for style vector update:', twin.id);
        const recentMessagesResult = await database_1.db.query(`
      SELECT m.content, m.sender
      FROM "Message" m
      JOIN "Chat" c ON m."chatId" = c.id
      WHERE c."twinId" = $1 AND c."userId" = $2
      ORDER BY m."createdAt" DESC
      LIMIT 10
    `, [twinId, userId]);
        const recentMessages = recentMessagesResult.rows;
        logger_1.logger.info('Found recent messages:', recentMessages.length);
        const humanMessages = recentMessages
            .filter(msg => msg.sender === 'human')
            .map(msg => msg.content);
        if (humanMessages.length === 0) {
            logger_1.logger.info('No human messages found for style vector update');
            return;
        }
        logger_1.logger.info('Human messages for style analysis:', humanMessages.length);
        const currentStyleVector = twin.styleVector;
        logger_1.logger.info('Current style vector:', JSON.stringify(currentStyleVector, null, 2));
        const updatedStyleVector = await twinService.updateStyleVector(currentStyleVector, humanMessages);
        logger_1.logger.info('Updated style vector:', JSON.stringify(updatedStyleVector, null, 2));
        await database_1.db.query(`
      UPDATE "Twin"
      SET "styleVector" = $1
      WHERE id = $2
    `, [JSON.stringify(updatedStyleVector), twinId]);
        logger_1.logger.info('Style vector updated successfully for twin:', twinId);
    }
    catch (error) {
        logger_1.logger.error('Error updating style vector:', error);
    }
}
async function updateChatVectorAfterMessage(chatId, newMessages) {
    try {
        logger_1.logger.info('Starting chat vector update for chat:', chatId);
        const chatResult = await database_1.db.query(`
      SELECT "chatVector"
      FROM "Chat"
      WHERE id = $1
    `, [chatId]);
        if (chatResult.rows.length === 0) {
            logger_1.logger.warn('Chat not found for chat vector update:', chatId);
            return;
        }
        const currentChatVector = chatResult.rows[0].chatVector;
        const allMessagesResult = await database_1.db.query(`
      SELECT content, sender, "createdAt"
      FROM "Message"
      WHERE "chatId" = $1
      ORDER BY "createdAt" ASC
    `, [chatId]);
        const allMessages = allMessagesResult.rows.map(msg => ({
            content: msg.content,
            sender: msg.sender,
            timestamp: msg.createdAt
        }));
        let updatedChatVector;
        if (currentChatVector) {
            const newMessagesWithTimestamp = newMessages.map(msg => ({
                content: msg.content,
                sender: msg.sender,
                timestamp: msg.createdAt
            }));
            updatedChatVector = await twinService.updateChatVector(currentChatVector, newMessagesWithTimestamp);
        }
        else {
            updatedChatVector = await twinService.generateChatVector(allMessages);
        }
        await database_1.db.query(`
      UPDATE "Chat"
      SET "chatVector" = $1, "updatedAt" = NOW()
      WHERE id = $2
    `, [JSON.stringify(updatedChatVector), chatId]);
        logger_1.logger.info('Chat vector updated successfully for chat:', chatId);
    }
    catch (error) {
        logger_1.logger.error('Error updating chat vector:', error);
    }
}
const deleteChat = async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!req.user) {
            throw errors_1.createError.unauthorized();
        }
        if (!id) {
            throw errors_1.createError.validation('Chat ID is required');
        }
        const chatResult = await database_1.db.query(`
      SELECT id, "userId" FROM "Chat" WHERE id = $1
    `, [id]);
        if (chatResult.rows.length === 0) {
            throw errors_1.createError.notFound('Chat not found', errors_1.ErrorCodes.CHAT_NOT_FOUND);
        }
        const chat = chatResult.rows[0];
        if (chat.userId !== req.user.id) {
            throw errors_1.createError.unauthorized('You do not have permission to delete this chat');
        }
        await database_1.db.query(`
      DELETE FROM "Chat" WHERE id = $1
    `, [id]);
        try {
            const eventId = `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            await database_1.db.query(`
        INSERT INTO "Event" (id, "userId", type, meta, "createdAt")
        VALUES ($1, $2, $3, $4, NOW())
      `, [eventId, req.user.id, 'chat_deleted', JSON.stringify({ chatId: id })]);
        }
        catch (error) {
            logger_1.logger.warn('Failed to log chat deletion event:', error);
        }
        logger_1.logger.info('Chat deleted successfully:', { chatId: id, userId: req.user.id });
        res.json({
            success: true,
            message: 'Chat deleted successfully'
        });
    }
    catch (error) {
        if (error instanceof errors_1.AppError) {
            throw error;
        }
        throw errors_1.createError.internal('Failed to delete chat', error);
    }
};
exports.deleteChat = deleteChat;
const createNewChat = async (req, res, next) => {
    try {
        if (!req.user) {
            throw errors_1.createError.unauthorized();
        }
        const { twinId } = createNewChatSchema.parse(req.body);
        const userId = req.user.id;
        const twinResult = await database_1.db.query(`
      SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);
        if (twinResult.rows.length === 0) {
            throw errors_1.createError.notFound('Twin not found', errors_1.ErrorCodes.TWIN_NOT_FOUND);
        }
        const chatId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const chatResult = await database_1.db.query(`
      INSERT INTO "Chat" (id, "userId", "twinId", "title", "messageCount", "createdAt", "updatedAt")
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      RETURNING id, "twinId", "title", "messageCount", "createdAt"
    `, [chatId, userId, twinId, 'New Chat', 0]);
        const chat = chatResult.rows[0];
        await database_1.db.query(`
      INSERT INTO "Event" (id, "userId", type, meta, "createdAt")
      VALUES ($1, $2, $3, $4, NOW())
    `, [
            `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            userId,
            'chat_created',
            JSON.stringify({ chatId: chat.id, twinId: chat.twinId })
        ]);
        res.json({
            success: true,
            chat: {
                id: chat.id,
                twinId: chat.twinId,
                title: chat.title,
                messageCount: chat.messageCount,
                createdAt: chat.createdAt
            },
            redirect: `/chat-enhanced?chatId=${chat.id}`
        });
    }
    catch (error) {
        if (error instanceof errors_1.AppError) {
            throw error;
        }
        throw errors_1.createError.internal('Failed to create new chat', error);
    }
};
exports.createNewChat = createNewChat;
const updateChatTitle = async (req, res, next) => {
    try {
        if (!req.user) {
            throw errors_1.createError.unauthorized();
        }
        const { id: chatId } = req.params;
        const { title } = updateChatTitleSchema.parse(req.body);
        const userId = req.user.id;
        const chatResult = await database_1.db.query(`
      SELECT id FROM "Chat" WHERE id = $1 AND "userId" = $2
    `, [chatId, userId]);
        if (chatResult.rows.length === 0) {
            throw errors_1.createError.notFound('Chat not found', errors_1.ErrorCodes.CHAT_NOT_FOUND);
        }
        await database_1.db.query(`
      UPDATE "Chat" SET "title" = $1, "updatedAt" = NOW() WHERE id = $2
    `, [title, chatId]);
        res.json({
            success: true,
            message: 'Chat title updated successfully'
        });
    }
    catch (error) {
        if (error instanceof errors_1.AppError) {
            throw error;
        }
        throw errors_1.createError.internal('Failed to update chat title', error);
    }
};
exports.updateChatTitle = updateChatTitle;
const generateChatTitle = async (req, res, next) => {
    try {
        if (!req.user) {
            throw errors_1.createError.unauthorized();
        }
        const { id: chatId } = req.params;
        const { firstMessage } = generateTitleSchema.parse(req.body);
        const userId = req.user.id;
        const chatResult = await database_1.db.query(`
      SELECT id FROM "Chat" WHERE id = $1 AND "userId" = $2
    `, [chatId, userId]);
        if (chatResult.rows.length === 0) {
            throw errors_1.createError.notFound('Chat not found', errors_1.ErrorCodes.CHAT_NOT_FOUND);
        }
        const title = await generateTitleFromMessage(firstMessage);
        await database_1.db.query(`
      UPDATE "Chat" SET "title" = $1, "updatedAt" = NOW() WHERE id = $2
    `, [title, chatId]);
        res.json({
            success: true,
            title,
            message: 'Chat title generated successfully'
        });
    }
    catch (error) {
        if (error instanceof errors_1.AppError) {
            throw error;
        }
        throw errors_1.createError.internal('Failed to generate chat title', error);
    }
};
exports.generateChatTitle = generateChatTitle;
const getChatSummary = async (req, res, next) => {
    try {
        if (!req.user) {
            throw errors_1.createError.unauthorized();
        }
        const { id: chatId } = req.params;
        const userId = req.user.id;
        const chatResult = await database_1.db.query(`
      SELECT id, "summary" FROM "Chat" WHERE id = $1 AND "userId" = $2
    `, [chatId, userId]);
        if (chatResult.rows.length === 0) {
            throw errors_1.createError.notFound('Chat not found', errors_1.ErrorCodes.CHAT_NOT_FOUND);
        }
        const chat = chatResult.rows[0];
        res.json({
            success: true,
            summary: chat.summary || 'No summary available'
        });
    }
    catch (error) {
        if (error instanceof errors_1.AppError) {
            throw error;
        }
        throw errors_1.createError.internal('Failed to get chat summary', error);
    }
};
exports.getChatSummary = getChatSummary;
async function generateTitleFromMessage(message) {
    try {
        const { OpenAI } = await Promise.resolve().then(() => __importStar(require('openai')));
        const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });
        const completion = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [{
                    role: 'system',
                    content: `Generate a short, descriptive title (max 30 characters) for a chat that starts with: "${message}"`
                }],
            max_tokens: 20,
            temperature: 0.3
        });
        const title = completion.choices[0]?.message?.content?.trim() || 'New Chat';
        return title.length > 30 ? title.substring(0, 30) + '...' : title;
    }
    catch (error) {
        logger_1.logger.error('AI title generation failed:', error);
        return message.length > 30 ? message.substring(0, 30) + '...' : message;
    }
}
//# sourceMappingURL=chatController.js.map