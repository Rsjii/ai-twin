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
import { createError } from '../../utils/errors';
import { memoryService } from '../../services/memoryService';
import { generateId } from '../../utils/idGenerator';

const twinService = new TwinService();

// ========== TYPES ==========

export interface ChatMessageContext {
  // MVP (personaData-only): styleVector is legacy/optional.
  styleVector?: any;
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
  memoryVisibility?: 'none' | 'owner' | 'public_twin' | 'all';
  isAnonymous?: boolean; // ✅ ADD: Flag to determine which Groq API key to use
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
  tokensUsed: number;
  inputTokens?: number;
  outputTokens?: number;
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

   // ✅ MVP: approval == moderation pass (no manual owner review)
   const approved = autoModeration.isApproved;

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
  return `${userIdOrVisitor}_${generateId.request()}`;
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

  const messages = recentMessagesResult.rows.reverse();
  return messages;
}

/**
 * Build chat context for AI response generation
 */
export function buildChatContext(params: {
  styleVector?: any;
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
  memoryVisibility?: 'none' | 'owner' | 'public_twin' | 'all';
  isAnonymous?: boolean; // ✅ ADD: Flag to determine which Groq API key to use
}): ChatMessageContext {
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
    isFirstMessage: params.isFirstMessage,
    memoryVisibility: params.memoryVisibility,
    isAnonymous: params.isAnonymous, // ✅ ADD: Pass authentication flag
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
  let tokensUsed: number = 0;
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    const draftResult = await twinService.generateDraftWithContext(context);

    // Handle both string and object response (for title generation)
    if (typeof draftResult === 'object' && draftResult.response && draftResult.title) {
      aiResponse = draftResult.response;
      generatedTitle = draftResult.title;
      tokensUsed = draftResult.tokensUsed || 0;
      // ✅ Use actual breakdown if available, otherwise estimate (ensuring sum = tokensUsed)
      if (draftResult.inputTokens !== undefined && draftResult.outputTokens !== undefined) {
        inputTokens = draftResult.inputTokens;
        outputTokens = draftResult.outputTokens;
        // Ensure tokensUsed matches sum (Groq's total_tokens should equal prompt + completion)
        tokensUsed = inputTokens + outputTokens || tokensUsed;
      } else {
        inputTokens = Math.floor(tokensUsed * 0.7);
        outputTokens = tokensUsed - inputTokens; // Ensure sum equals tokensUsed
      }
    } else if (typeof draftResult === 'object' && draftResult.response) {
      aiResponse = draftResult.response;
      tokensUsed = draftResult.tokensUsed || 0;
      // ✅ Use actual breakdown if available, otherwise estimate (ensuring sum = tokensUsed)
      if (draftResult.inputTokens !== undefined && draftResult.outputTokens !== undefined) {
        inputTokens = draftResult.inputTokens;
        outputTokens = draftResult.outputTokens;
        // Ensure tokensUsed matches sum (Groq's total_tokens should equal prompt + completion)
        tokensUsed = inputTokens + outputTokens || tokensUsed;
      } else {
        inputTokens = Math.floor(tokensUsed * 0.7);
        outputTokens = tokensUsed - inputTokens; // Ensure sum equals tokensUsed
      }
    } else if (typeof draftResult === 'string') {
      aiResponse = draftResult;
      tokensUsed = 0; // Fallback string response usually has no token count here
      inputTokens = 0;
      outputTokens = 0;
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
    tokensUsed = 0;
    inputTokens = 0;
    outputTokens = 0;
  }

  return {
    aiResponse,
    generatedTitle,
    tokensUsed,
    inputTokens,
    outputTokens
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
  const messageId = `${params.messageIdPrefix}_${generateId.message()}`;

  // Always use UTC ISO string
  const utcIso = new Date().toISOString();
  const messageResult = await db.query(`
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
  const aiMessageId = `${params.messageIdPrefix}_${generateId.message()}`;

  const utcIso = new Date().toISOString();

  const aiMessageResult = await db.query(`
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
  tokensUsed?: number;
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
    tokensUsed = 0,
    lastMessageField = 'lastMessage',
    updatedAtField = 'updatedAt'
  } = params;

  try {
    const generatedTitleTrimmed = generatedTitle ? generatedTitle.trim() : '';
    const hasValidTitle = generatedTitle && generatedTitleTrimmed.length > 0;

    // ✅ FIX: Check for both null and empty string - AND ensure trimmed length > 0
    if (hasValidTitle && generatedTitleTrimmed.length > 0) {
      // ✅ FIX: Use JavaScript Date for UTC timestamp
      const utcTimestamp = new Date().toISOString();
      
      const values: any[] = [generatedTitleTrimmed];
      let paramIndex = 2;
      
      const updateFields: string[] = [
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

      await db.query(`
        UPDATE "${chatTable}" SET ${updateFields.join(', ')} WHERE id = $${whereParam}
      `, values);
    } else if (isFirstMessage) {
      // ✅ FIX: Always set title for first message, regardless of currentTitle
      // Fallback: use first 30 chars of message as title
      const fallbackTitle = userMessage.trim().length > 30
        ? userMessage.trim().substring(0, 30) + '...'
        : userMessage.trim() || 'New Chat';

      if (fallbackTitle && fallbackTitle.trim().length > 0) {
        // ✅ FIX: Use JavaScript Date for UTC timestamp
        const utcTimestamp = new Date().toISOString();
        
        const values: any[] = [fallbackTitle.trim()];
        let paramIndex = 2;
        
        const updateFields: string[] = [
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

        await db.query(`
          UPDATE "${chatTable}" SET ${updateFields.join(', ')} WHERE id = $${whereParam}
        `, values);
      }
    } else {
      // ✅ FIX: Use JavaScript Date for UTC timestamp
      const utcTimestamp = new Date().toISOString();
      
      const values: any[] = [];
      let paramIndex = 1;
      
      const updateFields: string[] = [
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

      await db.query(`
        UPDATE "${chatTable}" SET ${updateFields.join(', ')} WHERE id = $${whereParam}
      `, values);
    }
  } catch (error) {
    logger.error('Failed to update chat metadata:', error);
  }
}

// ========== SESSION MEMORY (Private Chat Only) ==========

/**
 * Update session memory (works for both private and public chat)
 * Uses delta-only updates + useful-only filtering for cost optimization
 */
export async function updateSessionMemory(
  chatId: string,
  twinId: string,
  messageTable: 'Message' | 'PublicMessage' = 'Message',
  actor?: { kind: 'user' | 'anon'; userId?: string; ip?: string } // ✅ ADD: For token tracking
): Promise<{ inputTokens: number; outputTokens: number; totalTokens: number } | null> {
  try {
    // 1) Load existing session memory (to get lastUpdated from vector)
    // Route to correct table based on messageTable
    const existing =
      messageTable === 'PublicMessage'
        ? await memoryService.getPublicSessionMemory(chatId)
        : await memoryService.getSessionMemory(chatId);

    let lastUpdatedIso: string | null = null;
    if (existing?.vector) {
      try {
        const vec = typeof existing.vector === 'string' ? JSON.parse(existing.vector) : existing.vector;
        lastUpdatedIso = vec?.lastUpdated || null;
      } catch {
        lastUpdatedIso = null;
      }
    }

    // 2) Fetch ONLY delta messages since lastUpdated (cheap + bounded)
    const MAX_DELTA = Number(process.env.SESSION_SUMMARY_DELTA_MAX ?? 12);

    let rows: Array<{ content: string; sender: string; createdAt: Date }> = [];

    if (lastUpdatedIso) {
      const deltaResult = await db.query(
        `
        SELECT content, sender, "createdAt"
        FROM "${messageTable}"
        WHERE "chatId" = $1 AND approved = true AND "createdAt" > $2::timestamptz
        ORDER BY "createdAt" ASC
        LIMIT $3
        `,
        [chatId, lastUpdatedIso, MAX_DELTA]
      );
      rows = deltaResult.rows;
    } else {
      // No summary yet → take a small recent slice to bootstrap
      const bootstrapResult = await db.query(
        `
        SELECT content, sender, "createdAt"
        FROM "${messageTable}"
        WHERE "chatId" = $1 AND approved = true
        ORDER BY "createdAt" DESC
        LIMIT $2
        `,
        [chatId, MAX_DELTA]
      );
      rows = bootstrapResult.rows.slice().reverse();
    }

    const deltaMessages = rows.map(r => ({
      content: r.content,
      sender: r.sender,
      timestamp: r.createdAt,
    }));

    if (!deltaMessages.length) return null;

    // 2.5) Extract pinned facts using LLM (intelligent, handles typos and context)
    // This ensures name/likes/hobbies/extras persist even if message is short
    let pinnedFactsDelta: any = {};
    let pinnedTokens = 0;

    // ✅ tiny gate call first (~30 tokens)
    const gate = await memoryService.shouldExtractPinnedFactsLLM(deltaMessages);
    pinnedTokens += gate.tokensUsed || 0;

    if (gate.should) {
      const pinnedResult = await memoryService.extractPinnedFactsFromMessages(deltaMessages);
      pinnedFactsDelta = {
        name: pinnedResult.name,
        likes: pinnedResult.likes,
        hobbies: pinnedResult.hobbies,
        extras: pinnedResult.extras
      };
      pinnedTokens += pinnedResult.tokensUsed || 0;
    } else {
      pinnedFactsDelta = {};
    }


    // 3) Useful-only: skip summarization for junk turns (hi/ok/thanks)
    const isMeaningful = (text: string) => {
      const t = (text || '').trim().toLowerCase();
      if (!t) return false;

      // ✅ Identity / pinned-fact statements must always be kept (even if short)
      if (
        /\b(my name is|call me|i am|i'm|mera naam|mai\b|main\b|mujhe\b|pasand|i like|my hobby is|i enjoy|mera hobby)\b/i.test(t) &&
        !/\b(what\s+is\s+my\s+name|mera\s+naam\s+kya)\b/i.test(t)
      ) {
        return true;
      }

      // ✅ Numeric / score-like answers should always be kept (quiz/otp/short answers)
      if (/^\d+(\.\d+)?$/.test(t)) return true;         // "3", "4.5"
      if (/^\d+\s*\/\s*\d+$/.test(t)) return true;      // "10/10"

      // ✅ Short state-changing replies also matter
      if (/^(no|yes|y|n|ok|okay|haan|han|ha|nahi|nah)$/.test(t)) return true;

      // ✅ Truly trivial greetings/closings → skip summary update
      if (/^(hi|hey|hello|yo|hii|heyy|hola|sup|wassup|what'?s up|whats up)\b/.test(t)) return false;
      if (/^(thanks|thx|ty|bye|gn|good night|goodmorning|good morning)\b/.test(t)) return false;

      // Short junk after above checks
      if (t.length <= 3) return false;

      // Check if message is only emojis/punctuation (no actual words)
      const emojiPattern = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
      const textWithoutEmojis = t.replace(emojiPattern, '');
      if (/^[\s\.\!\?]+$/.test(textWithoutEmojis)) return false;

      // "stateful" signals
      if (/\d/.test(t)) return true;
      if (/(plan|todo|task|deadline|tomorrow|next|schedule|decide|final|fix|build|implement|ship|deploy)/i.test(t)) return true;
      if (/(remember|save|don'?t forget|yaad rakho|memorize)/i.test(t)) return true;
      if (t.length >= 40) return true;

      return false;
    };

    const meaningfulDelta = deltaMessages.filter(m => isMeaningful(m.content));
    if (!meaningfulDelta.length) {
      return null;
    }

    // 4) Incremental update with token tracking
    let summaryTokens = 0;
    let topicsTokens = 0;
    
    // Route to correct table based on messageTable
    if (messageTable === 'PublicMessage') {
      const result = await memoryService.createOrUpdatePublicSessionMemory(chatId, meaningfulDelta, {
        mode: existing ? 'delta' : 'full',
        pinnedFactsDelta, // ✅ Part 1 update even when message is short
      });
      summaryTokens = result.summaryTokens || 0;
      topicsTokens = result.topicsTokens || 0;
    } else {
      const result = await memoryService.createOrUpdateSessionMemory(chatId, meaningfulDelta, {
        mode: existing ? 'delta' : 'full',
        pinnedFactsDelta, // ✅ Part 1 update even when message is short
      });
      summaryTokens = result.summaryTokens || 0;
      topicsTokens = result.topicsTokens || 0;
    }

    // ✅ ADD: Reconcile session memory tokens to quota
    if (actor && (pinnedTokens > 0 || summaryTokens > 0 || topicsTokens > 0)) {
      const totalMemoryTokens = pinnedTokens + summaryTokens + topicsTokens;
      const { reconcileDailyTokens } = await import('../../services/tokenQuotaService');
      const crypto = require('crypto');
      const day = new Date().toISOString().split('T')[0];
      const actorKey = actor.kind === 'user' 
        ? `user:${actor.userId}` 
        : `anon:${crypto.createHmac('sha256', process.env.IP_HASH_SECRET || 'dev_ip_hash_secret_change_me').update(actor.ip || '').digest('hex').slice(0, 32)}`;
      
      // Add tokens directly (no pre-reservation for async updates)
      await reconcileDailyTokens({
        day,
        actorKey,
        reserved: 0,
        actualTokensUsed: totalMemoryTokens
      });
    }

    logger.info(`Session memory updated for ${messageTable} chat ${chatId} (delta=${meaningfulDelta.length})`);

    // ✅ REMOVED: Automatic fact extraction (har 10 messages)
    // Facts will be extracted only when:
    // 1. User explicitly says "remember this" / "save it" in chat (ChatGPT-style)
    // 2. User manually trains via learning dashboard
    // 3. User extracts from learning dashboard summary (feature to be added)
    // This saves cost while maintaining quality - facts extracted on-demand
    
    // ✅ Return token breakdown for event logging
    if (actor && (pinnedTokens > 0 || summaryTokens > 0 || topicsTokens > 0)) {
      const totalMemoryTokens = pinnedTokens + summaryTokens + topicsTokens;
      // Estimate input/output from total (memory calls are mostly input-heavy)
      const memoryInputTokens = Math.floor(totalMemoryTokens * 0.8);
      const memoryOutputTokens = totalMemoryTokens - memoryInputTokens;
      
      return {
        inputTokens: memoryInputTokens,
        outputTokens: memoryOutputTokens,
        totalTokens: totalMemoryTokens
      };
    }
    
    return null;
  } catch (error) {
    logger.error('Session memory update failed:', error);
    // Don't fail - response already sent
    return null;
  }
}

/**
 * Get session memory for context (works for both private and public chat)
 */
export async function getSessionMemoryForContext(
  chatId: string,
  messageTable: 'Message' | 'PublicMessage' = 'Message'
): Promise<{
  summary: string;
  keyTopics: string[];
  pinnedFacts?: { name?: string; likes?: string[]; hobbies?: string[]; extras?: string[] };
} | null> {
  try {
    // Route to correct table based on messageTable
    const sessionMemory =
      messageTable === 'PublicMessage'
        ? await memoryService.getPublicSessionMemory(chatId)
        : await memoryService.getSessionMemory(chatId);
    let pinnedFacts: any = undefined;
    if (sessionMemory?.vector) {
      try {
        const vec = typeof sessionMemory.vector === 'string' ? JSON.parse(sessionMemory.vector) : sessionMemory.vector;
        pinnedFacts = vec?.pinnedFacts;
      } catch {
        pinnedFacts = undefined;
      }
    }

    return sessionMemory ? {
      summary: sessionMemory.summary,
      keyTopics: sessionMemory.keyTopics || [],
      pinnedFacts,
    } : null;
  } catch (error) {
    logger.error('Error getting session memory:', error);
    return null;
  }
}