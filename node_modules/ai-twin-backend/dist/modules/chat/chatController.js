"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendMessage = exports.generateDraft = exports.continueChat = exports.getChatMessages = exports.getUserChats = exports.getChat = exports.startChat = void 0;
const database_1 = require("../../config/database");
const twinService_1 = require("../twin/twinService");
const logger_1 = require("../../config/logger");
const zod_1 = require("zod");
const safety_1 = require("../../utils/safety");
const constants_1 = require("../../config/constants");
const eventLogger_1 = require("../../services/eventLogger");
const constants_2 = require("../../config/constants");
const twinService = new twinService_1.TwinService();
const startChatSchema = zod_1.z.object({
    twinId: zod_1.z.string().min(1, 'Twin ID is required'),
});
const sendMessageSchema = zod_1.z.object({
    content: zod_1.z.string().min(constants_1.MESSAGE_LIMITS.MIN_LENGTH, 'Message cannot be empty').max(constants_1.MESSAGE_LIMITS.MAX_LENGTH, 'Message too long (max 300 characters)'),
});
const generateDraftSchema = zod_1.z.object({
    messages: zod_1.z.array(zod_1.z.string()).min(1, 'At least one message required'),
});
const startChat = async (req, res) => {
    try {
        const { twinId } = startChatSchema.parse(req.body);
        if (!req.user) {
            res.status(401).json({ error: 'Authentication required' });
            return;
        }
        const twin = await database_1.twinQueries.findById(twinId);
        if (!twin || twin.userId !== req.user.id) {
            res.status(404).json({ error: 'Twin not found' });
            return;
        }
        const chat = await database_1.chatQueries.create(req.user.id, twinId);
        await (0, eventLogger_1.logEvent)(req.user.id, 'chat_started', { chatId: chat.id, twinId });
        res.json({
            success: true,
            chatId: chat.id,
            redirect: `/chat/${chat.id}`,
        });
    }
    catch (error) {
        logger_1.logger.error('Start chat error:', error);
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ error: 'Invalid input', details: error.errors });
            return;
        }
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.startChat = startChat;
const getChat = async (req, res) => {
    try {
        const { id } = req.params;
        if (!req.user) {
            res.status(401).json({ error: 'Authentication required' });
            return;
        }
        if (!id) {
            res.status(400).json({ error: 'Chat ID is required' });
            return;
        }
        const chatResult = await database_1.db.query(`
      SELECT c.*, t.id as "twinId", t."styleVector", t."sampleReply"
      FROM "Chat" c
      JOIN "Twin" t ON c."twinId" = t.id
      WHERE c.id = $1 AND c."userId" = $2
    `, [id, req.user.id]);
        if (chatResult.rows.length === 0) {
            res.status(404).json({ error: 'Chat not found' });
            return;
        }
        const chat = chatResult.rows[0];
        const messages = await database_1.messageQueries.findByChatId(id);
        res.json({
            chat: {
                id: chat.id,
                userId: chat.userId,
                twinId: chat.twinId,
                createdAt: chat.createdAt,
                twin: {
                    id: chat.twinId,
                    styleVector: JSON.parse(chat.styleVector),
                    sampleReply: chat.sampleReply
                },
                messages: messages
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Get chat error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getChat = getChat;
const getUserChats = async (req, res) => {
    try {
        if (!req.user) {
            res.status(401).json({ error: 'Authentication required' });
            return;
        }
        const chats = await database_1.db.query(`
      SELECT c.*, t.id as "twinId", t."sampleReply",
             (SELECT m.content FROM "Message" m WHERE m."chatId" = c.id ORDER BY m."createdAt" DESC LIMIT 1) as "lastMessage"
      FROM "Chat" c
      JOIN "Twin" t ON c."twinId" = t.id
      WHERE c."userId" = $1
      ORDER BY c."createdAt" DESC
    `, [req.user.id]);
        res.json({
            chats: chats.rows.map(chat => ({
                id: chat.id,
                twinId: chat.twinId,
                createdAt: chat.createdAt,
                twin: {
                    id: chat.twinId,
                    sampleReply: chat.sampleReply
                },
                lastMessage: chat.lastMessage
            }))
        });
    }
    catch (error) {
        logger_1.logger.error('Get chats error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getUserChats = getUserChats;
const getChatMessages = async (req, res) => {
    try {
        const { id } = req.params;
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        if (!id) {
            return res.status(400).json({ error: 'Chat ID is required' });
        }
        const chatResult = await database_1.db.query(`
      SELECT c.*, t.id as "twinId", t."styleVector", t."sampleReply"
      FROM "Chat" c
      JOIN "Twin" t ON c."twinId" = t.id
      WHERE c.id = $1 AND c."userId" = $2
    `, [id, req.user.id]);
        if (chatResult.rows.length === 0) {
            return res.status(404).json({ error: 'Chat not found' });
        }
        const chat = chatResult.rows[0];
        const messages = await database_1.messageQueries.findByChatId(id);
        res.json({
            success: true,
            chat: {
                id: chat.id,
                twinId: chat.twinId,
                twin: {
                    id: chat.twinId,
                    styleVector: JSON.parse(chat.styleVector),
                    sampleReply: chat.sampleReply
                },
                messages: messages,
                createdAt: chat.createdAt,
            },
        });
    }
    catch (error) {
        logger_1.logger.error('Get chat messages error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getChatMessages = getChatMessages;
const continueChat = async (req, res) => {
    try {
        const { twinId } = req.body;
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        if (!twinId) {
            return res.status(400).json({ error: 'Twin ID is required' });
        }
        const twin = await database_1.twinQueries.findById(twinId);
        if (!twin || twin.userId !== req.user.id) {
            return res.status(404).json({ error: 'Twin not found' });
        }
        const existingChatResult = await database_1.db.query(`
      SELECT c.*, 
             (SELECT m.content FROM "Message" m WHERE m."chatId" = c.id ORDER BY m."createdAt" DESC LIMIT 1) as "lastMessage"
      FROM "Chat" c
      WHERE c."userId" = $1 AND c."twinId" = $2
      ORDER BY c."createdAt" DESC
      LIMIT 1
    `, [req.user.id, twinId]);
        let chat;
        let isNewChat = false;
        if (existingChatResult.rows.length > 0) {
            chat = existingChatResult.rows[0];
        }
        else {
            chat = await database_1.chatQueries.create(req.user.id, twinId);
            isNewChat = true;
        }
        await (0, eventLogger_1.logEvent)(req.user.id, isNewChat ? 'chat_started' : 'chat_continued', { chatId: chat.id, twinId });
        res.json({
            success: true,
            chatId: chat.id,
            isNewChat: isNewChat,
            redirect: `/chat/${chat.id}`,
        });
    }
    catch (error) {
        logger_1.logger.error('Continue chat error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};
exports.continueChat = continueChat;
const generateDraft = async (req, res) => {
    try {
        const { messages } = generateDraftSchema.parse(req.body);
        const { id } = req.params;
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        if (!id) {
            return res.status(400).json({ error: 'Chat ID is required' });
        }
        for (const message of messages) {
            if (!(0, safety_1.validateMessageLength)(message)) {
                return res.status(400).json({ error: 'Message length invalid' });
            }
        }
        const chatResult = await database_1.db.query(`
      SELECT c.*, t.*
      FROM "Chat" c
      JOIN "Twin" t ON c."twinId" = t.id
      WHERE c.id = $1 AND c."userId" = $2
    `, [id, req.user.id]);
        if (chatResult.rows.length === 0) {
            return res.status(404).json({ error: 'Chat not found' });
        }
        const chat = chatResult.rows[0];
        const draft = await twinService.generateDraft(JSON.parse(chat.styleVector), messages);
        await (0, eventLogger_1.logEvent)(req.user.id, 'draft_generated', { chatId: chat.id, twinId: chat.twinId });
        res.json({ draft });
    }
    catch (error) {
        logger_1.logger.error('Generate draft error:', error);
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: 'Invalid input', details: error.errors });
        }
        return res.status(500).json({ error: 'Internal server error' });
    }
};
exports.generateDraft = generateDraft;
const sendMessage = async (req, res) => {
    try {
        const { content } = sendMessageSchema.parse(req.body);
        const { id } = req.params;
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        if (!(0, safety_1.validateMessageLength)(content)) {
            return res.status(400).json({ error: 'Message length invalid' });
        }
        if ((0, safety_1.checkBlacklist)(content)) {
            return res.status(400).json({ error: 'Message contains restricted content' });
        }
        if (!id) {
            return res.status(400).json({ error: 'Chat ID is required' });
        }
        const chatResult = await database_1.db.query(`
      SELECT c.*, t."twinId"
      FROM "Chat" c
      WHERE c.id = $1 AND c."userId" = $2
    `, [id, req.user.id]);
        if (chatResult.rows.length === 0) {
            return res.status(404).json({ error: 'Chat not found' });
        }
        const chat = chatResult.rows[0];
        const message = await database_1.messageQueries.create(chat.id, 'twin', content, true);
        await (0, eventLogger_1.logEvent)(req.user.id, 'message_approved', { chatId: chat.id, messageId: message.id });
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
        logger_1.logger.error('Send message error:', error);
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: 'Invalid input', details: error.errors });
        }
        return res.status(500).json({ error: 'Internal server error' });
    }
};
exports.sendMessage = sendMessage;
async function updateStyleVectorAfterChat(twinId, userId) {
    try {
        const twin = await database_1.twinQueries.findById(twinId);
        if (!twin) {
            logger_1.logger.warn('Twin not found for style vector update:', twinId);
            return;
        }
        const recentMessages = await database_1.db.query(`
      SELECT m.content, m.sender
      FROM "Message" m
      JOIN "Chat" c ON m."chatId" = c.id
      WHERE c."twinId" = $1
      ORDER BY m."createdAt" DESC
      LIMIT ${constants_2.QUERY_LIMITS.RECENT_ITEMS}
    `, [twinId]);
        const humanMessages = recentMessages.rows
            .filter(msg => msg.sender === 'human')
            .map(msg => msg.content);
        if (humanMessages.length === 0) {
            logger_1.logger.info('No human messages found for style vector update');
            return;
        }
        const currentStyleVector = JSON.parse(twin.styleVector);
        const updatedStyleVector = await twinService.updateStyleVector(currentStyleVector, humanMessages);
        await database_1.twinQueries.updateStyleVector(userId, updatedStyleVector);
        logger_1.logger.info('Style vector updated successfully for twin:', twinId);
    }
    catch (error) {
        logger_1.logger.error('Error updating style vector:', error);
    }
}
//# sourceMappingURL=chatController.js.map