import { Response, NextFunction } from 'express';
import { db } from '../../config/database';
import { TwinService } from '../twin/twinService';
import { logger } from '../../config/logger';
import { z } from 'zod';
import { AuthenticatedRequest } from '../../middleware/auth';
import { validateMessageLength, checkBlacklist } from '../../utils/safety';
import { createError, ErrorCodes } from '../../utils/errors';
import * as chatUtils from './chatSharedUtils';
import { verifyTwinOwnership } from '../../utils/twinUtils';
import { generateId } from '../../utils/idGenerator';
import { logEvent } from '../../services/eventLogger';
import { QUERY_LIMITS } from '../../config/constants';
import { normalizeTimestamp, formatRelativeTime } from '../../utils/timestampUtils';
import { detokenizeId, tokenizeId } from '../../utils/idTokenization';
import { EventLogger } from '../../services/eventLogger';
import { EVENT_TYPES } from '../../config/constants';
import { detectFastPathCategory, fastPathReply } from '../../utils/commonMessageFastPath';

const twinService = new TwinService();

const startChatSchema = z.object({
  twinId: z.string().min(1, 'Twin ID is required'),
});

const sendMessageSchema = z.object({
  content: z.string().min(1, 'Message cannot be empty').max(300, 'Message too long (max 300 characters)'),
});

const generateDraftSchema = z.object({
  messages: z.array(z.string()).min(1, 'At least one message required'),
});

// Validation schemas for chat management
const createNewChatSchema = z.object({
  twinId: z.string().min(1, 'Twin ID is required')
});

const updateChatTitleSchema = z.object({
  title: z.string().min(1, 'Title is required').max(100, 'Title too long')
});

const generateTitleSchema = z.object({
  firstMessage: z.string().min(1, 'First message is required')
});

export const startChat = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { twinId } = startChatSchema.parse(req.body);
    
    if (!req.user) {
      throw createError.unauthorized();
    }

    let twin;
    
    // Handle 'latest' twin ID - get the most recent twin for the user
    if (twinId === 'latest') {
      const twinResult = await db.query(`
        SELECT * FROM "Twin"
        WHERE "userId" = $1
        ORDER BY "createdAt" DESC
        LIMIT 1
      `, [req.user.id]);
      twin = twinResult.rows[0];
    } else {
      // Verify specific twin belongs to user
      const twinResult = await db.query(`
        SELECT * FROM "Twin"
        WHERE id = $1 AND "userId" = $2
      `, [twinId, req.user.id]);
      twin = twinResult.rows[0];
    }
    
    if (!twin) {
      throw createError.notFound('Twin not found', ErrorCodes.TWIN_NOT_FOUND);
    }
    
    // Create chat
    const chatId = generateId.chat();
    const utcTimestamp = new Date().toISOString();
    const chatResult = await db.query(`
      INSERT INTO "Chat" (id, "userId", "twinId", "createdAt")
      VALUES ($1, $2, $3, $4::timestamptz)
      RETURNING *
    `, [chatId, req.user.id, twin.id, utcTimestamp]);
    const chat = chatResult.rows[0];
    
    // Log chat started event
    await EventLogger.logChatStarted(req.user.id, chat.id, twin.id, {
      source: 'dashboard'
    });
    
    res.json({
      success: true,
      chatId: tokenizeId(chat.id, 'chat'),
      redirect: `/chat-enhanced?chatId=${tokenizeId(chat.id, 'chat')}`,
    });
  } catch (error) {
    logger.error('Failed to start chat:', error);
    return next(error);
  }
};

export const getChat = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { chatToken } = req.params;
    
    if (!req.user) {
      throw createError.unauthorized();
    }

    if(!chatToken) {
      throw createError.validation('Chat token is required');
    }

     // ✅ PHASE 4: Detokenize chatToken to get actual chatId
     const decoded = detokenizeId(chatToken);
     if (!decoded || decoded.type !== 'chat') {
       throw createError.validation('Invalid chat token', ErrorCodes.INVALID_INPUT);
     }
     const chatId = decoded.id;

    // Get chat with twin information using raw SQL
    const chatResult = await db.query(`
      SELECT c.id, c."userId", c."twinId", c."createdAt", c."chatVector",
             t.id as twin_id, t."styleVector", t."sampleReply"
      FROM "Chat" c
      JOIN "Twin" t ON c."twinId" = t.id
      WHERE c.id = $1 AND c."userId" = $2
    `, [chatId, req.user.id]);
    
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
      createdAt: chat.createdAt,
      chatVector: chat.chatVector,
      twin: {
        publicId: tokenizeId(chat.twin_id, 'twin'),
        styleVector: chat.styleVector,
        sampleReply: chat.sampleReply,
      },
      messages: messagesResult.rows.map(msg => ({
        id: msg.id,
        publicChatId: tokenizeId(msg.chatId, 'chat'),
        sender: msg.sender,
        content: msg.content,
        approved: msg.approved,
        createdAt: msg.createdAt
      }))      
    };
    
    res.json({ chat: chatData });
  } catch (error) {
    logger.error('Failed to get chat:', error);
    return next(error);
  }
};

export const getUserChats = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw createError.unauthorized();
    }

    const chats = await db.query(`
      SELECT c.id, c."twinId", c."title", c."createdAt", c."updatedAt", c."messageCount",
             t.id as twin_id, t."sampleReply",
             m.content as last_message, m."createdAt" as last_message_time
      FROM "Chat" c
      JOIN "Twin" t ON c."twinId" = t.id
      LEFT JOIN LATERAL (
        SELECT content, "createdAt"
        FROM "Message" 
        WHERE "chatId" = c.id 
        ORDER BY "createdAt" DESC 
        LIMIT 1
      ) m ON true
      WHERE c."userId" = $1
      ORDER BY c."updatedAt" DESC, c."createdAt" DESC
    `, [req.user.id]);
    
    // Format response with proper field names (matching frontend expectations)
    const formattedChats = chats.rows.map(chat => ({
      publicId: tokenizeId(chat.id, 'chat'),
      publicTwinId: tokenizeId(chat.twinId, 'twin'),
      title: chat.title || null,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt || chat.createdAt,
      messageCount: chat.messageCount || 0,
      lastMessage: chat.last_message || null,
      twin: {
        publicId: tokenizeId(chat.twin_id, 'twin'),
        sampleReply: chat.sampleReply
      }
    }));
    
    res.json({ chats: formattedChats });
  } catch (error) {
    logger.error('Failed to get chats:', error);
    return next(error);
  }
};

// Get chat history for user (all previous chats)
export const getChatHistory = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    // ✅ Ultra-detailed logging for /api/chats issues (prod vs dev)
    try {
      logger.info('[getChatHistory:START]', {
        path: req.path,
        method: req.method,
        query: req.query,
        userFromReq: req.user
          ? {
              id: req.user.id,
              email: req.user.email,
              handle: req.user.handle,
            }
          : null,
        headers: {
          ifNoneMatch: req.headers['if-none-match'] || null,
          ifModifiedSince: req.headers['if-modified-since'] || null,
          cacheControl: req.headers['cache-control'] || null,
          pragma: req.headers['pragma'] || null,
          accept: req.headers['accept'] || null,
        },
      });
    } catch (logError) {
      logger.warn('[getChatHistory] Failed to log START context:', logError);
    }

    if (!req.user) {
      throw createError.unauthorized();
    }

    const userId = req.user.id;

    // Pagination support with defaults for backward compatibility
    const page = parseInt(req.query['page'] as string) || 1;
    const limit = Math.min(parseInt(req.query['limit'] as string) || 50, 100); // Max 100 per page
    const offset = (page - 1) * limit;

    // Get all user's chats with last message and message count (using chatManagementController format)
    const chatsResult = await db.query(`
      SELECT 
        c.id,
        c."twinId",
        c."title",
        c."summary",
        c."lastMessage",
        c."messageCount",
        c."createdAt",
        c."updatedAt",
        t."sampleReply" as twinName,
        m."createdAt" as last_message_time
      FROM "Chat" c
      JOIN "Twin" t ON c."twinId" = t.id
      LEFT JOIN LATERAL (
        SELECT "createdAt"
        FROM "Message" 
        WHERE "chatId" = c.id 
        ORDER BY "createdAt" DESC 
        LIMIT 1
      ) m ON true
      WHERE c."userId" = $1
      ORDER BY c."updatedAt" DESC, c."createdAt" DESC
      LIMIT $2 OFFSET $3
    `, [userId, limit, offset]);

    // Get total count for pagination metadata
    const totalResult = await db.query(`
      SELECT COUNT(*) as total
      FROM "Chat" c
      WHERE c."userId" = $1
    `, [userId]);

    const chats = chatsResult.rows.map(chat => ({
      publicId: tokenizeId(chat.id, 'chat'),
      publicTwinId: tokenizeId(chat.twinId, 'twin'),
      title: chat.title || 'New Chat',
      summary: chat.summary || '',
      lastMessage: chat.lastMessage ? {
        content: chat.lastMessage,
        createdAt: normalizeTimestamp(chat.last_message_time),
        relativeTime: chat.last_message_time ? formatRelativeTime(chat.last_message_time) : null
      } : null,
      messageCount: chat.messageCount || 0,
      createdAt: normalizeTimestamp(chat.createdAt),
      updatedAt: normalizeTimestamp(chat.updatedAt),
      twinName: chat.twinName || 'AI Twin'
    }));

    const total = parseInt(totalResult.rows[0]?.total || '0', 10);
    
    const responsePayload = {
      success: true,
      chats,
      total: total,
      page: page,
      limit: limit,
      totalPages: Math.ceil(total / limit)
    };

    // ✅ Log response shape before sending
    try {
      logger.info('[getChatHistory:RESPONSE]', {
        userId,
        chatsCount: chats.length,
        total,
        page,
        limit,
        totalPages: responsePayload.totalPages,
        statusBeforeSend: res.statusCode,
      });
    } catch (logError) {
      logger.warn('[getChatHistory] Failed to log RESPONSE context:', logError);
    }

    res.json(responsePayload);

  } catch (error) {
    logger.error('Failed to get chat history:', error);
    return next(error);
  }
};

// Get specific chat with all messages
export const getChatMessages = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { chatToken } = req.params;
    
    if (!req.user) {
      throw createError.unauthorized();
    }

    if (!chatToken) {
      throw createError.validation('Chat token is required');
    }

    // ✅ PHASE 4: Detokenize chatToken to get actual chatId
    const decoded = detokenizeId(chatToken);
    if (!decoded || decoded.type !== 'chat') {
      throw createError.validation('Invalid chat token', ErrorCodes.INVALID_INPUT);
    }
    const chatId = decoded.id;

    // Get chat with twin information using raw SQL
    const chatResult = await db.query(`
      SELECT c.id, c."userId", c."twinId", c."createdAt", c."chatVector",
             t.id as twin_id, t."styleVector", t."sampleReply"
      FROM "Chat" c
      JOIN "Twin" t ON c."twinId" = t.id
      WHERE c.id = $1 AND c."userId" = $2
    `, [chatId, req.user.id]);

    if (chatResult.rows.length === 0) {
      throw createError.notFound('Chat not found', ErrorCodes.CHAT_NOT_FOUND);
    }

    const chat = chatResult.rows[0];

    // Get messages for this chat (only approved messages)
    const messagesResult = await db.query(`
      SELECT id, "chatId", sender, content, approved, "createdAt"
      FROM "Message"
      WHERE "chatId" = $1 AND approved = true
      ORDER BY "createdAt" ASC
    `, [chatId]);

    res.json({
      success: true,
      chat: {
        publicId: tokenizeId(chat.id, 'chat'),
        publicTwinId: tokenizeId(chat.twinId, 'twin'),
        chatVector: chat.chatVector,
        twin: {
          publicId: tokenizeId(chat.twin_id, 'twin'),
          styleVector: chat.styleVector,
          sampleReply: chat.sampleReply,
        },
        messages: messagesResult.rows.map(msg => ({
          id: msg.id,
          publicChatId: tokenizeId(msg.chatId, 'chat'),
          sender: msg.sender,
          content: msg.content,
          approved: msg.approved,
          createdAt: msg.createdAt,
        })),
        createdAt: chat.createdAt,
      },
    });
  } catch (error) {
    logger.error('Failed to get chat messages:', error);
    return next(error);
  }
};

// Continue existing chat or create new one
export const continueChat = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { twinId } = req.body;
    
    if (!req.user) {
      throw createError.unauthorized();
    }

    if (!twinId) {
      throw createError.validation('Twin ID is required');
    }

    let twin;
    
    // Handle 'latest' twin ID - get the most recent twin for the user using raw SQL
    if (twinId === 'latest') {
      const twinResult = await db.query(`
        SELECT id, "userId"
        FROM "Twin"
        WHERE "userId" = $1
        ORDER BY "createdAt" DESC
        LIMIT 1
      `, [req.user.id]);
      twin = twinResult.rows[0];
    } else {
      // Verify specific twin belongs to user using raw SQL
      const twinResult = await db.query(`
        SELECT id, "userId"
        FROM "Twin"
        WHERE id = $1 AND "userId" = $2
      `, [twinId, req.user.id]);
      twin = twinResult.rows[0];
    }
    
    if (!twin) {
      throw createError.notFound('Twin not found', ErrorCodes.TWIN_NOT_FOUND);
    }

    // Find the most recent chat with this twin using raw SQL
    const existingChatResult = await db.query(`
      SELECT c.id, c."userId", c."twinId", c."createdAt", c."chatVector"
      FROM "Chat" c
      WHERE c."userId" = $1 AND c."twinId" = $2
      ORDER BY c."createdAt" DESC
      LIMIT 1
    `, [req.user.id, twin.id]);

    let chat;
    let existingChat = null;
    
    if (existingChatResult.rows.length > 0) {
      // Continue existing chat
      existingChat = existingChatResult.rows[0];
      chat = existingChat;
    } else {
      // Create new chat using raw SQL
      const utcTimestamp = new Date().toISOString();
      const newChatResult = await db.query(`
        INSERT INTO "Chat" ("id", "userId", "twinId", "createdAt")
        VALUES ($1, $2, $3, $4::timestamptz)
        RETURNING id, "userId", "twinId", "createdAt"
      `, [
        generateId.chat(),
        req.user.id,
        twin.id,
        utcTimestamp
      ]);
      chat = newChatResult.rows[0];
    }

    // Log chat continued/started event
    if (existingChat) {
      await EventLogger.logUserEvent(req.user.id, EVENT_TYPES.CHAT_CONTINUED, {
        publicChatId: chat.id,
        publicTwinId: twin.id
      });
    } else {
      await EventLogger.logChatStarted(req.user.id, chat.id, twin.id);
    }

    res.json({
      success: true,
      chatId: tokenizeId(chat.id, 'chat'),
      isNewChat: !existingChat,
      redirect: `/chat-enhanced?chatId=${tokenizeId(chat.id, 'chat')}`,
    });
  } catch (error) {
    logger.error('Failed to continue chat:', error);
    return next(error);
  }
};

export const generateDraft = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { messages } = generateDraftSchema.parse(req.body);
    const { chatToken } = req.params;
    
    if (!req.user) {
      throw createError.unauthorized();
    }

    if (!chatToken) {
      throw createError.validation('Chat token is required');
    }

    // ✅ PHASE 4: Detokenize chatToken to get actual chatId
    const decoded = detokenizeId(chatToken);
    if (!decoded || decoded.type !== 'chat') {
      throw createError.validation('Invalid chat token', ErrorCodes.INVALID_INPUT);
    }
    const chatId = decoded.id;

    // Validate message lengths
    for (const message of messages) {
      if (!validateMessageLength(message)) {
        throw createError.validation('Message length invalid');
      }
    }

    // Get chat and twin using raw SQL
    const chatResult = await db.query(`
      SELECT c.id, c."userId", c."twinId", c."createdAt", c."chatVector",
             t.id as twin_id, t."styleVector", t."sampleReply", t."personaData", t."systemPrompt", t."tokenLimit"
      FROM "Chat" c
      JOIN "Twin" t ON c."twinId" = t.id
      WHERE c.id = $1 AND c."userId" = $2
    `, [chatId, req.user.id]);
    
    if (chatResult.rows.length === 0) {
      throw createError.notFound('Chat not found', ErrorCodes.CHAT_NOT_FOUND);
    }
    
    const chat = chatResult.rows[0];
    
    // Get chat messages for context using raw SQL
    const chatMessagesResult = await db.query(`
      SELECT content, sender, "createdAt"
      FROM "Message"
      WHERE "chatId" = $1
      ORDER BY "createdAt" ASC
    `, [chat.id]);
    
    const chatMessages = chatMessagesResult.rows;

    // Get session memory for context
    const sessionMemory = await chatUtils.getSessionMemoryForContext(chat.id).catch(() => null);

    // Create context with style vector + chat memory + user query
    const context = {
      styleVector: chat.styleVector as any,
      personaData: chat.personaData as any,
      systemPrompt: chat.systemPrompt as string,
      tokenLimit: chat.tokenLimit as number,
      chatVector: chat.chatVector as any,
      chatMemory: chatMessages.map(msg => ({
        content: msg.content,
        sender: msg.sender,
        timestamp: msg.createdAt
      })),
      currentMessages: messages,
      twinId: chat.twinId, // Add twinId for memory retrieval
      sessionMemory // Add session memory for context
    };

    // ✅ Token quota enforcement for draft generation
    const { reserveDailyTokens, reconcileDailyTokens, TokenQuotaError } = await import('../../services/tokenQuotaService');
    const actor = { kind: 'user', userId: req.user.id } as const;

    // Cap reservation so it doesn't block unfairly
    const baseTokenLimit = Math.min(chat.tokenLimit || 500, 800);

    let reservation: { day: string; actorKey: string; reserved: number } | null = null;
    try {
      reservation = await reserveDailyTokens({ actor, reserveTokens: baseTokenLimit + 600 });
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

    let draftResult: any;
    try {
      // Generate draft with full context
      draftResult = await twinService.generateDraftWithContext(context);
    } finally {
      // Reconcile actual tokens used
      const tokensUsed =
        typeof draftResult === 'object' && draftResult
          ? (draftResult.tokensUsed || 0)
          : 0;

      if (reservation) {
        await reconcileDailyTokens({
          day: reservation.day,
          actorKey: reservation.actorKey,
          reserved: reservation.reserved,
          actualTokensUsed: tokensUsed,
        });
      }
    }

    // Handle both string and object response
    const draft = typeof draftResult === 'object' && draftResult.response 
      ? draftResult.response 
      : (typeof draftResult === 'string' ? draftResult : '');
    
    // Log draft generated event
      await EventLogger.logUserEvent(req.user.id, EVENT_TYPES.DRAFT_GENERATED, {
        publicChatId: chat.id,
        publicTwinId: chat.twinId
      });
    
    res.json({ draft });
  } catch (error) {
    logger.error('Failed to generate draft:', error);
    return next(error);
  }
};

export const sendMessage = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { content } = sendMessageSchema.parse(req.body);
    const { chatToken } = req.params;
    
    if (!req.user) {
      throw createError.unauthorized();
    }

    // Validate message
    if (!validateMessageLength(content)) {
      throw createError.validation('Message length invalid');
    }

    // ❌ Pehle yaha error throw hota tha
    // if (checkBlacklist(content)) {
    //   throw createError.validation('Message contains restricted content');
    // }

    // ✅ Ab: restricted content → NO error, sirf default reply + event
    if (checkBlacklist(content)) {
      await EventLogger.logUserEvent(req.user.id, EVENT_TYPES.MESSAGE_BLOCKED, {
        reason: 'restricted_content',
        source: 'private_chat_send',
      });

      return res.json({
        success: true,
        blocked: true,
        response: "Sorry, I can't answer this like this. Please try asking in a different way.",
      });
    }

    if (!chatToken) {
      throw createError.validation('Chat token is required');
    }

    // ✅ PHASE 4: Detokenize chatToken to get actual chatId
    const decoded = detokenizeId(chatToken);
    if (!decoded || decoded.type !== 'chat') {
      throw createError.validation('Invalid chat token', ErrorCodes.INVALID_INPUT);
    }
    const chatId = decoded.id;

    // Get chat using raw SQL
    const chatResult = await db.query(`
      SELECT id, "userId", "twinId"
      FROM "Chat"
      WHERE id = $1 AND "userId" = $2
    `, [chatId, req.user.id]);
    
    if (chatResult.rows.length === 0) {
      throw createError.notFound('Chat not found', ErrorCodes.CHAT_NOT_FOUND);
    }
    
    const chat = chatResult.rows[0];
    
    // Save message using raw SQL
    const utcTimestamp = new Date().toISOString();
    const messageResult = await db.query(`
      INSERT INTO "Message" ("id", "chatId", sender, content, approved, "createdAt")
      VALUES ($1, $2, $3, $4, $5, $6::timestamptz)
      RETURNING id, "chatId", sender, content, approved, "createdAt"
    `, [
      generateId.message(),
      chat.id,
      'twin',
      content,
      true,
      utcTimestamp
    ]);
    
    const message = messageResult.rows[0];

    // Log message approved event using raw SQL
    await EventLogger.logMessageApproved(req.user.id, chat.id, {
      messageLength: message.content?.length || 0
    });

    // MVP (personaData-only): Disable automatic styleVector updates.
    // Style adaptation via chats will be revisited when we have a dedicated model / budget.
    
    res.json({
      success: true,
      message: {
        id: message.id,
        publicChatId: tokenizeId(chat.id, 'chat'),
        content: message.content,
        sender: message.sender,
        createdAt: message.createdAt,
      },
    });
  } catch (error) {
    logger.error('Failed to send message:', error);
    return next(error);
  }
};

// New function to handle user messages and generate AI responses
export const handleUserMessage = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { message } = req.body;
    const { chatToken } = req.params;
    
    if (!req.user) {
      throw createError.unauthorized();
    }

    // ❌ Pehle direct throw hota tha:
    // chatUtils.validateMessage(message);

    // ✅ Ab: restricted content pe error nahi jaayega bahar, yahi handle hoga
    try {
      chatUtils.validateMessage(message);
    } catch (err: any) {
      if (err && err.message === 'Message contains restricted content') {
        await EventLogger.logUserEvent(req.user.id, EVENT_TYPES.MESSAGE_BLOCKED, {
          reason: 'restricted_content',
          source: 'enhanced_chat',
        });

        return res.json({
          success: true,
          blocked: true,
          response: "Sorry, I can't answer this like this. Please try asking in a different way.",
        });
      }

      // Baaki saare validation errors normal flow pe hi jaayen
      throw err;
    }

    if (!chatToken) {
      throw createError.validation('Chat token is required');
    }

    // ✅ PHASE 4: Detokenize chatToken to get actual chatId
    const decoded = detokenizeId(chatToken);
    if (!decoded || decoded.type !== 'chat') {
      throw createError.validation('Invalid chat token', ErrorCodes.INVALID_INPUT);
    }
    const chatId = decoded.id;

    // Get chat with twin information
    const chatResult = await db.query(`
      SELECT c.id, c."userId", c."twinId", c."createdAt", c."chatVector",
             t.id as twin_id, t."styleVector", t."sampleReply", t."instructions", 
             t."personaData", t."systemPrompt", t."tokenLimit"
      FROM "Chat" c
      JOIN "Twin" t ON c."twinId" = t.id
      WHERE c.id = $1 AND c."userId" = $2
    `, [chatId, req.user.id]);
    
    let chat;
    if (chatResult.rows.length === 0) {
      logger.info('Chat not found, creating new chat for user:', { chatId: chatId, userId: req.user.id });
      
      // Get user's latest twin with all persona data
      const twinResult = await db.query(`
        SELECT id, "styleVector", "sampleReply", "instructions", "personaData", "systemPrompt", "tokenLimit"
        FROM "Twin"
        WHERE "userId" = $1
        ORDER BY "createdAt" DESC
        LIMIT 1
      `, [req.user.id]);
      
      if (twinResult.rows.length === 0) {
        logger.error('No twin found for user:', req.user.id);
        throw createError.notFound('No twin found. Please create a twin first.', ErrorCodes.TWIN_NOT_FOUND);
      }
      
      const twin = twinResult.rows[0];
      logger.info('Found twin for new chat:', twin.id);
      
      // Create new chat with the provided chatId (from token)
      const utcTimestamp = new Date().toISOString();
      const newChatResult = await db.query(`
        INSERT INTO "Chat" ("id", "userId", "twinId", "createdAt")
        VALUES ($1, $2, $3, $4::timestamptz)
        RETURNING id, "userId", "twinId", "createdAt"
      `, [chatId, req.user.id, twin.id, utcTimestamp]);
      
      if (newChatResult.rows.length === 0) {
        logger.error('Failed to create new chat');
        throw createError.internal('Failed to create chat');
      }
      
      const newChat = newChatResult.rows[0];
      logger.info('New chat created:', newChat.id);
      
      // Log chat started event
      try {
        await EventLogger.logChatStarted(req.user.id, newChat.id, twin.id);
        logger.info('Chat started event logged');
      } catch (error) {
        logger.error('Failed to log chat started event:', error);
      }
      
      // Update chat variable to use the new chat
      chatResult.rows = [{
        id: newChat.id,
        userId: newChat.userId,
        twinId: newChat.twinId,
        createdAt: newChat.createdAt,
        chatVector: null, // New chat has no chatVector yet
        twin_id: twin.id,
        styleVector: twin.styleVector,
        sampleReply: twin.sampleReply,
        instructions: twin.instructions,
        personaData: twin.personaData,
        systemPrompt: twin.systemPrompt,
        tokenLimit: twin.tokenLimit
      }];
    }

    chat = chatResult.rows[0];
    logger.info('Chat found:', { 
      chatId: chat.id, 
      twinId: chat.twinId, 
      userId: chat.userId,
      styleVector: chat.styleVector 
    });

    // ✅ Use shared moderation check
    const moderation = await chatUtils.checkModerationAndApprove(
      message,
      chat.twinId,
      req.user.id
    );

    if (!moderation.approved) {
      logger.warn('Message rejected by moderation:', {
        message: message.substring(0, 50),
        reasons: moderation.moderationResult.reasons,
        userId: req.user.id,
        chatId: chat.id
      });
      
      return res.status(400).json(
        chatUtils.getModerationRejectionResponse(moderation.moderationResult)
      );
    }

    // ✅ FAST-PATH: Check for common messages BEFORE any expensive operations
    // This must happen BEFORE session memory, message fetching, context building
    const fastPathCategory = detectFastPathCategory(message || '');
    if (fastPathCategory) {
      logger.info('[FAST-PATH] Common message detected (PRIVATE_CHAT):', {
        category: fastPathCategory,
        message: message.substring(0, 50),
        chatId: chat.id,
        userId: req.user.id,
        tokensSaved: 'YES - No LLM call'
      });

      const aiResponse = fastPathReply(fastPathCategory, chat.personaData);

      // Get minimal chat info for fast-path
      const chatInfoResult = await db.query(`
        SELECT "messageCount", "title"
        FROM "Chat"
        WHERE id = $1
      `, [chat.id]);

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

      // Create request ID for fast-path
      const requestId = chatUtils.createRequestId(req.user.id);

      // Save user + AI messages exactly like normal flow
      const userMessage = await chatUtils.saveUserMessage({
        chatId: chat.id,
        message,
        approved: moderation.approved,
        requestId,
        messageTable: 'Message',
        messageIdPrefix: 'msg'
      });

      const aiMessage = await chatUtils.saveAIMessage({
        chatId: chat.id,
        aiResponse,
        messageTable: 'Message',
        messageIdPrefix: 'msg'
      });

      // ✅ IMPORTANT: Update chat metadata so chat list / lastMessage stays correct.
      // We intentionally do NOT update session memory/summary here (no LLM, no extra token cost).
      await chatUtils.updateChatMetadata({
        chatId: chat.id,
        chatTable: 'Chat',
        generatedTitle,
        isFirstMessage,
        currentTitle,
        userMessage: message,
        aiResponse,
        tokensUsed: 0
      });

      logger.info('[FAST-PATH] Response sent without LLM (PRIVATE_CHAT - FALLBACK):', {
        category: fastPathCategory,
        tokensUsed: 0,
        chatId: chat.id,
        userId: req.user.id,
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
          publicChatId: tokenizeId(chat.id, 'chat'),
          content: userMessage.content,
          sender: userMessage.sender,
          createdAt: userMessage.createdAt,
        },
        aiMessage: {
          id: aiMessage.id,
          publicChatId: tokenizeId(chat.id, 'chat'),
          content: aiMessage.content,
          sender: aiMessage.sender,
          createdAt: aiMessage.createdAt,
        },
      });
    }

    // ✅ Check first message and title (only if fast-path didn't match)
    const [isFirstMessage, currentTitle] = await Promise.all([
      chatUtils.checkFirstMessage(chat.id, 'Message'),
      chatUtils.getChatTitle(chat.id, 'Chat')
    ]);
    
    // ✅ Always generate title for first message (even if title is "New Chat")
    const shouldGenerateTitle = isFirstMessage === true;

    // ✅ Get session memory first (needed for budget-aware context)
    const sessionMemory = await chatUtils.getSessionMemoryForContext(chat.id).catch(() => null);
    console.log('[PRIVATE_CHAT] [HYP-F] [HYP-G] Session memory check:', {
      chatId: chat.id,
      hasSummary: !!sessionMemory?.summary,
      summaryLength: sessionMemory?.summary?.length || 0
    });

    // ✅ Budget-aware: only fetch recent messages if needed (not always 10)
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

      if (/(rewrite|rephrase|edit|correct|fix this|above text)/i.test(t)) return true;
      return false;
    })();
    console.log('[PRIVATE_CHAT] [HYP-G] needsRecent detection:', {
      message: message.substring(0, 50),
      needsRecent,
      reason: message.length <= 12 ? 'short message' : 
              /(same|continue|as above|that|this|it|wahi|haan|han|ok|kar do|kardo|continue karo)/i.test(message) ? 'reference detected' :
              /(rewrite|rephrase|edit|correct|fix this|above text)/i.test(message) ? 'edit request' : 'clear standalone'
    });

    // If summary exists and user message is clear → send zero raw history
    // Else send a small slice (not 10 always)
    const recentLimit = sessionMemory?.summary
      ? (needsRecent ? 4 : 0)
      : 10;
    console.log('[PRIVATE_CHAT] [HYP-G] Budget-aware message fetching:', {
      hasSummary: !!sessionMemory?.summary,
      needsRecent,
      recentLimit,
      reason: !sessionMemory?.summary ? 'no summary → fetch 10' :
              needsRecent ? 'needsRecent=true → fetch 4' : 'needsRecent=false → fetch 0 (use summary only)'
    });

    const recentMessages = recentLimit > 0
      ? await chatUtils.getRecentMessages(chat.id, 'Message', recentLimit)
      : [];
    console.log('[PRIVATE_CHAT] [HYP-I] Recent messages fetched:', recentMessages.length, 'messages');
    console.log('[PRIVATE_CHAT] [HYP-I] Full message history NOT fetched (optimization)');

    // ✅ Create request ID and check duplicate
    const requestId = chatUtils.createRequestId(req.user.id);
    const duplicateCheck = await chatUtils.checkDuplicateRequest(chat.id, requestId, 'Message');
    
    if (duplicateCheck.isDuplicate) {
      logger.info('Duplicate requestId detected:', requestId);
      return res.json({
        success: true,
        duplicate: true,
        message: 'Message already sent.',
        userMessage: {
          id: duplicateCheck.existingMessage!.id,
          content: duplicateCheck.existingMessage!.content,
          sender: duplicateCheck.existingMessage!.sender,
          createdAt: duplicateCheck.existingMessage!.createdAt,
        },
        aiMessage: null
      });
    }

    // ✅ Build context
    console.log('[PRIVATE_CHAT] [HYP-A] Loading personaData and systemPrompt from chat:', {
      hasPersonaData: !!chat.personaData,
      hasSystemPrompt: !!chat.systemPrompt,
      systemPromptLength: chat.systemPrompt?.length || 0
    });
    const context = chatUtils.buildChatContext({
      styleVector: chat.styleVector,
      personaData: chat.personaData,
      systemPrompt: chat.systemPrompt,
      tokenLimit: chat.tokenLimit,
      chatMemory: recentMessages.map(msg => ({
        content: msg.content,
        sender: msg.sender,
        timestamp: msg.createdAt
      })),
      currentMessages: [message.trim()],
      twinId: chat.twinId,
      isFirstMessage: shouldGenerateTitle,
      chatVector: chat.chatVector,
      sessionMemory: sessionMemory
    });
    console.log('[PRIVATE_CHAT] [HYP-I] Context built - sending to API:', {
      summaryExists: !!sessionMemory?.summary,
      recentMessagesCount: recentMessages.length,
      currentMessage: message.trim().substring(0, 50),
      fullHistorySent: false
    });

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

    // ✅ Generate AI response
    let aiResponse: string;
    let generatedTitle: string | null;
    let tokensUsed: number;
    try {
      const result = await chatUtils.generateAIResponse(context);
      aiResponse = result.aiResponse;
      generatedTitle = result.generatedTitle;
      tokensUsed = result.tokensUsed || 0;
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
      throw error;
    }

    // ✅ Reconcile actual tokens used
    if (reservation) {
      await reconcileDailyTokens({
        day: reservation.day,
        actorKey: reservation.actorKey,
        reserved: reservation.reserved,
        actualTokensUsed: tokensUsed || 0,
      });
      
      // ✅ Log main response token usage
      console.log('[TOKEN_USAGE] [MAIN_RESPONSE] Private Chat:', {
        chatId: chat.id,
        userId: req.user.id,
        reserved: reservation.reserved,
        actualUsed: tokensUsed || 0,
        delta: (tokensUsed || 0) - reservation.reserved
      });
    }

    // ✅ Save messages
    const userMessage = await chatUtils.saveUserMessage({
      chatId: chat.id,
      message,
      approved: moderation.approved,
      requestId,
      messageTable: 'Message',
      messageIdPrefix: 'msg'
    });

    const aiMessage = await chatUtils.saveAIMessage({
      chatId: chat.id,
      aiResponse,
      messageTable: 'Message',
      messageIdPrefix: 'msg'
    });

    // ✅ Send response immediately
    res.json({
      success: true,
      response: aiResponse,
      generatedTitle: generatedTitle || null,
      isFirstMessage: isFirstMessage,
      userMessage: {
        id: userMessage.id,
        publicChatId: tokenizeId(chat.id, 'chat'),
        content: userMessage.content,
        sender: userMessage.sender,
        createdAt: userMessage.createdAt,
      },
      aiMessage: {
        id: aiMessage.id,
        publicChatId: tokenizeId(chat.id, 'chat'),
        content: aiMessage.content,
        sender: aiMessage.sender,
        createdAt: aiMessage.createdAt,
      },
    });

    // ✅ Post-response cleanup (async)
    (async () => {
      try {
        const userId = req.user?.id;
        if (!userId) return;

        await Promise.all([
          // Update metadata
          chatUtils.updateChatMetadata({
            chatId: chat.id,
            chatTable: 'Chat',
            generatedTitle,
            isFirstMessage,
            currentTitle,
            userMessage: message,
            aiResponse,
            lastMessageField: 'lastMessage',
            updatedAtField: 'updatedAt'
          }),

          // Log event
          await EventLogger.logUserEvent(userId, EVENT_TYPES.CHAT_MESSAGE, { chatId: chat.id, twinId: chat.twinId, userMessageId: userMessage.id, aiMessageId: aiMessage.id }),

          // MVP (personaData-only): Disable automatic styleVector updates.

          // Update chat vector
          updateChatVectorAfterMessage(chat.id, [userMessage, aiMessage]).catch(err => 
            logger.warn('Chat vector update failed:', err)
          )
        ]);

        // Update session memory (delta + useful-only, works for private chat)
        console.log('[PRIVATE_CHAT] [HYP-C] [HYP-H] Updating session memory (delta mode)');
        await chatUtils.updateSessionMemory(chat.id, chat.twinId, 'Message', {
          kind: 'user',
          userId: req.user?.id
        });
        console.log('[PRIVATE_CHAT] [HYP-C] [HYP-H] Session memory update completed');

        // ✅ Check if user wants to save something (ChatGPT-style "remember this")
        const rememberPatterns = [
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
        console.log('[PRIVATE_CHAT] [HYP-D] "Remember this" detection:', {
          message: message.substring(0, 50),
          shouldExtractFacts,
          patternMatched: shouldExtractFacts
        });

        if (shouldExtractFacts && chat.twinId) {
          logger.info('✅ User requested to remember something - extracting facts');
          console.log('[PRIVATE_CHAT] [HYP-D] Triggering fact extraction for twin:', chat.twinId);
          
          // ✅ Get session memory summary for context
          const sessionMem = await chatUtils.getSessionMemoryForContext(chat.id);
          if (sessionMem?.summary) {
            // Extract facts from summary (async, don't block response)
            const { memoryService } = await import('../../services/memoryService');
            memoryService.extractLongTermFacts(chat.twinId, sessionMem.summary)
              .then(() => {
                logger.info(`✅ Facts extracted from user's "remember this" request for twin ${chat.twinId}`);
              })
              .catch(err => logger.error('Fact extraction failed:', err));
          } else {
            // ✅ If no summary yet, extract from current message + recent context
            const recentMessages = await chatUtils.getRecentMessages(chat.id, 'Message', 5);
            const contextText = recentMessages.map(m => m.content).join('\n');
            
            const { memoryService } = await import('../../services/memoryService');
            memoryService.extractLongTermFacts(chat.twinId, contextText)
              .then(() => {
                logger.info(`✅ Facts extracted from recent context for twin ${chat.twinId}`);
              })
              .catch(err => logger.error('Fact extraction failed:', err));
          }
        }
      } catch (error) {
        logger.error('Post-response cleanup failed:', error);
      }
    })();
  } catch (error) {
    logger.error('Failed to handle user message:', error);
    return next(error);
  }
};

/**
 * Update chat metadata when new message is added
 * @deprecated This function is no longer used. Title generation is now handled
 * directly in handleUserMessage using the same OpenAI call that generates the response.
 * This function made a separate API call which caused issues.
 */


// MVP (personaData-only): Legacy style vector update disabled.
// Style adaptation via chats will be revisited when we have a dedicated model / budget.
async function updateStyleVectorAfterChat(_twinId: string, _userId: string): Promise<void> {
  logger.debug('MVP: updateStyleVectorAfterChat() disabled (personaData-only mode)');
}

// Helper function to update chat vector after new messages
async function updateChatVectorAfterMessage(chatId: string, newMessages: Array<{content: string, sender: string, createdAt: Date}>) {
  try {
    logger.info('Starting chat vector update for chat:', chatId);
    
    // Get current chat vector
    const chatResult = await db.query(`
      SELECT "chatVector"
      FROM "Chat"
      WHERE id = $1
    `, [chatId]);
    
    if (chatResult.rows.length === 0) {
      logger.warn('Chat not found for chat vector update:', chatId);
      return;
    }

    const currentChatVector = chatResult.rows[0].chatVector;
    
    // Get all messages from this chat for context
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

    let updatedChatVector;
    
    if (currentChatVector) {
      // Update existing chat vector
      const newMessagesWithTimestamp = newMessages.map(msg => ({
        content: msg.content,
        sender: msg.sender,
        timestamp: msg.createdAt
      }));
      updatedChatVector = await twinService.updateChatVector(currentChatVector, newMessagesWithTimestamp);
    } else {
      // Generate new chat vector
      updatedChatVector = await twinService.generateChatVector(allMessages);
    }

    // Save updated chat vector to database
    const utcTimestamp = new Date().toISOString();
    await db.query(`
      UPDATE "Chat"
      SET "chatVector" = $1, "updatedAt" = $2::timestamptz
      WHERE id = $3
    `, [JSON.stringify(updatedChatVector), utcTimestamp, chatId]);

    logger.info('Chat vector updated successfully for chat:', chatId);
  } catch (error) {
    logger.error('Error updating chat vector:', error);
  }
}

// Delete chat
export const deleteChat = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { chatToken } = req.params;
    
    if (!req.user) {
      throw createError.unauthorized();
    }

    if (!chatToken) {
      throw createError.validation('Chat token is required');
    }

    // ✅ PHASE 4: Detokenize chatToken to get actual chatId
    const decoded = detokenizeId(chatToken);
    if (!decoded || decoded.type !== 'chat') {
      throw createError.validation('Invalid chat token', ErrorCodes.INVALID_INPUT);
    }
    const chatId = decoded.id;

    // Verify chat belongs to user
    const chatResult = await db.query(`
      SELECT id, "userId" FROM "Chat" WHERE id = $1
    `, [chatId]);
    
    if (chatResult.rows.length === 0) {
      throw createError.notFound('Chat not found', ErrorCodes.CHAT_NOT_FOUND);
    }
    
    const chat = chatResult.rows[0];
    
    // Verify ownership
    if (chat.userId !== req.user.id) {
      throw createError.unauthorized('You do not have permission to delete this chat');
    }
    
    // Delete chat (CASCADE will automatically delete all messages and related data)
    await db.query(`
      DELETE FROM "Chat" WHERE id = $1
    `, [chatId]);
    
    // Log event
    try {
      await EventLogger.logUserEvent(req.user.id, EVENT_TYPES.CHAT_DELETED, { chatId });
    } catch (error) {
      logger.warn('Failed to log chat deletion event:', error);
    }
    
    logger.info('Chat deleted successfully:', { chatId: chatId, userId: req.user.id });
    
    res.json({
      success: true,
      message: 'Chat deleted successfully'
    });
  } catch (error) {
    logger.error('Failed to delete chat:', error);
    return next(error);
  }
};

/**
 * Create new chat (from chatManagementController)
 */
// Create new chat (one twin per user – ignore client twinId)
export const createNewChat = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw createError.unauthorized();
    }

    const userId = req.user.id;

    // 🔥 Always pick latest twin for this user (MVP: one twin per user)
    const twinResult = await db.query(
      `
      SELECT id
      FROM "Twin"
      WHERE "userId" = $1
      ORDER BY "createdAt" DESC
      LIMIT 1
      `,
      [userId],
    );

    if (twinResult.rows.length === 0) {
      throw createError.notFound('Twin not found or access denied', ErrorCodes.TWIN_NOT_FOUND);
    }

    const twinId = twinResult.rows[0].id;

    // Create new chat
    const chatId = generateId.chat();
    const utcTimestamp = new Date().toISOString();
    const chatResult = await db.query(
      `
      INSERT INTO "Chat" (id, "userId", "twinId", "title", "messageCount", "createdAt", "updatedAt")
      VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $6::timestamptz)
      RETURNING id, "twinId", "title", "messageCount", "createdAt"
      `,
      [chatId, userId, twinId, 'New Chat', 0, utcTimestamp],
    );

    const chat = chatResult.rows[0];

    await EventLogger.logUserEvent(userId, EVENT_TYPES.CHAT_CREATED, {
      publicChatId: chat.id,
      publicTwinId: chat.twinId,
    });

    const publicChatId = tokenizeId(chat.id, 'chat');
    const publicTwinId = tokenizeId(chat.twinId, 'twin');

    res.json({
      success: true,
      chatId: publicChatId,
      chat: {
        publicId: publicChatId,
        publicTwinId: publicTwinId,
        title: chat.title,
        messageCount: chat.messageCount,
        createdAt: chat.createdAt,
      },
      redirect: `/chat-enhanced?chatId=${publicChatId}`,
    });
  } catch (error) {
    logger.error('Failed to create new chat:', error);
    return next(error);
  }
};


/**
 * Update chat title (from chatManagementController)
 */
export const updateChatTitle = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw createError.unauthorized();
    }

    // ✅ tokenized id (chat_xxx...) ko detokenize karo
    const rawId = req.params.id;
    if (!rawId) {
      throw createError.validation('Chat token is required', ErrorCodes.INVALID_INPUT);
    }

    const decoded = detokenizeId(rawId);
    if (!decoded || decoded.type !== 'chat') {
      throw createError.validation('Invalid chat token', ErrorCodes.INVALID_INPUT);
    }
    const chatId = decoded.id;

    const { title } = updateChatTitleSchema.parse(req.body);
    const userId = req.user.id;

    const chatResult = await db.query(`
      SELECT id FROM "Chat" WHERE id = $1 AND "userId" = $2
    `, [chatId, userId]);

    if (chatResult.rows.length === 0) {
      throw createError.notFound('Chat not found', ErrorCodes.CHAT_NOT_FOUND);
    }

    const utcTimestamp = new Date().toISOString();
    await db.query(`
      UPDATE "Chat" SET "title" = $1, "updatedAt" = $2::timestamptz WHERE id = $3
    `, [title, utcTimestamp, chatId]);

    res.json({
      success: true,
      message: 'Chat title updated successfully'
    });

  } catch (error) {
    logger.error('Failed to update chat title:', error);
    return next(error);
  }
};

/**
 * Generate chat title using AI (from chatManagementController)
 */
export const generateChatTitle = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw createError.unauthorized();
    }

    const rawId = req.params.id;
    if (!rawId) {
      throw createError.validation('Chat token is required', ErrorCodes.INVALID_INPUT);
    }

    const decoded = detokenizeId(rawId);
    if (!decoded || decoded.type !== 'chat') {
      throw createError.validation('Invalid chat token', ErrorCodes.INVALID_INPUT);
    }
    const chatId = decoded.id;

    const { firstMessage } = generateTitleSchema.parse(req.body);
    const userId = req.user.id;

    const chatResult = await db.query(`
      SELECT id FROM "Chat" WHERE id = $1 AND "userId" = $2
    `, [chatId, userId]);

    if (chatResult.rows.length === 0) {
      throw createError.notFound('Chat not found', ErrorCodes.CHAT_NOT_FOUND);
    }

    // ✅ Token quota enforcement for title generation
    const { reserveDailyTokens, reconcileDailyTokens, TokenQuotaError } = await import('../../services/tokenQuotaService');
    const actor = { kind: 'user', userId } as const;

    // Reserve small amount; title calls are tiny
    let reservation: { day: string; actorKey: string; reserved: number } | null = null;
    try {
      reservation = await reserveDailyTokens({ actor, reserveTokens: 200 });
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

    let title = 'New Chat';
    let tokensUsedForTitle = 0;

    try {
      // Generate title using AI
      const titleResult = await generateTitleFromMessage(firstMessage);
      title = titleResult.title;
      tokensUsedForTitle = titleResult.tokensUsed || 0;
    } finally {
      // Reconcile actual tokens used
      if (reservation) {
        await reconcileDailyTokens({
          day: reservation.day,
          actorKey: reservation.actorKey,
          reserved: reservation.reserved,
          actualTokensUsed: tokensUsedForTitle,
        });
      }
    }

    // Update chat title
    const utcTimestamp = new Date().toISOString();
    await db.query(`
      UPDATE "Chat" SET "title" = $1, "updatedAt" = $2::timestamptz WHERE id = $3
    `, [title, utcTimestamp, chatId]);

    res.json({
      success: true,
      title,
      message: 'Chat title generated successfully'
    });

  } catch (error) {
    logger.error('Failed to generate chat title:', error);
    return next(error);
  }
};

/**
 * Get chat summary (from chatManagementController)
 */
export const getChatSummary = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw createError.unauthorized();
    }

    const rawId = req.params.id;
    if (!rawId) {
      throw createError.validation('Chat token is required', ErrorCodes.INVALID_INPUT);
    }

    const decoded = detokenizeId(rawId);
    if (!decoded || decoded.type !== 'chat') {
      throw createError.validation('Invalid chat token', ErrorCodes.INVALID_INPUT);
    }
    const chatId = decoded.id;

    const userId = req.user.id;

    const chatResult = await db.query(`
      SELECT id, "summary" FROM "Chat" WHERE id = $1 AND "userId" = $2
    `, [chatId, userId]);

    if (chatResult.rows.length === 0) {
      throw createError.notFound('Chat not found', ErrorCodes.CHAT_NOT_FOUND);
    }

    const chat = chatResult.rows[0];

    res.json({
      success: true,
      summary: chat.summary || 'No summary available'
    });

  } catch (error) {
    logger.error('Failed to get chat summary:', error);
    return next(error);
  }
};

/**
 * Helper function to generate title from message using AI (from chatManagementController)
 * Returns both title and tokensUsed for quota reconciliation
 */
async function generateTitleFromMessage(message: string): Promise<{ title: string; tokensUsed: number }> {
  try {
    // COMMENTED OUT: OpenAI inline import - Now using Groq via llmClient
    // const { OpenAI } = await import('openai');
    // const openai = new OpenAI({
    //   apiKey: process.env.OPENAI_API_KEY
    // });

    // const completion = await openai.chat.completions.create({
    //   model: 'gpt-3.5-turbo',
    //   messages: [{
    //     role: 'system',
    //     content: `Generate a short, descriptive title (max 30 characters) for a chat that starts with: "${message}"`
    //   }],
    //   max_tokens: 20,
    //   temperature: 0.3
    // });

    // NEW: Using Groq via llmClient
    const { llmClient } = await import('../../services/llmClient');
    const llmResponse = await llmClient.generateResponse([
      {
        role: 'system',
        content: `Generate a short, descriptive title (max 30 characters) for a chat that starts with: "${message}"`
      }
    ], {
      maxTokens: 20,
      temperature: 0.3
    });

    const title = llmResponse.content.trim() || 'New Chat';
    const finalTitle = title.length > 30 ? title.substring(0, 30) + '...' : title;
    const tokensUsed = llmResponse.tokensUsed || 0;

    return { title: finalTitle, tokensUsed };

  } catch (error) {
    logger.error('AI title generation failed:', error);
    // Fallback to simple title
    const fallbackTitle = message.length > 30 ? message.substring(0, 30) + '...' : message;
    return { title: fallbackTitle, tokensUsed: 0 };
  }
}