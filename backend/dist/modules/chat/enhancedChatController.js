"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteMessagesAfter = exports.addToAnchors = exports.applyStyleCorrection = exports.getChatHistory = exports.generateEnhancedReply = void 0;
const zod_1 = require("zod");
const database_1 = require("../../config/database");
const logger_1 = require("../../config/logger");
const twinService_1 = require("../twin/twinService");
const intentClassification_1 = require("../../utils/intentClassification");
const errors_1 = require("../../utils/errors");
const idGenerator_1 = require("../../utils/idGenerator");
const errorHandler_1 = require("../../utils/errorHandler");
const timestampUtils_1 = require("../../utils/timestampUtils");
const twinService = new twinService_1.TwinService();
const generateReplySchema = zod_1.z.object({
    message: zod_1.z.string().min(1).max(1000),
    strictStyle: zod_1.z.boolean().optional().default(false),
    regenerate: zod_1.z.boolean().optional().default(false),
    regenerateMessageId: zod_1.z.string().optional()
});
const styleCorrectionSchema = zod_1.z.object({
    knob: zod_1.z.enum(['shorter', 'casual', 'emoji_off', 'punchline', 'formal', 'humor', 'question_freq']),
    delta: zod_1.z.number().int().min(-1).max(1)
});
const generateEnhancedReply = async (req, res, next) => {
    try {
        const { message, strictStyle, regenerate, regenerateMessageId } = generateReplySchema.parse(req.body);
        const { id: chatId } = req.params;
        const userId = req.user.id;
        logger_1.logger.info('🚀 Enhanced reply request:', { chatId, userId, message, regenerate, regenerateMessageId });
        const chatResult = await database_1.db.query(`
      SELECT c.id, c."userId", c."twinId", c."createdAt",
             t.id as twin_id, t."styleVector", t."sampleReply", t."personaData", t."systemPrompt", t."tokenLimit"
      FROM "Chat" c
      JOIN "Twin" t ON c."twinId" = t.id
      WHERE c.id = $1 AND c."userId" = $2
    `, [chatId, userId]);
        if (chatResult.rows.length === 0) {
            throw errors_1.createError.notFound('Chat not found', errors_1.ErrorCodes.CHAT_NOT_FOUND);
        }
        const chat = chatResult.rows[0];
        logger_1.logger.info('✅ Chat found:', chat.id);
        if (regenerate) {
            let messageToDeleteTime = null;
            if (regenerateMessageId) {
                const messageResult = await database_1.db.query(`
          SELECT id, "createdAt" 
          FROM "Message" 
          WHERE id = $1 AND "chatId" = $2 AND sender = 'twin'
        `, [regenerateMessageId, chatId]);
                if (messageResult.rows.length > 0) {
                    messageToDeleteTime = messageResult.rows[0].createdAt;
                }
            }
            else {
                const lastAIResponseResult = await database_1.db.query(`
          SELECT id, "createdAt" 
          FROM "Message" 
          WHERE "chatId" = $1 AND sender = 'twin'
          ORDER BY "createdAt" DESC 
          LIMIT 1
        `, [chatId]);
                if (lastAIResponseResult.rows.length > 0) {
                    messageToDeleteTime = lastAIResponseResult.rows[0].createdAt;
                }
            }
            if (messageToDeleteTime) {
                const deleteResult = await database_1.db.query(`
          DELETE FROM "Message" 
          WHERE "chatId" = $1 AND "createdAt" >= $2
          RETURNING id
        `, [chatId, messageToDeleteTime]);
                logger_1.logger.info(`🗑️ Deleted ${deleteResult.rows.length} messages during regeneration (from ${messageToDeleteTime})`);
                await database_1.db.query(`
          UPDATE "Chat" 
          SET "messageCount" = (
            SELECT COUNT(*) FROM "Message" WHERE "chatId" = $1
          )
          WHERE id = $1
        `, [chatId]);
            }
            else {
                logger_1.logger.warn('⚠️ Could not find message to delete during regeneration');
            }
        }
        let isFirstMessage = false;
        let currentTitle = null;
        try {
            const titleCheckResult = await database_1.db.query(`
        SELECT "title", "messageCount" FROM "Chat" WHERE id = $1
      `, [chatId]);
            if (titleCheckResult && titleCheckResult.rows && titleCheckResult.rows.length > 0) {
                const chatInfo = titleCheckResult.rows[0];
                isFirstMessage = chatInfo.messageCount === 0;
                currentTitle = chatInfo.title;
            }
        }
        catch (err) {
            logger_1.logger.warn('Failed to check chat info for title:', err);
        }
        const messagesResult = await database_1.db.query(`
      SELECT content, sender, "createdAt"
      FROM "Message"
      WHERE "chatId" = $1
      ORDER BY "createdAt" ASC
    `, [chatId]);
        const chatHistory = messagesResult.rows.map(msg => ({
            content: msg.content,
            sender: msg.sender,
            timestamp: msg.createdAt
        }));
        logger_1.logger.info('📚 Chat history loaded:', chatHistory.length, 'messages');
        const intent = (0, intentClassification_1.classifyIntent)(message);
        logger_1.logger.info('🎯 Intent classified:', intent.intent);
        let response = "I'm your AI twin! How can I help you today?";
        let generatedTitle = null;
        const shouldGenerateTitle = isFirstMessage && (!currentTitle || currentTitle === 'New Chat' || currentTitle === '');
        try {
            const twinService = new twinService_1.TwinService();
            const draftResult = await twinService.generateDraftWithContext({
                styleVector: chat.styleVector,
                personaData: chat.personaData,
                systemPrompt: chat.systemPrompt || "You are the user's AI twin. Respond naturally and helpfully.",
                tokenLimit: chat.tokenLimit || 500,
                chatMemory: chatHistory,
                currentMessages: [message],
                twinId: chat.twin_id,
                isFirstMessage: shouldGenerateTitle
            });
            if (typeof draftResult === 'object' && draftResult.response && draftResult.title) {
                response = draftResult.response;
                generatedTitle = draftResult.title;
            }
            else if (typeof draftResult === 'string') {
                response = draftResult;
            }
            else {
                response = "I'm having trouble thinking right now. Could you try again?";
            }
        }
        catch (error) {
            logger_1.logger.error('TwinService error:', error);
            response = "I'm having trouble thinking right now. Could you try again?";
        }
        if (!regenerate) {
            try {
                const userMessageId = idGenerator_1.generateId.message();
                const utcTimestamp = new Date().toISOString();
                await database_1.db.query(`
          INSERT INTO "Message" (id, "chatId", content, sender, "createdAt") 
          VALUES ($1, $2, $3, 'human', $4::timestamptz)
        `, [userMessageId, chatId, message, utcTimestamp]);
                logger_1.logger.info('✅ User message saved');
            }
            catch (error) {
                logger_1.logger.warn('⚠️ Failed to save user message:', error);
            }
        }
        let aiMessageId = null;
        try {
            aiMessageId = idGenerator_1.generateId.message();
            const utcTimestamp = new Date().toISOString();
            await database_1.db.query(`
        INSERT INTO "Message" (id, "chatId", content, sender, "createdAt") 
        VALUES ($1, $2, $3, 'twin', $4::timestamptz)
      `, [aiMessageId, chatId, response, utcTimestamp]);
            logger_1.logger.info('✅ AI response saved');
        }
        catch (error) {
            logger_1.logger.warn('⚠️ Failed to save AI response:', error);
        }
        try {
            const utcTimestamp = new Date().toISOString();
            if (regenerate) {
                if (generatedTitle) {
                    await database_1.db.query(`
            UPDATE "Chat" SET "lastMessage" = $1, "title" = $2, "updatedAt" = $3::timestamptz WHERE id = $4
          `, [response, generatedTitle, utcTimestamp, chatId]);
                }
                else {
                    await database_1.db.query(`
            UPDATE "Chat" SET "lastMessage" = $1, "updatedAt" = $2::timestamptz WHERE id = $3
          `, [response, utcTimestamp, chatId]);
                }
            }
            else {
                if (generatedTitle) {
                    await database_1.db.query(`
            UPDATE "Chat" SET "messageCount" = "messageCount" + 1, "lastMessage" = $1, "title" = $2, "updatedAt" = $3::timestamptz WHERE id = $4
          `, [response, generatedTitle, utcTimestamp, chatId]);
                }
                else if (isFirstMessage && (!currentTitle || currentTitle === 'New Chat' || currentTitle === '')) {
                    const fallbackTitle = message.trim().length > 30
                        ? message.trim().substring(0, 30) + '...'
                        : message.trim();
                    if (fallbackTitle && fallbackTitle.trim().length > 0) {
                        await database_1.db.query(`
              UPDATE "Chat" SET "messageCount" = "messageCount" + 1, "lastMessage" = $1, "title" = $2, "updatedAt" = $3::timestamptz WHERE id = $4
            `, [response, fallbackTitle.trim(), utcTimestamp, chatId]);
                    }
                }
                else {
                    await database_1.db.query(`
            UPDATE "Chat" SET "messageCount" = "messageCount" + 1, "lastMessage" = $1, "updatedAt" = $2::timestamptz WHERE id = $3
          `, [response, utcTimestamp, chatId]);
                }
            }
        }
        catch (error) {
            logger_1.logger.warn('Failed to update chat metadata:', error);
        }
        try {
            const runId = idGenerator_1.generateId.run();
            await database_1.db.query(`
        INSERT INTO ai_runs (id, twin_id, mode, tokens_in, tokens_out, latency_ms) 
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [runId, chat.twin_id, 'human', Math.ceil(message.length / 4), Math.ceil(response.length / 4), 1000]);
            logger_1.logger.info('✅ AI run logged');
        }
        catch (error) {
            logger_1.logger.warn('⚠️ Failed to log AI run:', error);
        }
        logger_1.logger.info('🎉 Enhanced reply completed successfully');
        res.json({
            success: true,
            response: response,
            messageId: aiMessageId,
            intent: intent.intent,
            criticScore: null,
            latency: 1000,
            generatedTitle: generatedTitle || null,
            isFirstMessage: isFirstMessage,
            timestamp: new Date().toISOString(),
            serverTime: new Date().toISOString()
        });
    }
    catch (error) {
        (0, errorHandler_1.handleControllerError)(error, 'Failed to generate enhanced reply');
    }
};
exports.generateEnhancedReply = generateEnhancedReply;
const getChatHistory = async (req, res, next) => {
    try {
        try {
            logger_1.logger.info('[ENHANCED_CHAT:START]', {
                path: req.path,
                method: req.method,
                chatId: req.params.id,
                userId: req.user?.id || null,
                headers: {
                    ifNoneMatch: req.headers['if-none-match'] || null,
                    ifModifiedSince: req.headers['if-modified-since'] || null,
                    cacheControl: req.headers['cache-control'] || null,
                },
            });
        }
        catch (logErr) {
            logger_1.logger.warn('[ENHANCED_CHAT] Failed to log START:', logErr);
        }
        const { id: chatId } = req.params;
        const userId = req.user.id;
        logger_1.logger.info('📚 Getting chat history for:', chatId);
        const chatResult = await database_1.db.query(`
      SELECT c.id, c."userId", c."twinId", c."createdAt",
             t.id as twin_id, t."styleVector", t."sampleReply"
      FROM "Chat" c
      JOIN "Twin" t ON c."twinId" = t.id
      WHERE c.id = $1 AND c."userId" = $2
    `, [chatId, userId]);
        if (chatResult.rows.length === 0) {
            throw errors_1.createError.notFound('Chat not found', errors_1.ErrorCodes.CHAT_NOT_FOUND);
        }
        const chat = chatResult.rows[0];
        const messagesResult = await database_1.db.query(`
      SELECT id, "chatId", sender, content, approved, "createdAt"
      FROM "Message"
      WHERE "chatId" = $1
      ORDER BY "createdAt" ASC
    `, [chatId]);
        const chatData = {
            id: chat.id,
            userId: chat.userId,
            twinId: chat.twinId,
            createdAt: (0, timestampUtils_1.normalizeTimestamp)(chat.createdAt),
            twin: {
                id: chat.twin_id,
                styleVector: chat.styleVector,
                sampleReply: chat.sampleReply,
            },
            messages: messagesResult.rows.map(msg => ({
                id: msg.id,
                chatId: msg.chatId,
                sender: msg.sender,
                content: msg.content,
                approved: msg.approved,
                createdAt: (0, timestampUtils_1.normalizeTimestamp)(msg.createdAt),
                relativeTime: (0, timestampUtils_1.formatRelativeTime)(msg.createdAt)
            }))
        };
        try {
            logger_1.logger.info('[ENHANCED_CHAT:RESPONSE]', {
                chatId,
                userId,
                messagesCount: chatData.messages.length,
                twinId: chatData.twinId,
            });
        }
        catch (logErr) {
            logger_1.logger.warn('[ENHANCED_CHAT] Failed to log RESPONSE:', logErr);
        }
        res.set({
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0, private',
            'Pragma': 'no-cache',
            'Expires': '0',
        });
        res.json({
            chat: chatData,
            serverTime: new Date().toISOString()
        });
    }
    catch (error) {
        (0, errorHandler_1.handleControllerError)(error, 'Failed to get chat history');
    }
};
exports.getChatHistory = getChatHistory;
const applyStyleCorrection = async (req, res, next) => {
    try {
        const { knob, delta } = styleCorrectionSchema.parse(req.body);
        const { id: chatId } = req.params;
        const userId = req.user.id;
        const chatResult = await database_1.db.query(`
      SELECT c."twinId" FROM "Chat" c
      WHERE c.id = $1 AND c."userId" = $2
    `, [chatId, userId]);
        if (chatResult.rows.length === 0) {
            throw errors_1.createError.notFound('Chat not found', errors_1.ErrorCodes.CHAT_NOT_FOUND);
        }
        const twinId = chatResult.rows[0].twinId;
        const responseResult = await database_1.db.query(`
      SELECT content FROM "Message" 
      WHERE "chatId" = $1 AND sender = 'ai' 
      ORDER BY "createdAt" DESC LIMIT 1
    `, [chatId]);
        if (responseResult.rows.length === 0) {
            throw errors_1.createError.notFound('No AI response found');
        }
        const currentResponse = responseResult.rows[0].content;
        const correctedResponse = applyStyleCorrectionToText(currentResponse, knob, delta);
        await database_1.db.query(`
      INSERT INTO style_corrections (id, twin_id, knob, delta, source) 
      VALUES ($1, $2, $3, $4, 'manual_correction')
    `, [
            idGenerator_1.generateId.correction(),
            twinId,
            knob,
            delta
        ]);
        await database_1.db.query(`
      UPDATE "Message" SET content = $1 
      WHERE "chatId" = $2 AND sender = 'ai' 
      ORDER BY "createdAt" DESC LIMIT 1
    `, [correctedResponse, chatId]);
        res.json({
            success: true,
            correctedResponse,
            correction: { knob, delta }
        });
    }
    catch (error) {
        (0, errorHandler_1.handleControllerError)(error, 'Failed to apply style correction');
    }
};
exports.applyStyleCorrection = applyStyleCorrection;
const addToAnchors = async (req, res, next) => {
    try {
        const { userUtterance, idealReply } = req.body;
        const { id: chatId } = req.params;
        const userId = req.user.id;
        const chatResult = await database_1.db.query(`
      SELECT "twinId" FROM "Chat" WHERE id = $1 AND "userId" = $2
    `, [chatId, userId]);
        if (chatResult.rows.length === 0) {
            throw errors_1.createError.notFound('Chat not found', errors_1.ErrorCodes.CHAT_NOT_FOUND);
        }
        const twinId = chatResult.rows[0].twinId;
        const anchorId = idGenerator_1.generateId.anchor();
        await database_1.db.query(`
      INSERT INTO style_anchors (id, twin_id, user_utterance, ideal_reply, tags) 
      VALUES ($1, $2, $3, $4, $5)
    `, [anchorId, twinId, userUtterance, idealReply, ['manual']]);
        res.json({
            success: true,
            anchorId,
            message: 'Style anchor added successfully'
        });
    }
    catch (error) {
        (0, errorHandler_1.handleControllerError)(error, 'Failed to add style anchor');
    }
};
exports.addToAnchors = addToAnchors;
async function getNearestAnchors(twinId, userMessage, limit) {
    try {
        const result = await database_1.db.query(`
      SELECT *, similarity(user_utterance, $2) as sim_score 
      FROM style_anchors 
      WHERE twin_id = $1 
      ORDER BY sim_score DESC 
      LIMIT $3
    `, [twinId, userMessage, limit]);
        return result.rows;
    }
    catch (error) {
        logger_1.logger.warn('Failed to get nearest anchors:', error);
        return [];
    }
}
async function retrieveMemories(twinId, bucket, query, limit) {
    try {
        if (bucket === 'facts') {
            const result = await database_1.db.query(`
        SELECT value as text
        FROM "MemoryLongTerm"
        WHERE "twinId" = $1 AND category = 'fact'
        ORDER BY "updatedAt" DESC
        LIMIT $2
      `, [twinId, limit]);
            return result.rows.map(row => row.text);
        }
        else if (bucket === 'voice') {
            const result = await database_1.db.query(`
        SELECT phrase as text
        FROM "style_anchors"
        WHERE twin_id = $1 AND type = 'phrase'
        ORDER BY created_at DESC
        LIMIT $2
      `, [twinId, limit]);
            return result.rows.map(row => row.text);
        }
        return [];
    }
    catch (error) {
        logger_1.logger.warn('Failed to retrieve memories:', error);
        return [];
    }
}
function buildPersonaPrompt(chat, facts, voice) {
    const userName = chat.personaData?.basicInfo?.fullName || 'the user';
    const userBio = chat.personaData?.basicInfo?.bio || '';
    return `You are ${userName}, ${userName}'s AI twin. First-person me bolo.
Don't mention you're an AI. No over-apologies.

STYLE:
- Sentences: ${chat.styleVector?.sentence_length || 'medium'}.
- Tone: ${chat.styleVector?.tone || 'casual'}; light wit ok; no cringe/slang spam.
- Emojis: only if the user used recently; max 1.
- Signature phrases (use naturally, not forced): ${voice.slice(0, 3).join(', ')}.

FACTS (use if relevant; don't info-dump):
${facts.slice(0, 5).map(f => `- ${f}`).join('\n')}

RULES:
- If uncertain, ask 1 concise clarifying question in the same voice.
- Prefer concrete, actionable lines over generic gyaan.`;
}
async function generateFirstPass(persona, message, intent, chat) {
    try {
        const draftResult = await twinService.generateDraftWithContext({
            styleVector: chat.styleVector,
            personaData: chat.personaData,
            systemPrompt: persona,
            tokenLimit: chat.tokenLimit || 500,
            chatMemory: [],
            currentMessages: [message],
            twinId: chat.twin_id
        });
        const response = typeof draftResult === 'object' && draftResult.response
            ? draftResult.response
            : (typeof draftResult === 'string' ? draftResult : "I'm having trouble thinking right now. Could you try again?");
        return response;
    }
    catch (error) {
        logger_1.logger.error('First pass generation error:', error);
        return "I'm having trouble thinking right now. Could you try again?";
    }
}
function applyStyleCorrectionToText(text, knob, delta) {
    switch (knob) {
        case 'shorter':
            if (delta > 0) {
                const words = text.split(' ');
                return words.slice(0, Math.max(5, Math.floor(words.length * 0.7))).join(' ');
            }
            else {
                return text + ' Let me elaborate on that.';
            }
        case 'casual':
            if (delta > 0) {
                return text
                    .replace(/I would like to/g, 'I\'d like to')
                    .replace(/I am going to/g, 'I\'m gonna')
                    .replace(/It is/g, 'It\'s')
                    .replace(/You are/g, 'You\'re');
            }
            else {
                return text
                    .replace(/I\'d like to/g, 'I would like to')
                    .replace(/I\'m gonna/g, 'I am going to')
                    .replace(/It\'s/g, 'It is')
                    .replace(/You\'re/g, 'You are');
            }
        case 'emoji_off':
            if (delta > 0) {
                return text.replace(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '');
            }
            else {
                return text + ' 😊';
            }
        case 'punchline':
            if (delta > 0) {
                return text + ' That\'s the real deal!';
            }
            else {
                return text;
            }
        case 'formal':
            if (delta > 0) {
                return text
                    .replace(/I\'d/g, 'I would')
                    .replace(/I\'m/g, 'I am')
                    .replace(/can\'t/g, 'cannot')
                    .replace(/won\'t/g, 'will not');
            }
            else {
                return text
                    .replace(/I would/g, 'I\'d')
                    .replace(/I am/g, 'I\'m')
                    .replace(/cannot/g, 'can\'t')
                    .replace(/will not/g, 'won\'t');
            }
        default:
            return text;
    }
}
function estimateTokens(text) {
    return Math.ceil(text.length / 4);
}
async function logAIRun(data) {
    try {
        const runId = idGenerator_1.generateId.run();
        await database_1.db.query(`
      INSERT INTO ai_runs (id, twin_id, mode, tokens_in, tokens_out, critic_score, latency_ms) 
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [runId, data.twinId, data.mode, data.tokensIn, data.tokensOut, data.criticScore, data.latency]);
    }
    catch (error) {
        logger_1.logger.warn('Failed to log AI run:', error);
    }
}
async function saveResponseToChat(chatId, response) {
    try {
        const messageId = idGenerator_1.generateId.message();
        const utcTimestamp = new Date().toISOString();
        await database_1.db.query(`
      INSERT INTO "Message" (id, "chatId", content, sender, "createdAt") 
      VALUES ($1, $2, $3, 'ai', $4::timestamptz)
    `, [messageId, chatId, response, utcTimestamp]);
    }
    catch (error) {
        logger_1.logger.error('Failed to save response:', error);
    }
}
const deleteMessagesAfter = async (req, res, next) => {
    try {
        const { chatId } = req.params;
        const { messageId } = req.body;
        const userId = req.user.id;
        const chatResult = await database_1.db.query(`
      SELECT id, "userId" FROM "Chat" WHERE id = $1 AND "userId" = $2
    `, [chatId, userId]);
        if (chatResult.rows.length === 0) {
            throw errors_1.createError.notFound('Chat not found', errors_1.ErrorCodes.CHAT_NOT_FOUND);
        }
        const messageResult = await database_1.db.query(`
      SELECT "createdAt" FROM "Message" 
      WHERE id = $1 AND "chatId" = $2
    `, [messageId, chatId]);
        if (messageResult.rows.length === 0) {
            throw errors_1.createError.notFound('Message not found', errors_1.ErrorCodes.NOT_FOUND);
        }
        const messageTime = messageResult.rows[0].createdAt;
        const deleteResult = await database_1.db.query(`
      DELETE FROM "Message" 
      WHERE "chatId" = $1 AND "createdAt" > $2
      RETURNING id
    `, [chatId, messageTime]);
        await database_1.db.query(`
      UPDATE "Chat" 
      SET "messageCount" = (
        SELECT COUNT(*) FROM "Message" WHERE "chatId" = $1
      )
      WHERE id = $1
    `, [chatId]);
        logger_1.logger.info(`Deleted ${deleteResult.rows.length} messages after message ${messageId}`);
        res.json({
            success: true,
            deletedCount: deleteResult.rows.length
        });
    }
    catch (error) {
        logger_1.logger.error('Delete messages after error:', error);
        (0, errorHandler_1.handleErrorWithResponse)(error, res, 'Failed to delete messages');
    }
};
exports.deleteMessagesAfter = deleteMessagesAfter;
//# sourceMappingURL=enhancedChatController.js.map