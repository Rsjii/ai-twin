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
import { handleErrorWithResponse } from '../../utils/errorHandler';
import { normalizeTimestamp, formatRelativeTime } from '../../utils/timestampUtils';
import { detokenizeId, tokenizeId } from '../../utils/idTokenization';
import * as chatUtils from './chatSharedUtils';
import { EventLogger } from '../../services/eventLogger';
import { EVENT_TYPES } from '../../config/constants';
import { memoryService } from '../../services/memoryService'; // ✅ ADD
import { detectFastPathCategory, fastPathReply } from '../../utils/commonMessageFastPath';

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
    const rawChatToken = (req.params.chatToken || req.params.id) as string | undefined;
    const userId = req.user.id;
    
    if (!rawChatToken) {
      throw createError.validation('Chat token is required', ErrorCodes.INVALID_INPUT);
    }
    
    // ✅ PHASE 4: Detokenize chatToken to get actual chatId
    const decoded = detokenizeId(rawChatToken);    
    if (!decoded || decoded.type !== 'chat') {
      throw createError.validation('Invalid chat token', ErrorCodes.INVALID_INPUT);
    }
    const chatId = decoded.id;

    logger.info('🚀 Enhanced reply request:', { chatId, userId, message, regenerate, regenerateMessageId });

    // ✅ REMOVED: Banned word and fast-path handling - now handled by middleware (checkTokenQuotaForEnhancedChat)
    // The middleware handles banned words and common messages BEFORE this controller runs
    // If middleware handles it, it returns early and this controller never executes

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
    
    // ✅ FAST-PATH: Check for common messages BEFORE any expensive operations
    // This must happen BEFORE session memory, message fetching, context building
    const fastPathCategory = detectFastPathCategory(message || '');
    if (fastPathCategory) {
      logger.info('[FAST-PATH] Common message detected (ENHANCED_CHAT):', {
        category: fastPathCategory,
        message: message.substring(0, 50),
        chatId,
        userId,
        checkingActiveTask: true
      });

      // Check if there's an active task in session summary (don't interrupt work)
      // We need to check this before skipping LLM, but we'll do a minimal check
      let hasActiveTask = false;
      try {
        const quickSessionCheck = await db.query(`
          SELECT summary FROM "SessionMemory" WHERE "chatId" = $1 LIMIT 1
        `, [chatId]);
        if (quickSessionCheck.rows.length > 0 && quickSessionCheck.rows[0].summary) {
          const sm = (quickSessionCheck.rows[0].summary || '').toLowerCase();
          hasActiveTask =
            sm.includes('active_task:') &&
            !sm.includes('active_task: none') &&
            !sm.includes('active_task: (none)');
        }
      } catch (err) {
        // If check fails, proceed with fast-path (safe default)
      }

      if (hasActiveTask) {
        logger.info('[FAST-PATH] Skipped due to active task (ENHANCED_CHAT):', {
          category: fastPathCategory,
          chatId,
          reason: 'Active task detected - using LLM for context-aware reply'
        });
      }

      // Only use fast-path if no active task (let LLM handle context-aware replies during work)
      if (!hasActiveTask) {
        const aiResponse = fastPathReply(fastPathCategory, chat.personaData);

        // Get minimal chat info for fast-path
        const chatInfoResult = await db.query(`
          SELECT "messageCount", "title"
          FROM "Chat"
          WHERE id = $1
        `, [chatId]);

        const chatInfo = chatInfoResult.rows[0] || { messageCount: 0, title: null };
        const isFirstMessage = chatInfo.messageCount === 0;
        const currentTitle = chatInfo.title;

        // ✅ FIX: Generate title for first message using category-specific titles (fallback - middleware should handle this, but just in case)
        const isDefaultTitle = currentTitle && (
          currentTitle.trim() === '' ||
          currentTitle.trim().toLowerCase() === 'new chat' ||
          currentTitle.trim().toLowerCase() === 'newchat'
        );
        let generatedTitle: string | null = null;
        if (isFirstMessage && (!currentTitle || isDefaultTitle)) {
          const { getCategoryTitles } = await import('../../utils/commonMessageFastPath');
          const categoryTitles = getCategoryTitles(fastPathCategory);
          generatedTitle = categoryTitles[Math.floor(Math.random() * categoryTitles.length)];
        }

        // Save user + AI messages immediately and return
        const userMessage = await chatUtils.saveUserMessage({
          chatId,
          message,
          approved: true,
          requestId: chatUtils.createRequestId(userId), // Generate requestId here
          messageTable: 'Message',
          messageIdPrefix: 'msg'
        });

        const aiMessage = await chatUtils.saveAIMessage({
          chatId,
          aiResponse,
          messageTable: 'Message',
          messageIdPrefix: 'msg'
        });

        // Update chat metadata with generated title
        await chatUtils.updateChatMetadata({
          chatId,
          chatTable: 'Chat',
          generatedTitle,
          isFirstMessage,
          currentTitle,
          userMessage: message,
          aiResponse,
          tokensUsed: 0
        });

        logger.info('[FAST-PATH] Response sent without LLM (ENHANCED_CHAT - FALLBACK):', {
          category: fastPathCategory,
          tokensUsed: 0,
          chatId,
          userId,
          isFirstMessage,
          generatedTitle,
          messagePreview: message.substring(0, 30),
          note: 'This should rarely execute - middleware should handle fast-path first'
        });

        return res.json({
          success: true,
          response: aiResponse,
          generatedTitle,
          isFirstMessage,
          userMessage: {
            id: userMessage.id,
            publicChatId: tokenizeId(chatId, 'chat'),
            content: userMessage.content,
            sender: userMessage.sender,
            createdAt: userMessage.createdAt,
          },
          aiMessage: {
            id: aiMessage.id,
            publicChatId: tokenizeId(chatId, 'chat'),
            content: aiMessage.content,
            sender: aiMessage.sender,
            createdAt: aiMessage.createdAt,
          },
        });
      }
    }
    
    // ✅ MVP: explicit "remember" command (no LLM call, saves to MemoryLongTerm)
    if (!regenerate) {
      // ✅ FIX: Accept "remember this" with or without colon, handle typos
      const rememberMatch = message.match(/^\s*(?:rememb?e?r|remeber|rember)\s+(?:this|that|it)\s*:?\s*(.+)$/i) ||
                            message.match(/^\s*(?:remember|note)\s*:\s*(.+)$/i);
      if (rememberMatch && rememberMatch[1]) {
        const rememberedText = rememberMatch[1].trim();
        const now = new Date().toISOString();

        try {
          // store as long-term fact
          await memoryService.storeLongTermMemory(
            chat.twin_id,
            generateId.fact(),
            rememberedText,
            'fact',
            'manual',
          );

          // cap: keep newest 200 memories (cheap + only runs on "remember")
          await db.query(
            `
            DELETE FROM "MemoryLongTerm"
            WHERE id IN (
              SELECT id
              FROM "MemoryLongTerm"
              WHERE "twinId" = $1
              ORDER BY "updatedAt" DESC
              OFFSET 200
            )
            `,
            [chat.twin_id],
          );
        } catch (err) {
          logger.warn('[REMEMBER] Failed to store long-term memory:', err);
          // still respond OK (don't break chat)
        }

        // persist in chat so user sees it
        const ack = "Got it — I'll remember that.";
        try {
          const userMessageId = generateId.message();
          const aiMessageId = generateId.message();

          await db.query(
            `INSERT INTO "Message" (id, "chatId", content, sender, "createdAt")
             VALUES ($1, $2, $3, 'human', $4::timestamptz)`,
            [userMessageId, chatId, message, now],
          );

          await db.query(
            `INSERT INTO "Message" (id, "chatId", content, sender, "createdAt")
             VALUES ($1, $2, $3, 'twin', $4::timestamptz)`,
            [aiMessageId, chatId, ack, now],
          );

          await db.query(
            `UPDATE "Chat"
             SET "messageCount" = "messageCount" + 1,
                 "lastMessage" = $1,
                 "updatedAt" = $2::timestamptz
             WHERE id = $3`,
            [ack, now, chatId],
          );

          return res.json({
            success: true,
            response: ack,
            messageId: aiMessageId,
            intent: 'remember',
            criticScore: null,
            latency: 0,
            generatedTitle: null,
            isFirstMessage: false,
            timestamp: now,
            serverTime: now,
          });
        } catch (err) {
          logger.warn('[REMEMBER] Failed to persist remember messages:', err);
          return res.json({
            success: true,
            response: ack,
            messageId: null,
            intent: 'remember',
            criticScore: null,
            latency: 0,
            generatedTitle: null,
            isFirstMessage: false,
            timestamp: now,
            serverTime: now,
          });
        }
      }
    }
    
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
    
    // 2. Get chat history for context (BEFORE saving user message) - Budget-aware with session summary
    const sessionMemory = await chatUtils.getSessionMemoryForContext(chatId).catch(() => null);

    // ✅ Budget-aware: only fetch recent messages if needed (not always 20)
    const needsRecent = (() => {
      const t = (message || '').trim().toLowerCase();
      if (t.length <= 12) return true;

      // Strong “follow previous / correction / continue task” signals
      if (/^(no|nahi)\b/i.test(t)) return true;
      if (/(same|continue|as above|that|this|it|wahi|haan|han|ok|kar do|kardo|continue karo)/i.test(t)) return true;

      // Real phrases observed in logs
      if (/(as\s*i\s*said|i\s*said|isaid|do\s*what\s*i\s*said|follow\s*what\s*i\s*said)/i.test(t)) return true;
      if (/(continue\s*math|math\s*question|math\s*questions|ask\s*me\s*math|10\s*questions|one\s*at\s*a\s*time|score)/i.test(t)) return true;

      // NEW: quiz/result/reference follow-ups should pull recent context
      if (/(final\s*result|final\s*score|my\s*score|marks|kitne\s*correct|how\s*much\s*score|percentage|%)/i.test(t)) return true;
      if (/(which\s*(one|question)|what\s*was\s*question|question\s*\d+|q\s*\d+|wrong|galat)/i.test(t)) return true;

      // Preference / likes-avoids questions should fetch recent context
      if (/(what\s+do\s+i\s+like|what\s+game\s+do\s+i\s+like|my\s+preference|my\s+preferences|likes|avoids|dislikes|favou?rite\s+game|favou?rite\s+games)/i.test(t)) return true;

      // Follow-ups referring to the previous preference question
      if (/(the\s+ones\s+i\s+liked|the\s+ones\s+i\s+like|those\s+ones|which\s+one|which\s+ones|which\s+game|which\s+games)/i.test(t)) return true;

      if (/(rewrite|rephrase|edit|correct|fix this|above text)/i.test(t)) return true;
      return false;
    })();

    // If summary exists and user message is clear → send zero raw history
    // Else send a small slice (not 20 always)
    const recentLimit = sessionMemory?.summary
      ? (needsRecent ? 4 : 0)
      : 10;


    const recentMessages = recentLimit > 0
      ? await chatUtils.getRecentMessages(chatId, 'Message', recentLimit)
      : [];

    const chatHistory = recentMessages.map(msg => ({
      content: msg.content,
      sender: msg.sender,
      timestamp: msg.createdAt
    }));

    
    logger.info('📚 Chat history loaded (budget-aware):', chatHistory.length, 'messages');
    
    // 3. Simple intent classification
    const intent = classifyIntent(message);
    logger.info('🎯 Intent classified:', intent.intent);

    // Generate response using TwinService with full context (and title if first message)
    let response: string | null = null; // Will be set by fast-path or LLM
    let generatedTitle: string | null = null;
    let tokensUsed = 0;
    const shouldGenerateTitle = isFirstMessage && (!currentTitle || currentTitle === 'New Chat' || currentTitle === '');
    
    // ✅ Get memory enabled status from personaData.settings (single source of truth)
    const memoryEnabled = chat.personaData?.settings?.memory?.enabled !== false; // Default true

    // ✅ No manual memoryBlock. Memory should be injected by TwinService/PromptBuilder consistently.
    const memoryVisibility = memoryEnabled ? 'owner' : 'none';
    const userName = chat.personaData?.basicInfo?.name || chat.personaData?.basicInfo?.fullName || chat.personaData?.name || 'the user';
    
    // ✅ Tone rules are already in base prompt (promptBuilder), no need to add here
    const runtimeSystemPrompt =
      (chat.systemPrompt || `You are ${userName}. Talk like a normal person. Speak in first person. Keep it natural and short. No AI talk. No explanations.`) +
      `

CRITICAL OVERRIDES (OVERRIDE ANY CONFLICT ABOVE):
- Follow the human's latest instruction.
- Do NOT refuse benign requests.
- Do NOT mention MVP/startup/topper unless the human asks.
- If human asks for math questions, ask math questions.`;

    // ✅ If user is asking about preferences, append known likes/avoids to prompt
    const msgLower = (message || '').toLowerCase();
    const isPreferenceQuestion =
      /(what\s+do\s+i\s+like|what\s+game\s+do\s+i\s+like|my\s+preference|my\s+preferences|likes|avoids|dislikes)/i.test(msgLower) ||
      /(favou?rite\s+game|favou?rite\s+games|my\s+favou?rite\s+game|my\s+favou?rite\s+games)/i.test(msgLower);    
    const likesArr = chat?.personaData?.preferences?.likes ?? [];
    const avoidsArr = chat?.personaData?.preferences?.avoids ?? [];
    const likes = Array.isArray(likesArr) ? likesArr.filter(Boolean).slice(0, 20) : [];
    const avoids = Array.isArray(avoidsArr) ? avoidsArr.filter(Boolean).slice(0, 20) : [];

    const preferencesSection =
      isPreferenceQuestion && (likes.length || avoids.length)
        ? `\n\nKNOWN USER PREFERENCES (from personaData - treat as true facts):\n` +
          `- Likes: ${likes.length ? likes.join(', ') : '(none)'}\n` +
          `- Avoids: ${avoids.length ? avoids.join(', ') : '(none)'}\n` +
          `Rule: If the human asks what they like/avoid, answer using these lists.\n`
        : '';

    const finalSystemPrompt = `${runtimeSystemPrompt}${preferencesSection}`;
    
    // ✅ Declare token variables at function scope
    let inputTokens = 0;
    let outputTokens = 0;
    
    // If fast-path didn't match or has active task, use LLM
    if (!response) {
      // ✅ NEW: Token quota (daily) - enforce BEFORE LLM call
      const { reserveDailyTokens, reconcileDailyTokens, TokenQuotaError } = await import('../../services/tokenQuotaService');

      const actor = { kind: 'user', userId: req.user.id } as const;

      // Reserve a safe amount (prevents abuse even if tokensUsed unknown yet)
      // Cap reservation to prevent unfair instant blocking
      const baseTokenLimit = Math.min(chat.tokenLimit || 500, 800);
      let reservation: { day: string; actorKey: string; reserved: number } | null = null;
      try {
        reservation = await reserveDailyTokens({
          actor,
          reserveTokens: baseTokenLimit + 600,
        });
      } catch (e: any) {
        if (e instanceof TokenQuotaError) {
          // Format retry time: < 60 min = minutes, >= 60 min = approx hours
          const minutes = Math.floor(e.retryAfterSeconds / 60);
          const retryAfterFormatted = minutes < 60 
            ? `${minutes}m` 
            : `${Math.round(minutes / 60)}h`;
          
          return res.status(e.statusCode).json({
            success: false,
            error: 'Daily token limit reached.',
            errorCode: e.errorCode,
            retryAfter: retryAfterFormatted,
            retryAfterSeconds: e.retryAfterSeconds, // Keep raw seconds for frontend countdown
          });
        }
        throw e;
      }

      try {
        const twinService = new TwinService();
        const draftResult = await twinService.generateDraftWithContext({
          personaData: chat.personaData,
          systemPrompt: finalSystemPrompt, // ✅ use runtime prompt + preferences when needed
          tokenLimit: chat.tokenLimit || 500,
          chatMemory: chatHistory,           // ✅ budget-aware (0/4/10 messages)
          currentMessages: [message],
          twinId: chat.twin_id,
          isFirstMessage: shouldGenerateTitle,
          sessionMemory: sessionMemory, // ✅ Session memory for budget-aware context
          memoryVisibility, // ✅ Use same variable defined above
        });
        
        inputTokens = 0;
        outputTokens = 0;
        if (typeof draftResult === 'object' && draftResult.response && draftResult.title) {
          response = draftResult.response;
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
          response = draftResult.response;
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
          response = draftResult;
          tokensUsed = 0;
          inputTokens = 0;
          outputTokens = 0;
        } else {
          response = "I'm having trouble thinking right now. Could you try again?";
          tokensUsed = 0;
          inputTokens = 0;
          outputTokens = 0;
        }

        // ✅ Reconcile actual tokens used
        if (reservation) {
          await reconcileDailyTokens({
            day: reservation.day,
            actorKey: reservation.actorKey,
            reserved: reservation.reserved,
            actualTokensUsed: tokensUsed || 0,
          });
          
        }
      } catch (error) {
        // If LLM call fails, still reconcile (reduce reserved tokens)
        if (reservation) {
          await reconcileDailyTokens({
            day: reservation.day,
            actorKey: reservation.actorKey,
            reserved: reservation.reserved,
            actualTokensUsed: 0,
          });
        }
        logger.error('TwinService error:', error);
        response = "I'm having trouble thinking right now. Could you try again?";
        tokensUsed = 0;
        inputTokens = 0;
        outputTokens = 0;
      }
    }

    // ✅ MODIFY: Only save user message if NOT regenerating
    if (!regenerate) {
      // 5. Save user message to chat (only if not regenerating)
      try {
        const userMessageId = generateId.message();
        const utcTimestamp = new Date().toISOString();
        await db.query(`
          INSERT INTO "Message" (id, "chatId", content, sender, approved, "createdAt") 
          VALUES ($1, $2, $3, 'human', true, $4::timestamptz)
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
        INSERT INTO "Message" (id, "chatId", content, sender, approved, "createdAt") 
        VALUES ($1, $2, $3, 'twin', true, $4::timestamptz)
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
      `, [runId, chat.twin_id, 'human', inputTokens, outputTokens, 1000]);
      logger.info('✅ AI run logged');
    } catch (error) {
      logger.warn('⚠️ Failed to log AI run:', error);
    }

    // ✅ REMOVED: Early token event logging - will log after memory update with combined totals

    logger.info('🎉 Enhanced reply completed successfully');
    
    // ✅ Post-response cleanup (async) - Session memory update + "remember this"
    (async () => {
      try {
        const memoryTokens = await chatUtils.updateSessionMemory(chatId, chat.twin_id, 'Message', {
          kind: 'user',
          userId: req.user?.id
        });
        
        // ✅ Accumulate all tokens (main response + memory)
        const totalInputTokens = inputTokens + (memoryTokens?.inputTokens || 0);
        const totalOutputTokens = outputTokens + (memoryTokens?.outputTokens || 0);
        const totalAllTokens = totalInputTokens + totalOutputTokens;
        
        // ✅ Log ONE event per message with combined totals
        try {
          await EventLogger.logUserEvent(userId, EVENT_TYPES.LLM_USAGE, {
            chatId: chat.id,
            twinId: chat.twin_id,
            mode: 'enhanced',
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
            totalTokens: totalAllTokens,
            messageId: aiMessageId || null
          });
        } catch (e) {
          logger.warn('Failed to log combined token usage event:', e);
        }

        // ✅ Check if user wants to save something (ChatGPT-style "remember this")
        if (!regenerate) {
          const rememberPatterns = [
            // ✅ Handle typos: remeber, rember, remembr, etc.
            /rememb?e?r\s+(?:that|this|my|i|me|my\s+name|now)/i,
            // ✅ Also match "my name is X" even if "remember" has typos or comes before other words
            /(?:rememb?e?r|remeber|rember)\s+(?:now\s+)?my\s+name\s+is/i,
            // ✅ Original patterns (keep these)
            /remember\s+(?:that|this|my|i|me|my\s+name)/i,
            /save\s+(?:this|it|that|my\s+name)/i,
            /don'?t\s+forget/i,
            /keep\s+in\s+mind/i,
            /memorize/i,
            /store\s+(?:this|it|that)/i,
            /isko\s+yaad\s+rakho/i,
            /yaad\s+rakhna/i
          ];          

          const shouldExtractFacts = rememberPatterns.some(pattern => pattern.test(message));

          if (shouldExtractFacts && chat.twin_id) {
            logger.info('✅ User requested to remember something - extracting facts');
            
            // ✅ Get session memory summary for context
            const sessionMem = await chatUtils.getSessionMemoryForContext(chatId);
            
            // ✅ Build extraction text: include actual message + pinned facts + summary
            // This ensures "remember my name is dada" is always present, not just in summary
            const pinned = sessionMem?.pinnedFacts
              ? `PINNED_FACTS:\n${JSON.stringify(sessionMem.pinnedFacts)}\n\n`
              : '';
            
            const extractionText =
              `REMEMBER_REQUEST_MESSAGE:\n${message}\n\n` +
              pinned +
              `SESSION_STATE_SUMMARY:\n${sessionMem?.summary || '(none)'}\n`;
            
            // Extract facts from combined text (async, don't block response)
            await memoryService.extractLongTermFacts(chat.twin_id, extractionText)
              .then(() => {
                logger.info(`✅ Facts extracted from user's "remember this" request for twin ${chat.twin_id}`);
              })
              .catch(err => logger.error('Fact extraction failed:', err));
          }
        }
      } catch (error) {
        logger.error('Post-response cleanup failed:', error);
      }
    })();

    res.json({
      success: true,
      response: response,
      messageId: aiMessageId, // ✅ ADD: Return message ID for frontend to update dataset
      intent: intent.intent,
      criticScore: null,
      latency: 1000,
      generatedTitle: generatedTitle || null,
      tokensUsed,
      isFirstMessage: isFirstMessage,
      timestamp: new Date().toISOString(), // ✅ ADD: Timestamp for new message
      serverTime: new Date().toISOString() // ✅ ADD: Server time for relative time calculation
    });

  } catch (error) {
    logger.error('Failed to generate enhanced reply:', error);
    return next(error);
  }
};

/**
 * Get chat history for enhanced chat
 */
export const getChatHistory = async (req: any, res: Response, next: NextFunction) => {
  try {
    // 🔥 Accept both :chatToken (new) and :id (old dist)
const rawChatToken = (req.params.chatToken || req.params.id) as string | undefined;
const userId = req.user.id;

 // ✅ SAFETY: If chatToken missing, don't crash – return empty chat instead
 if (!rawChatToken) {
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

// ✅ PHASE 4: Try to detokenize; if fail, fallback to raw ID (private-only)
const decoded = detokenizeId(rawChatToken, { userId, endpoint: 'getChatHistory' });
let chatId = rawChatToken;
if (decoded && decoded.type === 'chat') {
  chatId = decoded.id;
} else {
  logger.warn('[ENHANCED_CHAT] Invalid chat token, using raw ID fallback', {
    rawChatToken,
    userId,
  });
}

    // ✅ ULTRA-DETAILED LOGGING for enhanced-chat API
    try {
      logger.info('[ENHANCED_CHAT:START]', {
        path: req.path,
        method: req.method,
        chatToken: rawChatToken,
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
      logger.warn('[ENHANCED_CHAT] Chat not found, returning empty history', { chatId, userId });
      return res.status(200).json({
        chat: null,
        messages: [],
        serverTime: new Date().toISOString(),
      });    }

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
    logger.error('Failed to get chat history:', error);
    return next(error);
  }
};

/**
 * Apply style correction to current response
 */
export const applyStyleCorrection = async (req: any, res: Response, next: NextFunction) => {
  try {
    const { knob, delta } = styleCorrectionSchema.parse(req.body);
    // 🔥 Accept both :chatToken (new) and :id (old dist)
    const rawChatToken = (req.params.chatToken || req.params.id) as string | undefined;
    const userId = req.user.id;

    if (!rawChatToken) {
      throw createError.validation('Chat token is required', ErrorCodes.INVALID_INPUT);
    }

    // ✅ PHASE 4: Detokenize chatToken to get actual chatId
    const decoded = detokenizeId(rawChatToken);
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
    logger.error('Failed to apply style correction:', error);
    return next(error);
  }
};

/**
 * Add current response as style anchor
 */
export const addToAnchors = async (req: any, res: Response, next: NextFunction) => {
  try {
    const { userUtterance, idealReply } = req.body;
    // 🔥 Accept both :chatToken (new) and :id (old dist)
    const rawChatToken = (req.params.chatToken || req.params.id) as string | undefined;
    const userId = req.user.id;

    if (!rawChatToken) {
      throw createError.validation('Chat token is required', ErrorCodes.INVALID_INPUT);
    }

    // ✅ PHASE 4: Detokenize chatToken to get actual chatId
    const decoded = detokenizeId(rawChatToken);
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
    logger.error('Failed to add style anchor:', error);
    return next(error);
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