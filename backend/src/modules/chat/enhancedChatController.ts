/**
 * Enhanced Chat Controller
 * Implements the new generation pipeline with intent classification and style critic
 */

import { Response, NextFunction } from 'express';
import { z } from 'zod';
import { db } from '../../config/database';
import { logger } from '../../config/logger';
import { TwinService } from '../twin/twinService';
import { classifyIntent } from '../../utils/intentClassification';
// updateChatMetadata is deprecated - title generation handled in handleUserMessage
// Keeping import for backwards compatibility but function does nothing
import { AppError, createError, ErrorCodes } from '../../utils/errors';
import { generateId } from '../../utils/idGenerator';
import { handleControllerError, handleErrorWithResponse } from '../../utils/errorHandler';
import { normalizeTimestamp, formatRelativeTime } from '../../utils/timestampUtils';
import { detokenizeId, tokenizeId } from '../../utils/idTokenization';

const twinService = new TwinService();

// Validation schemas
const generateReplySchema = z.object({
  message: z.string().min(1).max(1000),
  strictStyle: z.boolean().optional().default(false),
  regenerate: z.boolean().optional().default(false),  // ✅ ADD: Flag for regeneration
  regenerateMessageId: z.string().optional()  // ✅ ADD: ID of message being regenerated
});

const styleCorrectionSchema = z.object({
  knob: z.enum(['shorter', 'casual', 'emoji_off', 'punchline', 'formal', 'humor', 'question_freq']),
  delta: z.number().int().min(-1).max(1)
});

/**
 * Enhanced reply generation - simplified to work like normal chat
 */
export const generateEnhancedReply = async (req: any, res: Response, next: NextFunction) => {
  try {
    const { message, strictStyle, regenerate, regenerateMessageId } = generateReplySchema.parse(req.body);
    const { chatToken } = req.params;
    const userId = req.user.id;

    if (!chatToken) {
      throw createError.validation('Chat token is required', ErrorCodes.INVALID_INPUT);
    }

    // ✅ PHASE 4: Detokenize chatToken to get actual chatId
    const decoded = detokenizeId(chatToken);
    if (!decoded || decoded.type !== 'chat') {
      throw createError.validation('Invalid chat token', ErrorCodes.INVALID_INPUT);
    }
    const chatId = decoded.id;

    logger.info('🚀 Enhanced reply request:', { chatId, userId, message, regenerate, regenerateMessageId });

    // 1. Get chat and twin data
    const chatResult = await db.query(`
      SELECT c.id, c."userId", c."twinId", c."createdAt",
             t.id as twin_id, t."styleVector", t."sampleReply", t."personaData", t."systemPrompt", t."tokenLimit"
      FROM "Chat" c
      JOIN "Twin" t ON c."twinId" = t.id
      WHERE c.id = $1 AND c."userId" = $2
    `, [chatId, userId]);

    if (chatResult.rows.length === 0) {
      throw createError.notFound('Chat not found', ErrorCodes.CHAT_NOT_FOUND);
    }

    const chat = chatResult.rows[0];
    logger.info('✅ Chat found:', chat.id);
    
    // ✅ NEW: If regenerating, delete the old AI response and all messages after it
    if (regenerate) {
      let messageToDeleteTime: Date | null = null;
      
      if (regenerateMessageId) {
        // Find the specific message being regenerated
        const messageResult = await db.query(`
          SELECT id, "createdAt" 
          FROM "Message" 
          WHERE id = $1 AND "chatId" = $2 AND sender = 'twin'
        `, [regenerateMessageId, chatId]);
        
        if (messageResult.rows.length > 0) {
          messageToDeleteTime = messageResult.rows[0].createdAt;
        }
      } else {
        // Fallback: Find the last AI response message
        const lastAIResponseResult = await db.query(`
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
        // Delete the old AI response and all messages after it (including the response itself)
        const deleteResult = await db.query(`
          DELETE FROM "Message" 
          WHERE "chatId" = $1 AND "createdAt" >= $2
          RETURNING id
        `, [chatId, messageToDeleteTime]);
        
        logger.info(`🗑️ Deleted ${deleteResult.rows.length} messages during regeneration (from ${messageToDeleteTime})`);
        
        // Update message count
        await db.query(`
          UPDATE "Chat" 
          SET "messageCount" = (
            SELECT COUNT(*) FROM "Message" WHERE "chatId" = $1
          )
          WHERE id = $1
        `, [chatId]);
      } else {
        logger.warn('⚠️ Could not find message to delete during regeneration');
      }
    }
    
    // Check if this is first message and get current title
    let isFirstMessage = false;
    let currentTitle = null;
    try {
      const titleCheckResult = await db.query(`
        SELECT "title", "messageCount" FROM "Chat" WHERE id = $1
      `, [chatId]);
      if (titleCheckResult && titleCheckResult.rows && titleCheckResult.rows.length > 0) {
        const chatInfo = titleCheckResult.rows[0];
        isFirstMessage = chatInfo.messageCount === 0;
        currentTitle = chatInfo.title;
      }
    } catch (err) {
      logger.warn('Failed to check chat info for title:', err);
    }
    
    // 2. Get chat history for context (BEFORE saving user message)
    const messagesResult = await db.query(`
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
    
    logger.info('📚 Chat history loaded:', chatHistory.length, 'messages');
    
    // 3. Simple intent classification
    const intent = classifyIntent(message);
    logger.info('🎯 Intent classified:', intent.intent);

    // Generate response using TwinService with full context (and title if first message)
    let response = "I'm your AI twin! How can I help you today?";
    let generatedTitle: string | null = null;
    const shouldGenerateTitle = isFirstMessage && (!currentTitle || currentTitle === 'New Chat' || currentTitle === '');
    
    try {
      const twinService = new TwinService();
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
      } else if (typeof draftResult === 'string') {
        response = draftResult;
      } else {
        response = "I'm having trouble thinking right now. Could you try again?";
      }
    } catch (error) {
      logger.error('TwinService error:', error);
      response = "I'm having trouble thinking right now. Could you try again?";
    }

    // ✅ MODIFY: Only save user message if NOT regenerating
    if (!regenerate) {
      // 5. Save user message to chat (only if not regenerating)
      try {
        const userMessageId = generateId.message();
        const utcTimestamp = new Date().toISOString();
        await db.query(`
          INSERT INTO "Message" (id, "chatId", content, sender, "createdAt") 
          VALUES ($1, $2, $3, 'human', $4::timestamptz)
        `, [userMessageId, chatId, message, utcTimestamp]);
        logger.info('✅ User message saved');
      } catch (error) {
        logger.warn('⚠️ Failed to save user message:', error);
      }
    }

    // 6. Save AI response to chat
    let aiMessageId: string | null = null;
    try {
      aiMessageId = generateId.message();
      const utcTimestamp = new Date().toISOString();
      await db.query(`
        INSERT INTO "Message" (id, "chatId", content, sender, "createdAt") 
        VALUES ($1, $2, $3, 'twin', $4::timestamptz)
      `, [aiMessageId, chatId, response, utcTimestamp]);
      logger.info('✅ AI response saved');
    } catch (error) {
      logger.warn('⚠️ Failed to save AI response:', error);
    }

    // Update chat metadata and title
    try {
      const utcTimestamp = new Date().toISOString();
      
      // ✅ MODIFY: Update messageCount correctly (increment only if not regenerating, or recalculate)
      if (regenerate) {
        // During regeneration, messageCount was already updated when we deleted messages
        // Just update lastMessage and title
        if (generatedTitle) {
          await db.query(`
            UPDATE "Chat" SET "lastMessage" = $1, "title" = $2, "updatedAt" = $3::timestamptz WHERE id = $4
          `, [response, generatedTitle, utcTimestamp, chatId]);
        } else {
          await db.query(`
            UPDATE "Chat" SET "lastMessage" = $1, "updatedAt" = $2::timestamptz WHERE id = $3
          `, [response, utcTimestamp, chatId]);
        }
      } else {
        // Normal flow - increment messageCount
        if (generatedTitle) {
          await db.query(`
            UPDATE "Chat" SET "messageCount" = "messageCount" + 1, "lastMessage" = $1, "title" = $2, "updatedAt" = $3::timestamptz WHERE id = $4
          `, [response, generatedTitle, utcTimestamp, chatId]);
        } else if (isFirstMessage && (!currentTitle || currentTitle === 'New Chat' || currentTitle === '')) {
          // Fallback: use first 30 chars of message as title
          const fallbackTitle = message.trim().length > 30 
            ? message.trim().substring(0, 30) + '...' 
            : message.trim();
          if (fallbackTitle && fallbackTitle.trim().length > 0) {
            await db.query(`
              UPDATE "Chat" SET "messageCount" = "messageCount" + 1, "lastMessage" = $1, "title" = $2, "updatedAt" = $3::timestamptz WHERE id = $4
            `, [response, fallbackTitle.trim(), utcTimestamp, chatId]);
          }
        } else {
          await db.query(`
            UPDATE "Chat" SET "messageCount" = "messageCount" + 1, "lastMessage" = $1, "updatedAt" = $2::timestamptz WHERE id = $3
          `, [response, utcTimestamp, chatId]);
        }
      }
    } catch (error) {
      logger.warn('Failed to update chat metadata:', error);
    }

    // 7. Log AI run (optional)
    try {
      const runId = generateId.run();
      await db.query(`
        INSERT INTO ai_runs (id, twin_id, mode, tokens_in, tokens_out, latency_ms) 
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [runId, chat.twin_id, 'human', Math.ceil(message.length / 4), Math.ceil(response.length / 4), 1000]);
      logger.info('✅ AI run logged');
    } catch (error) {
      logger.warn('⚠️ Failed to log AI run:', error);
    }

    logger.info('🎉 Enhanced reply completed successfully');
    res.json({
      success: true,
      response: response,
      messageId: aiMessageId, // ✅ ADD: Return message ID for frontend to update dataset
      intent: intent.intent,
      criticScore: null,
      latency: 1000,
      generatedTitle: generatedTitle || null,
      isFirstMessage: isFirstMessage,
      timestamp: new Date().toISOString(), // ✅ ADD: Timestamp for new message
      serverTime: new Date().toISOString() // ✅ ADD: Server time for relative time calculation
    });

  } catch (error) {
    handleControllerError(error, 'Failed to generate enhanced reply');
  }
};

/**
 * Get chat history for enhanced chat
 */
export const getChatHistory = async (req: any, res: Response, next: NextFunction) => {
  try {
    // ✅ ULTRA-DETAILED LOGGING for enhanced-chat API
    try {
      logger.info('[ENHANCED_CHAT:START]', {
        path: req.path,
        method: req.method,
        chatToken: req.params.chatToken,
        userId: req.user?.id || null,
        headers: {
          ifNoneMatch: req.headers['if-none-match'] || null,
          ifModifiedSince: req.headers['if-modified-since'] || null,
          cacheControl: req.headers['cache-control'] || null,
        },
      });
    } catch (logErr) {
      logger.warn('[ENHANCED_CHAT] Failed to log START:', logErr);
    }

    const { chatToken } = req.params;
    const userId = req.user.id;

 // ✅ SAFETY: If chatToken missing, don't crash – return empty chat instead
    if (!chatToken) {
      logger.warn('[ENHANCED_CHAT] Missing chatToken in request', {
        path: req.path,
        method: req.method,
        userId,
      });
      return res.status(200).json({
        success: false,
        errorCode: 'CHAT_TOKEN_MISSING',
        error: 'Chat is not initialized yet',
        chat: null,
        messages: [],
      });
    }    

    // ✅ PHASE 4: Detokenize chatToken to get actual chatId
    const decoded = detokenizeId(chatToken);
    if (!decoded || decoded.type !== 'chat') {
      throw createError.validation('Invalid chat token', ErrorCodes.INVALID_INPUT);
    }
    const chatId = decoded.id;

    logger.info('📚 Getting chat history for:', chatId);

    // Get chat with twin information
    const chatResult = await db.query(`
      SELECT c.id, c."userId", c."twinId", c."createdAt",
             t.id as twin_id, t."styleVector", t."sampleReply"
      FROM "Chat" c
      JOIN "Twin" t ON c."twinId" = t.id
      WHERE c.id = $1 AND c."userId" = $2
    `, [chatId, userId]);

    if (chatResult.rows.length === 0) {
      throw createError.notFound('Chat not found', ErrorCodes.CHAT_NOT_FOUND);
    }

    const chat = chatResult.rows[0];

    // Get messages for this chat
    const messagesResult = await db.query(`
      SELECT id, "chatId", sender, content, approved, "createdAt"
      FROM "Message"
      WHERE "chatId" = $1
      ORDER BY "createdAt" ASC
    `, [chatId]);

    const chatData = {
      publicId: tokenizeId(chat.id, 'chat'),
      publicUserId: tokenizeId(chat.userId, 'user'),
      publicTwinId: tokenizeId(chat.twinId, 'twin'),
      createdAt: normalizeTimestamp(chat.createdAt),
      twin: {
        publicId: tokenizeId(chat.twin_id, 'twin'),
        styleVector: chat.styleVector,
        sampleReply: chat.sampleReply,
      },
      messages: messagesResult.rows.map(msg => ({
        id: msg.id,
        publicChatId: tokenizeId(chat.id, 'chat'),
        sender: msg.sender,
        content: msg.content,
        approved: msg.approved,
        createdAt: normalizeTimestamp(msg.createdAt),
        relativeTime: formatRelativeTime(msg.createdAt)
      }))
    };

    // ✅ Log response before sending
    try {
      logger.info('[ENHANCED_CHAT:RESPONSE]', {
        chatId,
        userId,
        messagesCount: chatData.messages.length,
        twinId: chat.twinId,
      });
    } catch (logErr) {
      logger.warn('[ENHANCED_CHAT] Failed to log RESPONSE:', logErr);
    }

    // ✅ ADD: Cache headers to prevent 304 responses
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0, private',
      'Pragma': 'no-cache',
      'Expires': '0',
    });
    
    res.json({ 
      chat: chatData,
      serverTime: new Date().toISOString() // ✅ ADD: Server time
    });
  } catch (error) {
    handleControllerError(error, 'Failed to get chat history');
  }
};

/**
 * Apply style correction to current response
 */
export const applyStyleCorrection = async (req: any, res: Response, next: NextFunction) => {
  try {
    const { knob, delta } = styleCorrectionSchema.parse(req.body);
    const { chatToken } = req.params;
    const userId = req.user.id;

    if (!chatToken) {
      throw createError.validation('Chat token is required', ErrorCodes.INVALID_INPUT);
    }

    // ✅ PHASE 4: Detokenize chatToken to get actual chatId
    const decoded = detokenizeId(chatToken);
    if (!decoded || decoded.type !== 'chat') {
      throw createError.validation('Invalid chat token', ErrorCodes.INVALID_INPUT);
    }
    const chatId = decoded.id;

    // Get chat and twin data
    const chatResult = await db.query(`
      SELECT c."twinId" FROM "Chat" c
      WHERE c.id = $1 AND c."userId" = $2
    `, [chatId, userId]);
    
    if (chatResult.rows.length === 0) {
      throw createError.notFound('Chat not found', ErrorCodes.CHAT_NOT_FOUND);
    }

    const twinId = chatResult.rows[0].twinId;

    // Get current response
    const responseResult = await db.query(`
      SELECT content FROM "Message" 
      WHERE "chatId" = $1 AND sender = 'ai' 
      ORDER BY "createdAt" DESC LIMIT 1
    `, [chatId]);
    
    if (responseResult.rows.length === 0) {
      throw createError.notFound('No AI response found');
    }

    const currentResponse = responseResult.rows[0].content;

    // Apply correction
    const correctedResponse = applyStyleCorrectionToText(currentResponse, knob, delta);

    // Save correction to database
    await db.query(`
      INSERT INTO style_corrections (id, twin_id, knob, delta, source) 
      VALUES ($1, $2, $3, $4, 'manual_correction')
    `, [
      generateId.correction(),
      twinId,
      knob,
      delta
    ]);

    // Update the response
    await db.query(`
      UPDATE "Message" SET content = $1 
      WHERE "chatId" = $2 AND sender = 'ai' 
      ORDER BY "createdAt" DESC LIMIT 1
    `, [correctedResponse, chatId]);

    res.json({
      success: true,
      correctedResponse,
      correction: { knob, delta }
    });

  } catch (error) {
    handleControllerError(error, 'Failed to apply style correction');
  }
};

/**
 * Add current response as style anchor
 */
export const addToAnchors = async (req: any, res: Response, next: NextFunction) => {
  try {
    const { userUtterance, idealReply } = req.body;
    const { chatToken } = req.params;
    const userId = req.user.id;

    if (!chatToken) {
      throw createError.validation('Chat token is required', ErrorCodes.INVALID_INPUT);
    }

    // ✅ PHASE 4: Detokenize chatToken to get actual chatId
    const decoded = detokenizeId(chatToken);
    if (!decoded || decoded.type !== 'chat') {
      throw createError.validation('Invalid chat token', ErrorCodes.INVALID_INPUT);
    }
    const chatId = decoded.id;

    // Get twin ID from chat
    const chatResult = await db.query(`
      SELECT "twinId" FROM "Chat" WHERE id = $1 AND "userId" = $2
    `, [chatId, userId]);
    
    if (chatResult.rows.length === 0) {
      throw createError.notFound('Chat not found', ErrorCodes.CHAT_NOT_FOUND);
    }

    const twinId = chatResult.rows[0].twinId;

    // Create style anchor
    const anchorId = generateId.anchor();
    await db.query(`
      INSERT INTO style_anchors (id, twin_id, user_utterance, ideal_reply, tags) 
      VALUES ($1, $2, $3, $4, $5)
    `, [anchorId, twinId, userUtterance, idealReply, ['manual']]);

    res.json({
      success: true,
      anchorId,
      message: 'Style anchor added successfully'
    });

  } catch (error) {
    handleControllerError(error, 'Failed to add style anchor');
  }
};

// Helper functions

async function getNearestAnchors(twinId: string, userMessage: string, limit: number) {
  try {
    const result = await db.query(`
      SELECT *, similarity(user_utterance, $2) as sim_score 
      FROM style_anchors 
      WHERE twin_id = $1 
      ORDER BY sim_score DESC 
      LIMIT $3
    `, [twinId, userMessage, limit]);
    return result.rows;
  } catch (error) {
    logger.warn('Failed to get nearest anchors:', error);
    return [];
  }
}

async function retrieveMemories(twinId: string, bucket: 'facts' | 'voice', query: string, limit: number) {
  try {
    if (bucket === 'facts') {
      // Get from MemoryLongTerm
      const result = await db.query(`
        SELECT value as text
        FROM "MemoryLongTerm"
        WHERE "twinId" = $1 AND category = 'fact'
        ORDER BY "updatedAt" DESC
        LIMIT $2
      `, [twinId, limit]);
      return result.rows.map(row => row.text);
    } else if (bucket === 'voice') {
      // Get from StyleAnchors (phrases)
      const result = await db.query(`
        SELECT phrase as text
        FROM "style_anchors"
        WHERE twin_id = $1 AND type = 'phrase'
        ORDER BY created_at DESC
        LIMIT $2
      `, [twinId, limit]);
      return result.rows.map(row => row.text);
    }
    return [];
  } catch (error) {
    logger.warn('Failed to retrieve memories:', error);
    return [];
  }
}

function buildPersonaPrompt(chat: any, facts: string[], voice: string[]): string {
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

async function generateFirstPass(persona: string, message: string, intent: any, chat: any): Promise<string> {
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
    
    // Handle both string and object response
    const response = typeof draftResult === 'object' && draftResult.response 
      ? draftResult.response 
      : (typeof draftResult === 'string' ? draftResult : "I'm having trouble thinking right now. Could you try again?");
    
    return response;
  } catch (error) {
    logger.error('First pass generation error:', error);
    return "I'm having trouble thinking right now. Could you try again?";
  }
}

function applyStyleCorrectionToText(text: string, knob: string, delta: number): string {
  // Basic style correction implementation
  switch (knob) {
    case 'shorter':
      if (delta > 0) {
        // Make shorter - remove some words
        const words = text.split(' ');
        return words.slice(0, Math.max(5, Math.floor(words.length * 0.7))).join(' ');
      } else {
        // Make longer - add some words
        return text + ' Let me elaborate on that.';
      }
    
    case 'casual':
      if (delta > 0) {
        // Make more casual
        return text
          .replace(/I would like to/g, 'I\'d like to')
          .replace(/I am going to/g, 'I\'m gonna')
          .replace(/It is/g, 'It\'s')
          .replace(/You are/g, 'You\'re');
      } else {
        // Make more formal
        return text
          .replace(/I\'d like to/g, 'I would like to')
          .replace(/I\'m gonna/g, 'I am going to')
          .replace(/It\'s/g, 'It is')
          .replace(/You\'re/g, 'You are');
      }
    
    case 'emoji_off':
      if (delta > 0) {
        // Remove emojis
        return text.replace(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '');
      } else {
        // Add emojis
        return text + ' 😊';
      }
    
    case 'punchline':
      if (delta > 0) {
        // Add punchline
        return text + ' That\'s the real deal!';
      } else {
        // Remove punchline (just return original)
        return text;
      }
    
    case 'formal':
      if (delta > 0) {
        // Make more formal
        return text
          .replace(/I\'d/g, 'I would')
          .replace(/I\'m/g, 'I am')
          .replace(/can\'t/g, 'cannot')
          .replace(/won\'t/g, 'will not');
      } else {
        // Make less formal
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

function estimateTokens(text: string): number {
  // Rough estimation: 1 token ≈ 4 characters
  return Math.ceil(text.length / 4);
}

async function logAIRun(data: any) {
  try {
    const runId = generateId.run();
    await db.query(`
      INSERT INTO ai_runs (id, twin_id, mode, tokens_in, tokens_out, critic_score, latency_ms) 
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [runId, data.twinId, data.mode, data.tokensIn, data.tokensOut, data.criticScore, data.latency]);
  } catch (error) {
    logger.warn('Failed to log AI run:', error);
  }
}

async function saveResponseToChat(chatId: string, response: string) {
  try {
    const messageId = generateId.message();
    const utcTimestamp = new Date().toISOString();
    await db.query(`
      INSERT INTO "Message" (id, "chatId", content, sender, "createdAt") 
      VALUES ($1, $2, $3, 'ai', $4::timestamptz)
    `, [messageId, chatId, response, utcTimestamp]);
  } catch (error) {
    logger.error('Failed to save response:', error);
  }
}

/**
 * Delete messages after a specific message ID (for regenerate functionality)
 */
export const deleteMessagesAfter = async (req: any, res: Response, next: NextFunction) => {
  try {
    const { chatToken } = req.params;
    const { messageId } = req.body;
    const userId = req.user.id;

    if (!chatToken) {
      throw createError.validation('Chat token is required', ErrorCodes.INVALID_INPUT);
    }

    // ✅ PHASE 4: Detokenize chatToken to get actual chatId
    const decoded = detokenizeId(chatToken);
    if (!decoded || decoded.type !== 'chat') {
      throw createError.validation('Invalid chat token', ErrorCodes.INVALID_INPUT);
    }
    const chatId = decoded.id;

    // Verify chat belongs to user
    const chatResult = await db.query(`
      SELECT id, "userId" FROM "Chat" WHERE id = $1 AND "userId" = $2
    `, [chatId, userId]);

    if (chatResult.rows.length === 0) {
      throw createError.notFound('Chat not found', ErrorCodes.CHAT_NOT_FOUND);
    }

    // Get the message to find its createdAt timestamp
    const messageResult = await db.query(`
      SELECT "createdAt" FROM "Message" 
      WHERE id = $1 AND "chatId" = $2
    `, [messageId, chatId]);

    if (messageResult.rows.length === 0) {
      throw createError.notFound('Message not found', ErrorCodes.NOT_FOUND);
    }

    const messageTime = messageResult.rows[0].createdAt;

    // Delete all messages after this message
    const deleteResult = await db.query(`
      DELETE FROM "Message" 
      WHERE "chatId" = $1 AND "createdAt" > $2
      RETURNING id
    `, [chatId, messageTime]);

    // Update chat message count
    await db.query(`
      UPDATE "Chat" 
      SET "messageCount" = (
        SELECT COUNT(*) FROM "Message" WHERE "chatId" = $1
      )
      WHERE id = $1
    `, [chatId]);

    logger.info(`Deleted ${deleteResult.rows.length} messages after message ${messageId}`);

    res.json({
      success: true,
      deletedCount: deleteResult.rows.length
    });
  } catch (error) {
    logger.error('Delete messages after error:', error);
    handleErrorWithResponse(error, res, 'Failed to delete messages');
  }
};