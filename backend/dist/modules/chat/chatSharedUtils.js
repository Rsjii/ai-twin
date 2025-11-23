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
const idGenerator_1 = require("../../utils/idGenerator");
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
    return `${userIdOrVisitor}_${idGenerator_1.generateId.request()}`;
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
        sessionMemory: params.sessionMemory ?? null,
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
    const messageId = `${params.messageIdPrefix}_${idGenerator_1.generateId.message()}`;
    const utcIso = new Date().toISOString();
    console.log('[SAVE MESSAGE] BEFORE DB INSERT: iso =', utcIso);
    const messageResult = await database_1.db.query(`
    INSERT INTO "${params.messageTable}" ("id", "chatId", "sender", "content", "approved", "requestId", "createdAt")
    VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz)
    RETURNING id, "chatId", sender, content, approved, "createdAt"
  `, [
        messageId,
        params.chatId,
        'human',
        params.message.trim(),
        params.approved,
        params.requestId,
        utcIso
    ]);
    const userMessage = messageResult.rows[0];
    console.log('[SAVE MESSAGE] AFTER DB RETURN: DB createdAt ISO =', new Date(userMessage.createdAt).toISOString());
    return {
        id: userMessage.id,
        content: userMessage.content,
        sender: userMessage.sender,
        createdAt: userMessage.createdAt
    };
}
async function saveAIMessage(params) {
    const aiMessageId = `${params.messageIdPrefix}_${idGenerator_1.generateId.message()}`;
    const utcIso = new Date().toISOString();
    console.log('[SAVE AI MESSAGE] BEFORE DB INSERT: iso =', utcIso);
    const aiMessageResult = await database_1.db.query(`
    INSERT INTO "${params.messageTable}" ("id", "chatId", "sender", "content", "approved", "createdAt")
    VALUES ($1, $2, $3, $4, $5, $6::timestamptz)
    RETURNING id, "chatId", sender, content, approved, "createdAt"
  `, [
        aiMessageId,
        params.chatId,
        'twin',
        params.aiResponse,
        true,
        utcIso
    ]);
    const aiMessage = aiMessageResult.rows[0];
    console.log('[SAVE AI MESSAGE] AFTER DB RETURN: DB createdAt ISO =', new Date(aiMessage.createdAt).toISOString());
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
        const generatedTitleTrimmed = generatedTitle ? generatedTitle.trim() : '';
        const hasValidTitle = generatedTitle && generatedTitleTrimmed.length > 0;
        if (hasValidTitle && generatedTitleTrimmed.length > 0) {
            const utcTimestamp = new Date().toISOString();
            const values = [generatedTitleTrimmed];
            let paramIndex = 2;
            const updateFields = [
                `"messageCount" = "messageCount" + 1`,
                `"title" = $1`
            ];
            if (lastMessageField) {
                updateFields.push(`"${lastMessageField}" = $${paramIndex}`);
                values.push(aiResponse);
                paramIndex++;
            }
            if (updatedAtField) {
                updateFields.push(`"${updatedAtField}" = $${paramIndex}::timestamptz`);
                values.push(utcTimestamp);
                paramIndex++;
            }
            values.push(chatId);
            const whereParam = paramIndex;
            await database_1.db.query(`
        UPDATE "${chatTable}" SET ${updateFields.join(', ')} WHERE id = $${whereParam}
      `, values);
        }
        else if (isFirstMessage) {
            const fallbackTitle = userMessage.trim().length > 30
                ? userMessage.trim().substring(0, 30) + '...'
                : userMessage.trim() || 'New Chat';
            if (fallbackTitle && fallbackTitle.trim().length > 0) {
                const utcTimestamp = new Date().toISOString();
                const values = [fallbackTitle.trim()];
                let paramIndex = 2;
                const updateFields = [
                    `"messageCount" = "messageCount" + 1`,
                    `"title" = $1`
                ];
                if (lastMessageField) {
                    updateFields.push(`"${lastMessageField}" = $${paramIndex}`);
                    values.push(aiResponse);
                    paramIndex++;
                }
                if (updatedAtField) {
                    updateFields.push(`"${updatedAtField}" = $${paramIndex}::timestamptz`);
                    values.push(utcTimestamp);
                    paramIndex++;
                }
                values.push(chatId);
                const whereParam = paramIndex;
                await database_1.db.query(`
          UPDATE "${chatTable}" SET ${updateFields.join(', ')} WHERE id = $${whereParam}
        `, values);
            }
        }
        else {
            const utcTimestamp = new Date().toISOString();
            const values = [];
            let paramIndex = 1;
            const updateFields = [
                `"messageCount" = "messageCount" + 1`
            ];
            if (lastMessageField) {
                updateFields.push(`"${lastMessageField}" = $${paramIndex}`);
                values.push(aiResponse);
                paramIndex++;
            }
            if (updatedAtField) {
                updateFields.push(`"${updatedAtField}" = $${paramIndex}::timestamptz`);
                values.push(utcTimestamp);
                paramIndex++;
            }
            values.push(chatId);
            const whereParam = paramIndex;
            await database_1.db.query(`
        UPDATE "${chatTable}" SET ${updateFields.join(', ')} WHERE id = $${whereParam}
      `, values);
        }
    }
    catch (error) {
        logger_1.logger.error('Failed to update chat metadata:', error);
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