/**
 * Shared Chat Utilities
 * Common functions used by both private and public chat flows
 * Based on private chat implementation (more complete)
 */

import { db } from '../../config/database';
import { logger } from '../../config/logger';
import { checkBlacklist, validateMessageLength } from '../../utils/safety';
import { moderateContentSync, getModerationSettings } from '../moderation/moderationController';
import { TwinService } from '../twin/twinService';
import { createError, ErrorCodes } from '../../utils/errors';
import { memoryService } from '../../services/memoryService';

const twinService = new TwinService();

// ========== TYPES ==========

export interface ChatMessageContext {
  styleVector: any;
  personaData: any;
  systemPrompt: string;
  tokenLimit: number;
  chatMemory: Array<{ content: string; sender: string; timestamp: Date }>;
  currentMessages: string[];
  twinId: string;
  isFirstMessage?: boolean;
  sessionMemory?: {
    summary: string;
    keyTopics: string[];
  } | null;
  chatVector?: any;
}

export interface ModerationResult {
  approved: boolean;
  moderationResult: {
    isApproved: boolean;
    confidence: number;
    reasons: string[];
    suggestions: string[];
  };
}

export interface AIResponseResult {
  aiResponse: string;
  generatedTitle: string | null;
}

export interface MessageSaveResult {
  userMessage: {
    id: string;
    content: string;
    sender: string;
    createdAt: Date;
  };
  aiMessage: {
    id: string;
    content: string;
    sender: string;
    createdAt: Date;
  };
}

// ========== VALIDATION FUNCTIONS ==========

/**
 * Validate message content (length + blacklist)
 */
export function validateMessage(message: string): void {
  if (!message || message.trim().length === 0) {
    throw createError.validation('Message cannot be empty');
  }

  if (!validateMessageLength(message)) {
    throw createError.validation('Message length invalid');
  }

  if (checkBlacklist(message)) {
    throw createError.validation('Message contains restricted content');
  }
}

// ========== MODERATION FUNCTIONS ==========

/**
 * Check moderation and calculate approval status
 */
export async function checkModerationAndApprove(
  message: string,
  twinId: string,
  userId?: string,
  requireApprovalOverride?: boolean
): Promise<ModerationResult> {
  const moderationSettings = await getModerationSettings(twinId);
  const autoModeration = await moderateContentSync(message.trim(), 'message', userId, twinId);

  // Calculate approved status
  // If requireApproval = false → auto approve (if moderation passes)
  // If requireApproval = true → require autoModeration.isApproved
  const requireApproval = requireApprovalOverride ?? moderationSettings.requireApproval;
  const approved = !requireApproval && autoModeration.isApproved;

  return {
    approved,
    moderationResult: autoModeration
  };
}

/**
 * Get moderation rejection response
 */
export function getModerationRejectionResponse(moderationResult: {
  reasons: string[];
  suggestions: string[];
}) {
  return {
    success: false,
    error: 'Message blocked',
    message: 'I cannot answer this message due to content moderation policies.',
    reasons: moderationResult.reasons || ['Content does not meet our guidelines'],
    suggestions: moderationResult.suggestions || ['Please revise your message']
  };
}

// ========== REQUEST ID FUNCTIONS ==========

/**
 * Generate request ID for deduplication
 */
export function createRequestId(userIdOrVisitor: string): string {
  return `${userIdOrVisitor}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
}

/**
 * Check for duplicate request
 */
export async function checkDuplicateRequest(
  chatId: string,
  requestId: string,
  messageTable: 'Message' | 'PublicMessage'
): Promise<{ isDuplicate: boolean; existingMessage?: any }> {
  const existing = await db.query(`
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

// ========== CHAT CONTEXT FUNCTIONS ==========

/**
 * Get recent messages for context
 */
export async function getRecentMessages(
  chatId: string,
  messageTable: 'Message' | 'PublicMessage',
  limit: number = 10
): Promise<Array<{ content: string; sender: string; createdAt: Date }>> {
  const recentMessagesResult = await db.query(`
    SELECT content, sender, "createdAt"
    FROM "${messageTable}"
    WHERE "chatId" = $1 AND approved = true
    ORDER BY "createdAt" DESC
    LIMIT $2
  `, [chatId, limit]);

  return recentMessagesResult.rows.reverse();
}

/**
 * Build chat context for AI response generation
 */
export function buildChatContext(params: {
  styleVector: any;
  personaData: any;
  systemPrompt: string;
  tokenLimit: number;
  chatMemory: Array<{ content: string; sender: string; timestamp: Date }>;
  currentMessages: string[];
  twinId: string;
  isFirstMessage: boolean;
  chatVector?: any;
  sessionMemory?: {
    summary: string;
    keyTopics: string[];
  } | null;
}): ChatMessageContext {
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

// ========== AI RESPONSE GENERATION ==========

/**
 * Generate AI response with error handling
 */
export async function generateAIResponse(
  context: ChatMessageContext
): Promise<AIResponseResult> {
  let aiResponse: string;
  let generatedTitle: string | null = null;

  try {
    const draftResult = await twinService.generateDraftWithContext(context);

    // Handle both string and object response (for title generation)
    if (typeof draftResult === 'object' && draftResult.response && draftResult.title) {
      aiResponse = draftResult.response;
      generatedTitle = draftResult.title;
    } else if (typeof draftResult === 'object' && draftResult.response) {
      aiResponse = draftResult.response;
    } else if (typeof draftResult === 'string') {
      aiResponse = draftResult;
    } else {
      logger.error('Invalid response format from AI:', draftResult);
      throw new Error('Invalid response format from AI');
    }

    if (!aiResponse || aiResponse.trim().length === 0) {
      throw new Error('Empty response from AI');
    }

    logger.info('AI response generated successfully:', aiResponse.substring(0, 100));
  } catch (error) {
    logger.error('AI response generation failed:', error);
    aiResponse = "I'm having trouble thinking right now. Could you try again?";
  }

  return {
    aiResponse,
    generatedTitle
  };
}

// ========== MESSAGE SAVING FUNCTIONS ==========

/**
 * Save user message to database
 */
export async function saveUserMessage(params: {
  chatId: string;
  message: string;
  approved: boolean;
  requestId: string;
  messageTable: 'Message' | 'PublicMessage';
  messageIdPrefix: string;
}): Promise<{ id: string; content: string; sender: string; createdAt: Date }> {
  const messageId = `${params.messageIdPrefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const messageResult = await db.query(`
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
  logger.info('User message saved successfully:', userMessage.id);

  return {
    id: userMessage.id,
    content: userMessage.content,
    sender: userMessage.sender,
    createdAt: userMessage.createdAt
  };
}

/**
 * Save AI message to database
 */
export async function saveAIMessage(params: {
  chatId: string;
  aiResponse: string;
  messageTable: 'Message' | 'PublicMessage';
  messageIdPrefix: string;
}): Promise<{ id: string; content: string; sender: string; createdAt: Date }> {
  const aiMessageId = `${params.messageIdPrefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const aiMessageResult = await db.query(`
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
  logger.info('AI message saved successfully:', aiMessage.id);

  return {
    id: aiMessage.id,
    content: aiMessage.content,
    sender: aiMessage.sender,
    createdAt: aiMessage.createdAt
  };
}

// ========== CHAT METADATA FUNCTIONS ==========

/**
 * Check if this is first message
 */
export async function checkFirstMessage(
  chatId: string,
  messageTable: 'Message' | 'PublicMessage'
): Promise<boolean> {
  const messageCountResult = await db.query(`
    SELECT COUNT(*) as count
    FROM "${messageTable}"
    WHERE "chatId" = $1 AND approved = true
  `, [chatId]);

  const messageCount = parseInt(messageCountResult.rows[0]?.count || '0');
  return messageCount === 0;
}

/**
 * Get current chat title
 */
export async function getChatTitle(
  chatId: string,
  chatTable: 'Chat' | 'PublicChat'
): Promise<string | null> {
  const titleResult = await db.query(`
    SELECT "title"
    FROM "${chatTable}"
    WHERE id = $1
  `, [chatId]);

  return titleResult.rows[0]?.title || null;
}

/**
 * Update chat metadata (title, message count, last message)
 */
export async function updateChatMetadata(params: {
  chatId: string;
  chatTable: 'Chat' | 'PublicChat';
  generatedTitle: string | null;
  isFirstMessage: boolean;
  currentTitle: string | null;
  userMessage: string;
  aiResponse: string;
  lastMessageField?: string; // 'lastMessage' for Chat, 'lastActivity' for PublicChat
  updatedAtField?: string; // 'updatedAt' for Chat, 'lastActivity' for PublicChat
}): Promise<void> {
  const {
    chatId,
    chatTable,
    generatedTitle,
    isFirstMessage,
    currentTitle,
    userMessage,
    aiResponse,
    lastMessageField = chatTable === 'Chat' ? 'lastMessage' : undefined,
    updatedAtField = chatTable === 'Chat' ? 'updatedAt' : 'lastActivity'
  } = params;

  try {
    if (generatedTitle) {
      const updateFields = [
        `"messageCount" = "messageCount" + 1`,
        `"title" = $1`,
        updatedAtField ? `"${updatedAtField}" = NOW()` : null,
        lastMessageField ? `"${lastMessageField}" = $2` : null
      ].filter(Boolean).join(', ');

      const values = [generatedTitle, aiResponse].filter((_, i) => {
        if (i === 0) return true; // title
        if (i === 1 && lastMessageField) return true; // lastMessage
        return false;
      });

      await db.query(`
        UPDATE "${chatTable}" SET ${updateFields} WHERE id = $${values.length + 1}
      `, [...values, chatId]);
    } else if (isFirstMessage && (!currentTitle || currentTitle === 'New Chat' || currentTitle === '' || currentTitle === null)) {
      // Fallback: use first 30 chars of message as title
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
          if (i === 0) return true; // title
          if (i === 1 && lastMessageField) return true; // lastMessage
          return false;
        });

        await db.query(`
          UPDATE "${chatTable}" SET ${updateFields} WHERE id = $${values.length + 1}
        `, [...values, chatId]);
      }
    } else {
      const updateFields = [
        `"messageCount" = "messageCount" + 1`,
        updatedAtField ? `"${updatedAtField}" = NOW()` : null,
        lastMessageField ? `"${lastMessageField}" = $1` : null
      ].filter(Boolean).join(', ');

      const values = lastMessageField ? [aiResponse] : [];

      await db.query(`
        UPDATE "${chatTable}" SET ${updateFields} WHERE id = $${values.length + 1}
      `, [...values, chatId]);
    }
  } catch (error) {
    logger.warn('Failed to update chat metadata:', error);
  }
}

// ========== SESSION MEMORY (Private Chat Only) ==========

/**
 * Update session memory (private chat only)
 */
export async function updateSessionMemory(
  chatId: string,
  twinId: string
): Promise<void> {
  try {
    // Get all messages for session summary
    const allMessagesResult = await db.query(`
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

    // Update session memory
    await memoryService.createOrUpdateSessionMemory(chatId, allMessages);
    logger.info(`Session memory updated for chat ${chatId} with ${allMessages.length} messages`);

    // ✅ REMOVED: Automatic fact extraction (har 10 messages)
    // Facts will be extracted only when:
    // 1. User explicitly says "remember this" / "save it" in chat (ChatGPT-style)
    // 2. User manually trains via learning dashboard
    // 3. User extracts from learning dashboard summary (feature to be added)
    // This saves cost while maintaining quality - facts extracted on-demand
  } catch (error) {
    logger.error('Session memory update failed:', error);
    // Don't fail - response already sent
  }
}

/**
 * Get session memory for context (private chat only)
 */
export async function getSessionMemoryForContext(chatId: string): Promise<{
  summary: string;
  keyTopics: string[];
} | null> {
  try {
    const sessionMemory = await memoryService.getSessionMemory(chatId);
    return sessionMemory ? {
      summary: sessionMemory.summary,
      keyTopics: sessionMemory.keyTopics || []
    } : null;
  } catch (error) {
    logger.error('Error getting session memory:', error);
    return null;
  }
}