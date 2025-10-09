"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendMessage = exports.generateDraft = exports.continueChat = exports.getChatMessages = exports.getChatHistory = exports.getUserChats = exports.getChat = exports.startChat = void 0;
const prisma_1 = require("../../config/prisma");
const twinService_1 = require("../twin/twinService");
const logger_1 = require("../../config/logger");
const zod_1 = require("zod");
const security_1 = require("../../middleware/security");
const database_1 = require("../../config/database");
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
const startChat = async (req, res) => {
    try {
        const { twinId } = startChatSchema.parse(req.body);
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const twin = await prisma_1.prisma.twin.findFirst({
            where: {
                id: twinId,
                userId: req.user.id,
            },
        });
        if (!twin) {
            return res.status(404).json({ error: 'Twin not found' });
        }
        const chat = await prisma_1.prisma.chat.create({
            data: {
                userId: req.user.id,
                twinId: twinId,
            },
        });
        await prisma_1.prisma.event.create({
            data: {
                userId: req.user.id,
                type: 'chat_started',
                meta: { chatId: chat.id, twinId },
            },
        });
        res.json({
            success: true,
            chatId: chat.id,
            redirect: `/chat/${chat.id}`,
        });
    }
    catch (error) {
        logger_1.logger.error('Start chat error:', error);
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: 'Invalid input', details: error.errors });
        }
        return res.status(500).json({ error: 'Internal server error' });
    }
};
exports.startChat = startChat;
const getChat = async (req, res) => {
    try {
        const { id } = req.params;
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        if (!id) {
            return res.status(400).json({ error: 'Chat ID is required' });
        }
        const chat = await prisma_1.prisma.chat.findFirst({
            where: {
                id: id,
                userId: req.user.id,
            },
            include: {
                twin: {
                    select: {
                        id: true,
                        styleVector: true,
                        sampleReply: true,
                    },
                },
                messages: {
                    orderBy: { createdAt: 'asc' },
                },
            },
        });
        if (!chat) {
            return res.status(404).json({ error: 'Chat not found' });
        }
        res.json({ chat });
    }
    catch (error) {
        logger_1.logger.error('Get chat error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getChat = getChat;
const getUserChats = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const chats = await prisma_1.prisma.chat.findMany({
            where: { userId: req.user.id },
            include: {
                twin: {
                    select: {
                        id: true,
                        sampleReply: true,
                    },
                },
                messages: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                },
            },
            orderBy: { createdAt: 'desc' },
        });
        res.json({ chats });
    }
    catch (error) {
        logger_1.logger.error('Get chats error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getUserChats = getUserChats;
const getChatHistory = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const chats = await prisma_1.prisma.chat.findMany({
            where: { userId: req.user.id },
            include: {
                twin: {
                    select: {
                        id: true,
                        sampleReply: true,
                    },
                },
                messages: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                },
                _count: {
                    select: {
                        messages: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
        const chatHistory = chats.map(chat => ({
            id: chat.id,
            twinId: chat.twinId,
            twin: chat.twin,
            messageCount: chat._count.messages,
            lastMessage: chat.messages[0] || null,
            createdAt: chat.createdAt,
            updatedAt: chat.messages[0]?.createdAt || chat.createdAt,
        }));
        res.json({
            success: true,
            chats: chatHistory,
            total: chatHistory.length
        });
    }
    catch (error) {
        logger_1.logger.error('Get chat history error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getChatHistory = getChatHistory;
const getChatMessages = async (req, res) => {
    try {
        const { id } = req.params;
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        if (!id) {
            return res.status(400).json({ error: 'Chat ID is required' });
        }
        const chat = await prisma_1.prisma.chat.findFirst({
            where: {
                id: id,
                userId: req.user.id,
            },
            include: {
                twin: {
                    select: {
                        id: true,
                        styleVector: true,
                        sampleReply: true,
                    },
                },
                messages: {
                    orderBy: { createdAt: 'asc' },
                },
            },
        });
        if (!chat) {
            return res.status(404).json({ error: 'Chat not found' });
        }
        res.json({
            success: true,
            chat: {
                id: chat.id,
                twinId: chat.twinId,
                twin: chat.twin,
                messages: chat.messages,
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
        const twin = await prisma_1.prisma.twin.findFirst({
            where: {
                id: twinId,
                userId: req.user.id,
            },
        });
        if (!twin) {
            return res.status(404).json({ error: 'Twin not found' });
        }
        const existingChat = await prisma_1.prisma.chat.findFirst({
            where: {
                userId: req.user.id,
                twinId: twinId,
            },
            orderBy: { createdAt: 'desc' },
            include: {
                messages: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                },
            },
        });
        let chat;
        if (existingChat) {
            chat = existingChat;
        }
        else {
            chat = await prisma_1.prisma.chat.create({
                data: {
                    userId: req.user.id,
                    twinId: twinId,
                },
            });
        }
        await prisma_1.prisma.event.create({
            data: {
                userId: req.user.id,
                type: existingChat ? 'chat_continued' : 'chat_started',
                meta: { chatId: chat.id, twinId },
            },
        });
        res.json({
            success: true,
            chatId: chat.id,
            isNewChat: !existingChat,
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
            if (!(0, security_1.validateMessageLength)(message)) {
                return res.status(400).json({ error: 'Message length invalid' });
            }
        }
        const chat = await prisma_1.prisma.chat.findFirst({
            where: {
                id: id,
                userId: req.user.id,
            },
            include: {
                twin: true,
            },
        });
        if (!chat) {
            return res.status(404).json({ error: 'Chat not found' });
        }
        const draft = await twinService.generateDraft(chat.twin.styleVector, messages);
        await prisma_1.prisma.event.create({
            data: {
                userId: req.user.id,
                type: 'draft_generated',
                meta: { chatId: chat.id, twinId: chat.twinId },
            },
        });
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
        if (!(0, security_1.validateMessageLength)(content)) {
            return res.status(400).json({ error: 'Message length invalid' });
        }
        if ((0, security_1.checkBlacklist)(content)) {
            return res.status(400).json({ error: 'Message contains restricted content' });
        }
        if (!id) {
            return res.status(400).json({ error: 'Chat ID is required' });
        }
        const chat = await prisma_1.prisma.chat.findFirst({
            where: {
                id: id,
                userId: req.user.id,
            },
        });
        if (!chat) {
            return res.status(404).json({ error: 'Chat not found' });
        }
        const message = await prisma_1.prisma.message.create({
            data: {
                chatId: chat.id,
                sender: 'twin',
                content,
                approved: true,
            },
        });
        await prisma_1.prisma.event.create({
            data: {
                userId: req.user.id,
                type: 'message_approved',
                meta: { chatId: chat.id, messageId: message.id },
            },
        });
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
        const recentMessages = await prisma_1.prisma.message.findMany({
            where: { chatId: twinId },
            orderBy: { createdAt: 'desc' },
            take: 10,
            select: { content: true, sender: true }
        });
        const humanMessages = recentMessages
            .filter(msg => msg.sender === 'human')
            .map(msg => msg.content);
        if (humanMessages.length === 0) {
            logger_1.logger.info('No human messages found for style vector update');
            return;
        }
        const currentStyleVector = twin.styleVector;
        const updatedStyleVector = await twinService.updateStyleVector(currentStyleVector, humanMessages);
        await database_1.twinQueries.updateStyleVector(userId, updatedStyleVector);
        logger_1.logger.info('Style vector updated successfully for twin:', twinId);
    }
    catch (error) {
        logger_1.logger.error('Error updating style vector:', error);
    }
}
//# sourceMappingURL=chatController.js.map