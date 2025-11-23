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
exports.getChatSummary = exports.generateChatTitle = exports.updateChatTitle = exports.createNewChat = exports.getChatHistory = void 0;
const zod_1 = require("zod");
const database_1 = require("../../config/database");
const logger_1 = require("../../config/logger");
const twinService_1 = require("../twin/twinService");
const errors_1 = require("../../utils/errors");
const twinService = new twinService_1.TwinService();
const createNewChatSchema = zod_1.z.object({
    twinId: zod_1.z.string().min(1, 'Twin ID is required')
});
const updateChatTitleSchema = zod_1.z.object({
    title: zod_1.z.string().min(1, 'Title is required').max(100, 'Title too long')
});
const generateTitleSchema = zod_1.z.object({
    firstMessage: zod_1.z.string().min(1, 'First message is required')
});
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
//# sourceMappingURL=chatManagementController.js.map