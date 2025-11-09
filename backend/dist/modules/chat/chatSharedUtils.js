"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateMessage = validateMessage;
exports.checkModerationAndApprove = checkModerationAndApprove;
exports.getModerationRejectionResponse = getModerationRejectionResponse;
exports.createRequestId = createRequestId;
exports.checkDuplicateRequest = checkDuplicateRequest;
exports.getRecentMessages = getRecentMessages;
exports.buildChatContext = buildChatContext;
exports.generateAIResponse = generateAIResponse;
exports.saveUserMessage = saveUserMessage;
exports.saveAIMessage = saveAIMessage;
exports.checkFirstMessage = checkFirstMessage;
exports.getChatTitle = getChatTitle;
exports.updateChatMetadata = updateChatMetadata;
exports.updateSessionMemory = updateSessionMemory;
exports.getSessionMemoryForContext = getSessionMemoryForContext;
const database_1 = require("../../config/database");
const logger_1 = require("../../config/logger");
const safety_1 = require("../../utils/safety");
const moderationController_1 = require("../moderation/moderationController");
const twinService_1 = require("../twin/twinService");
const errors_1 = require("../../utils/errors");
const memoryService_1 = require("../../services/memoryService");
const twinService = new twinService_1.TwinService();
function validateMessage(message) {
    if (!message || message.trim().length === 0) {
        throw errors_1.createError.validation('Message cannot be empty');
    }
    if (!(0, safety_1.validateMessageLength)(message)) {
        throw errors_1.createError.validation('Message length invalid');
    }
    if ((0, safety_1.checkBlacklist)(message)) {
        throw errors_1.createError.validation('Message contains restricted content');
    }
}
async function checkModerationAndApprove(message, twinId, userId, requireApprovalOverride) {
    const moderationSettings = await (0, moderationController_1.getModerationSettings)(twinId);
    const autoModeration = await (0, moderationController_1.moderateContentSync)(message.trim(), 'message', userId, twinId);
    const requireApproval = requireApprovalOverride ?? moderationSettings.requireApproval;
    const approved = !requireApproval && autoModeration.isApproved;
    return {
        approved,
        moderationResult: autoModeration
    };
}
function getModerationRejectionResponse(moderationResult) {
    return {
        success: false,
        error: 'Message blocked',
        message: 'I cannot answer this message due to content moderation policies.',
        reasons: moderationResult.reasons || ['Content does not meet our guidelines'],
        suggestions: moderationResult.suggestions || ['Please revise your message']
    };
}
function createRequestId(userIdOrVisitor) {
    return `${userIdOrVisitor}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
}
async function checkDuplicateRequest(chatId, requestId, messageTable) {
    const existing = await database_1.db.query(`
    SELECT id, "chatId", sender, content, approved, "createdAt"
    FROM "${messageTable}"
    WHERE "chatId" = $1 AND "requestId" = $2
    LIMIT 1
  `, [chatId, requestId]);
    if (existing && existing.rows && existing.rows.length > 0) {
        return {
            isDuplicate: true,
            existingMessage: existing.rows[0]
        };
    }
    return { isDuplicate: false };
}
async function getRecentMessages(chatId, messageTable, limit = 10) {
    const recentMessagesResult = await database_1.db.query(`
    SELECT content, sender, "createdAt"
    FROM "${messageTable}"
    WHERE "chatId" = $1 AND approved = true
    ORDER BY "createdAt" DESC
    LIMIT $2
  `, [chatId, limit]);
    return recentMessagesResult.rows.reverse();
}
function buildChatContext(params) {
    return {
        styleVector: params.styleVector,
        personaData: params.personaData,
        systemPrompt: params.systemPrompt,
        tokenLimit: params.tokenLimit,
        chatVector: params.chatVector,
        sessionMemory: params.sessionMemory,
        chatMemory: params.chatMemory,
        currentMessages: params.currentMessages,
        twinId: params.twinId,
        isFirstMessage: params.isFirstMessage
    };
}
async function generateAIResponse(context) {
    let aiResponse;
    let generatedTitle = null;
    try {
        const draftResult = await twinService.generateDraftWithContext(context);
        if (typeof draftResult === 'object' && draftResult.response && draftResult.title) {
            aiResponse = draftResult.response;
            generatedTitle = draftResult.title;
        }
        else if (typeof draftResult === 'object' && draftResult.response) {
            aiResponse = draftResult.response;
        }
        else if (typeof draftResult === 'string') {
            aiResponse = draftResult;
        }
        else {
            logger_1.logger.error('Invalid response format from AI:', draftResult);
            throw new Error('Invalid response format from AI');
        }
        if (!aiResponse || aiResponse.trim().length === 0) {
            throw new Error('Empty response from AI');
        }
        logger_1.logger.info('AI response generated successfully:', aiResponse.substring(0, 100));
    }
    catch (error) {
        logger_1.logger.error('AI response generation failed:', error);
        aiResponse = "I'm having trouble thinking right now. Could you try again?";
    }
    return {
        aiResponse,
        generatedTitle
    };
}
async function saveUserMessage(params) {
    const messageId = `${params.messageIdPrefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const messageResult = await database_1.db.query(`
    INSERT INTO "${params.messageTable}" ("id", "chatId", "sender", "content", "approved", "requestId", "createdAt")
    VALUES ($1, $2, $3, $4, $5, $6, NOW())
    RETURNING id, "chatId", sender, content, approved, "createdAt"
  `, [
        messageId,
        params.chatId,
        'human',
        params.message.trim(),
        params.approved,
        params.requestId
    ]);
    const userMessage = messageResult.rows[0];
    logger_1.logger.info('User message saved successfully:', userMessage.id);
    return {
        id: userMessage.id,
        content: userMessage.content,
        sender: userMessage.sender,
        createdAt: userMessage.createdAt
    };
}
async function saveAIMessage(params) {
    const aiMessageId = `${params.messageIdPrefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const aiMessageResult = await database_1.db.query(`
    INSERT INTO "${params.messageTable}" ("id", "chatId", "sender", "content", "approved", "createdAt")
    VALUES ($1, $2, $3, $4, $5, NOW())
    RETURNING id, "chatId", sender, content, approved, "createdAt"
  `, [
        aiMessageId,
        params.chatId,
        'twin',
        params.aiResponse,
        true
    ]);
    const aiMessage = aiMessageResult.rows[0];
    logger_1.logger.info('AI message saved successfully:', aiMessage.id);
    return {
        id: aiMessage.id,
        content: aiMessage.content,
        sender: aiMessage.sender,
        createdAt: aiMessage.createdAt
    };
}
async function checkFirstMessage(chatId, messageTable) {
    const messageCountResult = await database_1.db.query(`
    SELECT COUNT(*) as count
    FROM "${messageTable}"
    WHERE "chatId" = $1 AND approved = true
  `, [chatId]);
    const messageCount = parseInt(messageCountResult.rows[0]?.count || '0');
    return messageCount === 0;
}
async function getChatTitle(chatId, chatTable) {
    const titleResult = await database_1.db.query(`
    SELECT "title"
    FROM "${chatTable}"
    WHERE id = $1
  `, [chatId]);
    return titleResult.rows[0]?.title || null;
}
async function updateChatMetadata(params) {
    const { chatId, chatTable, generatedTitle, isFirstMessage, currentTitle, userMessage, aiResponse, lastMessageField = chatTable === 'Chat' ? 'lastMessage' : undefined, updatedAtField = chatTable === 'Chat' ? 'updatedAt' : 'lastActivity' } = params;
    try {
        if (generatedTitle) {
            const updateFields = [
                `"messageCount" = "messageCount" + 1`,
                `"title" = $1`,
                updatedAtField ? `"${updatedAtField}" = NOW()` : null,
                lastMessageField ? `"${lastMessageField}" = $2` : null
            ].filter(Boolean).join(', ');
            const values = [generatedTitle, aiResponse].filter((_, i) => {
                if (i === 0)
                    return true;
                if (i === 1 && lastMessageField)
                    return true;
                return false;
            });
            await database_1.db.query(`
        UPDATE "${chatTable}" SET ${updateFields} WHERE id = $${values.length + 1}
      `, [...values, chatId]);
        }
        else if (isFirstMessage && (!currentTitle || currentTitle === 'New Chat' || currentTitle === '' || currentTitle === null)) {
            const fallbackTitle = userMessage.trim().length > 30
                ? userMessage.trim().substring(0, 30) + '...'
                : userMessage.trim();
            if (fallbackTitle && fallbackTitle.trim().length > 0) {
                const updateFields = [
                    `"messageCount" = "messageCount" + 1`,
                    `"title" = $1`,
                    updatedAtField ? `"${updatedAtField}" = NOW()` : null,
                    lastMessageField ? `"${lastMessageField}" = $2` : null
                ].filter(Boolean).join(', ');
                const values = [fallbackTitle.trim(), aiResponse].filter((_, i) => {
                    if (i === 0)
                        return true;
                    if (i === 1 && lastMessageField)
                        return true;
                    return false;
                });
                await database_1.db.query(`
          UPDATE "${chatTable}" SET ${updateFields} WHERE id = $${values.length + 1}
        `, [...values, chatId]);
            }
        }
        else {
            const updateFields = [
                `"messageCount" = "messageCount" + 1`,
                updatedAtField ? `"${updatedAtField}" = NOW()` : null,
                lastMessageField ? `"${lastMessageField}" = $1` : null
            ].filter(Boolean).join(', ');
            const values = lastMessageField ? [aiResponse] : [];
            await database_1.db.query(`
        UPDATE "${chatTable}" SET ${updateFields} WHERE id = $${values.length + 1}
      `, [...values, chatId]);
        }
    }
    catch (error) {
        logger_1.logger.warn('Failed to update chat metadata:', error);
    }
}
async function updateSessionMemory(chatId, twinId) {
    try {
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
        await memoryService_1.memoryService.createOrUpdateSessionMemory(chatId, allMessages);
        logger_1.logger.info(`Session memory updated for chat ${chatId} with ${allMessages.length} messages`);
        if (allMessages.length >= 10 && allMessages.length % 10 === 0) {
            const sessionMem = await memoryService_1.memoryService.getSessionMemory(chatId);
            if (sessionMem?.summary) {
                memoryService_1.memoryService.extractLongTermFacts(twinId, sessionMem.summary)
                    .then(() => logger_1.logger.info(`Long-term facts extracted for twin ${twinId}`))
                    .catch(err => logger_1.logger.error('Long-term facts extraction failed:', err));
            }
        }
    }
    catch (error) {
        logger_1.logger.error('Session memory update failed:', error);
    }
}
async function getSessionMemoryForContext(chatId) {
    try {
        const sessionMemory = await memoryService_1.memoryService.getSessionMemory(chatId);
        return sessionMemory ? {
            summary: sessionMemory.summary,
            keyTopics: sessionMemory.keyTopics || []
        } : null;
    }
    catch (error) {
        logger_1.logger.error('Error getting session memory:', error);
        return null;
    }
}
//# sourceMappingURL=chatSharedUtils.js.map