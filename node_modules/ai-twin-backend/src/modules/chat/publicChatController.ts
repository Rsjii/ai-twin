import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth';
import { db, publicChatQueries } from '../../config/database';
import { logger } from '../../config/logger';
import { EventLogger } from '../../services/eventLogger';
import { TwinService } from '../twin/twinService';
import { z } from 'zod';
import { checkBlacklist, validateMessageLength } from '../../utils/safety';
import { AppError, createError, ErrorCodes } from '../../utils/errors';
import { moderateContentSync, getModerationSettings } from '../moderation/moderationController';
import * as chatUtils from './chatSharedUtils';

// Validation schemas
const startPublicChatSchema = z.object({
  twinId: z.string().min(1, 'Twin ID is required'),
  visitorId: z.string().nullish()
});

const sendPublicMessageSchema = z.object({
  message: z.string()
    .min(1, 'Message cannot be empty')
    .max(1000, 'Message must be less than 1000 characters')
});

// Twin service instance
const twinService = new TwinService();

// Start public chat session
export const startPublicChat = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  // ✅ Declare variables outside try block for error logging
  let twinId: string | undefined;
  let visitorId: string | undefined;
  let userId: string | undefined;
  let finalVisitorId: string | null | undefined;

  try {
    const parsed = startPublicChatSchema.parse(req.body);
    twinId = parsed.twinId;
    visitorId = parsed.visitorId;

    // Get userId if user is logged in
    userId = req.user?.id;
    logger.info(`[startPublicChat] Twin: ${twinId}, UserId: ${userId || 'anonymous'}, VisitorId: ${visitorId || 'none'}`);

    // Generate visitor ID if not provided and user not logged in
    finalVisitorId = userId ? null : (visitorId || `visitor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);

    // Check if twin exists and is public (allow even if twin doesn't exist - public chat should work)
    const twinResult = await db.query(`
      SELECT id, "isPublic", "styleVector", "sampleReply", "requireApproval", "requireLogin"
      FROM "Twin"
      WHERE id = $1 AND "isPublic" = true
    `, [twinId]);

    // If twin doesn't exist, still allow chat creation (public chat works without twin)
    if (twinResult.rows.length === 0) {
      logger.warn(`Twin ${twinId} not found or not public, but allowing chat creation`);
      // Continue with default twin data
      const defaultTwin = {
        id: twinId,
        isPublic: true,
        styleVector: null,
        sampleReply: null,
        requireApproval: false,
        requireLogin: false
      };
      // Create chat anyway
      const publicChat = await publicChatQueries.create(twinId, finalVisitorId || undefined, userId || undefined);
      
      return res.json({
        success: true,
        chatId: publicChat.id,
        twin: {
          id: defaultTwin.id,
          sampleReply: defaultTwin.sampleReply
        }
      });
    }

    const twin = twinResult.rows[0];

    // ✅ PHASE 2: Check requireLogin
    if (twin.requireLogin && !userId) {
      return res.status(401).json({
        success: false,
        error: 'Login required to chat with this twin',
        errorCode: 'LOGIN_REQUIRED'
      });
    }

    // ✅ PHASE 2: Check if user is blocked (only if logged in)
    if (userId) {
      const blockedCheck = await db.query(`
        SELECT id FROM "TwinBlockedUsers"
        WHERE "twinId" = $1 AND "userId" = $2
      `, [twinId, userId]);

      if (blockedCheck.rows.length > 0) {
        return res.status(403).json({
          success: false,
          error: 'You are blocked from chatting with this twin',
          errorCode: 'USER_BLOCKED'
        });
      }
    }

    // ✅ PHASE 2: Check if user is trying to chat with their own twin
    if (userId) {
      const twinOwnerCheck = await db.query(`
        SELECT "userId" FROM "Twin" WHERE id = $1
      `, [twinId]);
      
      if (twinOwnerCheck.rows.length > 0 && twinOwnerCheck.rows[0].userId === userId) {
        return res.status(403).json({
          success: false,
          error: 'You cannot chat with your own twin in public chat. Please use Enhanced Chat.',
          errorCode: 'OWN_TWIN_CHAT',
          redirectUrl: `/chat-enhanced?twinId=${twinId}`
        });
      }
    }

    // ✅ For lazy creation: Always create new chat (don't check for existing)    
    // This ensures each draft chat gets a fresh chat when first message is sent
    logger.info(`[startPublicChat] Creating new chat - TwinId: ${twinId}, UserId: ${userId || 'null'}, VisitorId: ${finalVisitorId || 'null'}`);
    
    let publicChat;
    try {
      publicChat = await publicChatQueries.create(twinId, finalVisitorId || undefined, userId || undefined);
      logger.info(`[startPublicChat] Chat created successfully - ChatId: ${publicChat.id}, UserId set: ${publicChat.userId || 'null'}`);
    } catch (createError: any) {
      // ✅ More detailed error logging
      const createErrorMessage = createError?.message || String(createError) || 'Unknown create error';
      logger.error('[startPublicChat] Failed to create chat:', {
        error: createErrorMessage,
        errorType: createError?.constructor?.name,
        errorCode: createError?.code,
        errorDetail: createError?.detail,
        errorConstraint: createError?.constraint,
        stack: createError?.stack,
        twinId,
        userId: userId || 'null',
        visitorId: finalVisitorId || 'null',
        // ✅ Log full error object
        fullError: JSON.stringify(createError, Object.getOwnPropertyNames(createError))
      });
      
      // ✅ Console log for immediate debugging
      console.error('[startPublicChat] Create error details:', {
        message: createErrorMessage,
        error: createError,
        twinId,
        userId,
        visitorId: finalVisitorId
      });
      
      throw createError; // Re-throw to be caught by outer catch
    }

    // Log event (don't fail if this fails)
    if (userId) {
      try {
        await EventLogger.logUserEvent(userId, 'public_chat_started', {
          twinId,
          chatId: publicChat.id
        });
      } catch (eventError) {
        logger.warn('[startPublicChat] Failed to log event:', eventError);
      }
    } else if (finalVisitorId && !finalVisitorId.startsWith('visitor_')) {
      try {
        await EventLogger.logUserEvent(finalVisitorId, 'public_chat_started', {
          twinId,
          chatId: publicChat.id
        });
      } catch (eventError) {
        logger.warn('[startPublicChat] Failed to log event:', eventError);
      }
    }

    res.json({
      success: true,
      chatId: publicChat.id,
      twin: {
        id: twin.id,
        sampleReply: twin.sampleReply
      }
    });

  } catch (error: any) {
    // ✅ Better error logging with proper serialization
    const errorMessage = error?.message || String(error) || 'Unknown error';
    const errorStack = error?.stack || 'No stack trace';
    
    logger.error('startPublicChat error:', {
      message: errorMessage,
      stack: errorStack,
      name: error?.name,
      code: error?.code,
      twinId: twinId || 'undefined',
      userId: userId || 'undefined',
      visitorId: visitorId || 'undefined',
      finalVisitorId: finalVisitorId || 'undefined',
      body: req.body,
      // ✅ Log the actual error as string
      errorString: String(error),
      errorJSON: JSON.stringify(error, Object.getOwnPropertyNames(error))
    });
    
    // ✅ Also log directly to console for debugging
    console.error('[startPublicChat] Full error:', error);
    console.error('[startPublicChat] Error message:', errorMessage);
    console.error('[startPublicChat] Error stack:', errorStack);
    
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        error: error.message,
        errorCode: error.errorCode
      });
    }
    
    // ✅ Return more detailed error in development
    const errorMessageToReturn = process.env.NODE_ENV === 'development' 
      ? errorMessage
      : 'Failed to start public chat';
    
    return res.status(500).json({
      success: false,
      error: errorMessageToReturn,
      errorCode: 'INTERNAL_ERROR'
    });
  }
};

// Send message in public chat
export const sendPublicMessage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { chatId } = req.params;
    const { message } = sendPublicMessageSchema.parse(req.body);

    // ✅ Use shared validation
    try {
      chatUtils.validateMessage(message);
    } catch (error) {
      if (error instanceof AppError) {
        return res.status(error.statusCode).json({
          success: false,
          error: error.message,
          errorCode: error.errorCode
        });
      }
      throw error;
    }

    // Get public chat with twin information
    const chatResult = await db.query(`
      SELECT pc.id, pc."twinId", pc."visitorId", pc."messageCount", pc."userId", pc."title",
             t."styleVector", t."sampleReply", t."personaData", t."systemPrompt", t."tokenLimit", t."requireLogin"
      FROM "PublicChat" pc
      LEFT JOIN "Twin" t ON pc."twinId" = t.id
      WHERE pc.id = $1
    `, [chatId]);

    if (chatResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Public chat not found',
        errorCode: 'CHAT_NOT_FOUND'
      });
    }

    const chat = chatResult.rows[0];

    // ✅ FIX: Check requireLogin before sending message
const userId = req.user?.id;
if (chat.requireLogin && !userId) {
  return res.status(401).json({
    success: false,
    error: 'Login required to send messages to this twin',
    errorCode: 'LOGIN_REQUIRED'
  });
}

    // ✅ PHASE 2: Check if user is trying to chat with their own twin
    if (userId) {
      const twinOwnerCheck = await db.query(`
        SELECT "userId" FROM "Twin" WHERE id = $1
      `, [chat.twinId]);
      
      if (twinOwnerCheck.rows.length > 0 && twinOwnerCheck.rows[0].userId === userId) {
        return res.status(403).json({
          success: false,
          error: 'You cannot chat with your own twin in public chat. Please use Enhanced Chat.',
          errorCode: 'OWN_TWIN_CHAT',
          redirectUrl: `/chat-enhanced?twinId=${chat.twinId}`
        });
      }
    }

    // ✅ PHASE 2: Check if user is blocked (only if logged in)    
    if (chat.userId) {
      const blockedCheck = await db.query(`
        SELECT id FROM "TwinBlockedUsers"
        WHERE "twinId" = $1 AND "userId" = $2
      `, [chat.twinId, chat.userId]);
    
      if (blockedCheck.rows.length > 0) {
        return res.status(403).json({
          success: false,
          error: 'You are blocked from chatting with this twin',
          errorCode: 'USER_BLOCKED'
        });
      }
    }
    
    // Get twin info for requireApproval check
    let twinInfo = { requireApproval: false };
    try {
      const twinInfoResult = await db.query(`
        SELECT "requireApproval"
        FROM "Twin"
        WHERE id = $1
      `, [chat.twinId]);
      twinInfo = twinInfoResult.rows[0] || { requireApproval: false };
    } catch (error) {
      logger.warn('Twin not found for public chat, using defaults:', error);
    }

    // ✅ Use shared moderation check
    const moderation = await chatUtils.checkModerationAndApprove(
      message,
      chat.twinId,
      chat.userId || undefined,
      twinInfo.requireApproval
    );

    if (!moderation.approved) {
      logger.warn('Public message rejected by moderation:', {
        message: message.substring(0, 50),
        reasons: moderation.moderationResult.reasons,
        chatId: chatId,
        twinId: chat.twinId
      });
      
      return res.status(400).json(
        chatUtils.getModerationRejectionResponse(moderation.moderationResult)
      );
    }

    // ✅ Check first message and title
    const [isFirstMessage, currentTitle] = await Promise.all([
      chatUtils.checkFirstMessage(chatId, 'PublicMessage'),
      chatUtils.getChatTitle(chatId, 'PublicChat')
    ]);
    
    // ✅ Always generate title for first message (even if title is "New Chat")
    const shouldGenerateTitle = isFirstMessage === true;

    // ✅ Get recent messages
    const recentMessages = await chatUtils.getRecentMessages(chatId, 'PublicMessage', 10);

    // ✅ Create request ID and check duplicate
    const userIdOrVisitor = chat.userId || chat.visitorId || `visitor_${Date.now()}`;
    const requestId = chatUtils.createRequestId(userIdOrVisitor);
    const duplicateCheck = await chatUtils.checkDuplicateRequest(chatId, requestId, 'PublicMessage');
    
    if (duplicateCheck.isDuplicate) {
      logger.info('Duplicate public message requestId detected:', requestId);
      return res.status(400).json({
        success: false,
        error: 'Duplicate request',
        message: 'Message already sent.',
        duplicate: true
      });
    }

    // ✅ Build context (no session memory for public chat)
    const context = chatUtils.buildChatContext({
      styleVector: chat.styleVector,
      personaData: chat.personaData,
      // ⚠️ FIX: Only pass systemPrompt if it exists (don't use fallback)
      // This ensures persona path is only used when both personaData AND systemPrompt exist
      systemPrompt: chat.systemPrompt, // Remove the fallback || "You are a helpful AI assistant..."
      tokenLimit: chat.tokenLimit || 500,
      chatMemory: recentMessages.map(msg => ({
        content: msg.content,
        sender: msg.sender,
        timestamp: msg.createdAt
      })),
      currentMessages: [message.trim()],
      twinId: chat.twinId,
      isFirstMessage: shouldGenerateTitle
    });

    // ✅ Generate AI response
    const { aiResponse, generatedTitle } = await chatUtils.generateAIResponse(context);

    // ✅ Save messages
    const userMessage = await chatUtils.saveUserMessage({
      chatId,
      message,
      approved: moderation.approved,
      requestId,
      messageTable: 'PublicMessage',
      messageIdPrefix: 'pub_msg'
    });

    const aiMessage = await chatUtils.saveAIMessage({
      chatId,
      aiResponse,
      messageTable: 'PublicMessage',
      messageIdPrefix: 'pub_msg'
    });

    // ✅ Update metadata
    await chatUtils.updateChatMetadata({
      chatId,
      chatTable: 'PublicChat',
      generatedTitle,
      isFirstMessage,
      currentTitle,
      userMessage: message,
      aiResponse,
      updatedAtField: 'lastActivity'
    });

    // ✅ Check if user wants to save something (ChatGPT-style "remember this")
    if (chat.twinId) {
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

      if (shouldExtractFacts) {
        logger.info('✅ User requested to remember something - extracting facts');
        
        // ✅ Get recent messages for context
        const recentMessages = await chatUtils.getRecentMessages(chatId, 'PublicMessage', 5);
        const contextText = recentMessages.map(m => m.content).join('\n');
        
        // Extract facts from context (async, don't block response)
        const { memoryService } = await import('../../services/memoryService');
        memoryService.extractLongTermFacts(chat.twinId, contextText)
          .then(() => {
            logger.info(`✅ Facts extracted from user's "remember this" request for twin ${chat.twinId}`);
          })
          .catch(err => logger.error('Fact extraction failed:', err));
      }
    }

    // ✅ Send response
    res.json({
      success: true,
      messages: [
        {
          id: userMessage.id,
          content: message,
          sender: 'human',
          createdAt: userMessage.createdAt
        },
        {
          id: aiMessage.id,
          content: aiResponse,
          sender: 'twin',
          createdAt: aiMessage.createdAt
        }
      ],
      generatedTitle: generatedTitle || null,
      isFirstMessage: isFirstMessage
    });

  } catch (error: any) {
    logger.error('sendPublicMessage error:', error);
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        error: error.message,
        errorCode: error.errorCode
      });
    }
    return res.status(500).json({
      success: false,
      error: 'Failed to send public message',
      errorCode: 'INTERNAL_ERROR'
    });
  }
};

// Get public chat history
export const getPublicChatHistory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { chatId } = req.params;
    const userId = req.user?.id; //Get userId if logged in

    // Get public chat (LEFT JOIN so it works even if twin doesn't exist)
    const chatResult = await db.query(`
      SELECT pc.id, pc."twinId", pc."visitorId", pc."messageCount", pc."userId",
             t."publicHandle", t."sampleReply", t."showChatHistory"
      FROM "PublicChat" pc
      LEFT JOIN "Twin" t ON pc."twinId" = t.id
      WHERE pc.id = $1
    `, [chatId]);

    if (chatResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Public chat not found',
        errorCode: ErrorCodes.CHAT_NOT_FOUND
      });
    }

    const chat = chatResult.rows[0];

    // ✅ PHASE 2: Check showChatHistory setting
    // If showChatHistory is false, only show messages to the chat owner
    const canViewHistory = chat.showChatHistory !== false || chat.userId === userId;

    // Get chat messages (filter based on showChatHistory)
    let messagesResult;
    if (canViewHistory) {
      messagesResult = await db.query(`
        SELECT id, content, sender, "createdAt"
        FROM "PublicMessage"
        WHERE "chatId" = $1
        ORDER BY "createdAt" ASC
      `, [chatId]);
    } else {
      // Only return empty array if history is hidden and user is not the owner
      messagesResult = { rows: [] };
    }

    res.json({
      success: true,
      chat: {
        id: chat.id,
        twinId: chat.twinId,
        visitorId: chat.visitorId,
        messageCount: chat.messageCount,
        twinHandle: chat.publicHandle,
        sampleReply: chat.sampleReply
      },
      messages: messagesResult.rows
    });

  } catch (error: any) {
    logger.error('getPublicChatHistory error:', error);
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        error: error.message,
        errorCode: error.errorCode
      });
    }
    return res.status(500).json({
      success: false,
      error: 'Failed to get public chat history',
      errorCode: 'INTERNAL_ERROR'
    });
  }
};

// Get public chat by twin ID (for starting new chat)
export const getPublicChatByTwin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { twinId } = req.params;
    const { visitorId } = req.query;

    // Check if twin exists and is public
    const twinResult = await db.query(`
      SELECT id, "isPublic", "publicHandle", "sampleReply"
      FROM "Twin"
      WHERE id = $1 AND "isPublic" = true
    `, [twinId]);

    if (twinResult.rows.length === 0) {
      throw createError.notFound('Public twin not found', ErrorCodes.TWIN_NOT_FOUND);
    }

    const twin = twinResult.rows[0];

    // Check for existing public chat
    const existingChat = await publicChatQueries.findByTwinAndVisitor(twinId, visitorId as string);

    if (existingChat) {
      // Get chat history
      const messagesResult = await db.query(`
        SELECT id, content, sender, "createdAt"
        FROM "PublicMessage"
        WHERE "chatId" = $1
        ORDER BY "createdAt" ASC
      `, [existingChat.id]);

      return res.json({
        success: true,
        chatId: existingChat.id,
        twin: {
          id: twin.id,
          publicHandle: twin.publicHandle,
          sampleReply: twin.sampleReply
        },
        messages: messagesResult.rows
      });
    }

    // No existing chat, return twin info for starting new chat
    res.json({
      success: true,
      chatId: null,
      twin: {
        id: twin.id,
        publicHandle: twin.publicHandle,
        sampleReply: twin.sampleReply
      },
      messages: []
    });

  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw createError.internal('Failed to get public chat by twin', error);
  }
};

// ADD after line 308 (after the closing } of getPublicChatByTwin):

// Get all public chats for a visitor with a specific twin
export const getPublicChatsByTwin = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { twinId } = req.params;
    const { visitorId } = req.query;
    const userId = req.user?.id;

    // Check if twin exists and is public
    const twinResult = await db.query(`
      SELECT id, "isPublic", "publicHandle", "sampleReply", "showChatHistory", "userId"
      FROM "Twin"
      WHERE id = $1 AND "isPublic" = true
    `, [twinId]);

    if (twinResult.rows.length === 0) {
      throw createError.notFound('Public twin not found', ErrorCodes.TWIN_NOT_FOUND);
    }

    const twin = twinResult.rows[0];

    // ✅ PHASE 2: Check showChatHistory setting
    // If showChatHistory is false, only return latest chat (not all previous chats)
    const shouldFilterHistory = twin.showChatHistory === false && twin.userId !== userId;

    // Get all chats for this visitor with this twin
    let chatsResult;
    if (shouldFilterHistory) {
      // Only get the latest chat if history is hidden
      chatsResult = await db.query(`
        SELECT pc.id, pc."messageCount", pc."createdAt", pc."lastActivity", pc."title", pc."userId",
               m.content as last_message, m."createdAt" as last_message_time
        FROM "PublicChat" pc
        LEFT JOIN LATERAL (
          SELECT content, "createdAt"
          FROM "PublicMessage" 
          WHERE "chatId" = pc.id 
          ORDER BY "createdAt" DESC 
          LIMIT 1
        ) m ON true
        WHERE pc."twinId" = $1 
          AND (
            (pc."userId" = $2 AND $2 IS NOT NULL) 
            OR 
            (pc."visitorId" = $3 AND $2 IS NULL AND $3 IS NOT NULL)
          )
        ORDER BY pc."lastActivity" DESC, pc."createdAt" DESC
        LIMIT 1
      `, [twinId, userId || null, visitorId as string || null]);
    } else {
      // Show all chats if history is enabled or user is owner
      chatsResult = await db.query(`
        SELECT pc.id, pc."messageCount", pc."createdAt", pc."lastActivity", pc."title",
               m.content as last_message, m."createdAt" as last_message_time
        FROM "PublicChat" pc
        LEFT JOIN LATERAL (
          SELECT content, "createdAt"
          FROM "PublicMessage" 
          WHERE "chatId" = pc.id 
          ORDER BY "createdAt" DESC 
          LIMIT 1
        ) m ON true
        WHERE pc."twinId" = $1 
          AND (
            (pc."userId" = $2 AND $2 IS NOT NULL) 
            OR 
            (pc."visitorId" = $3 AND $2 IS NULL AND $3 IS NOT NULL)
          )
        ORDER BY pc."lastActivity" DESC, pc."createdAt" DESC
      `, [twinId, userId || null, visitorId as string || null]);
    }

    const chats = chatsResult.rows.map(chat => ({
      id: chat.id,
      messageCount: chat.messageCount || 0,
      createdAt: chat.createdAt,
      lastActivity: chat.lastActivity,
      title: chat.title || null,
      lastMessage: chat.last_message ? {
        content: chat.last_message,
        createdAt: chat.last_message_time
      } : null
    }));

    res.json({
      success: true,
      twin: {
        id: twin.id,
        publicHandle: twin.publicHandle,
        sampleReply: twin.sampleReply
      },
      chats
    });

  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw createError.internal('Failed to get public chats by twin', error);
  }
};

// Create new public chat
export const createNewPublicChat = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { twinId, visitorId } = req.body;
    const userId = req.user?.id; // Get userId if logged in
    logger.info(`[createNewPublicChat] Twin: ${twinId}, UserId: ${userId || 'anonymous'}, VisitorId: ${visitorId || 'none'}`);

    // Check if twin exists and is public
    const twinResult = await db.query(`
      SELECT id, "isPublic", "styleVector", "sampleReply"
      FROM "Twin"
      WHERE id = $1 AND "isPublic" = true
    `, [twinId]);

    if (twinResult.rows.length === 0) {
      throw createError.notFound('Public twin not found', ErrorCodes.TWIN_NOT_FOUND);
    }

    const twin = twinResult.rows[0];

    // Create new public chat with userId if logged in
    const publicChat = await publicChatQueries.create(twinId, visitorId, userId);
    logger.info(`[createNewPublicChat] Chat created - ChatId: ${publicChat.id}, UserId: ${publicChat.userId || 'null'}`);

    res.json({
      success: true,
      chatId: publicChat.id,
      twin: {
        id: twin.id,
        sampleReply: twin.sampleReply
      }
    });

  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw createError.internal('Failed to create new public chat', error);
  }
};

// Get all public chats for logged-in user (grouped by twin)
export const getUserPublicChats = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw createError.unauthorized();
    }

    const userId = req.user.id;
    logger.info(`[getUserPublicChats] Fetching chats for userId: ${userId}`);

    // Get all public chats for this user, grouped by twin
    // For each twin, get the latest chat and message info
    const chatsResult = await db.query(`
      SELECT DISTINCT ON (pc."twinId")
        pc.id as chat_id,
        pc."twinId",
        pc."messageCount",
        pc."createdAt",
        pc."lastActivity",
        pc."title",
        t."publicHandle",
        t.bio,
        t."profileImage",
        t."likeCount",
        t."chatCount",
        t."followCount",
        t."verified",
        (
          SELECT content 
          FROM "PublicMessage" 
          WHERE "chatId" = pc.id 
          ORDER BY "createdAt" DESC 
          LIMIT 1
        ) as last_message_content,
        (
          SELECT "createdAt" 
          FROM "PublicMessage" 
          WHERE "chatId" = pc.id 
          ORDER BY "createdAt" DESC 
          LIMIT 1
        ) as last_message_time
      FROM "PublicChat" pc
      JOIN "Twin" t ON pc."twinId" = t.id
      WHERE pc."userId" = $1 
        AND t."isPublic" = true
      ORDER BY pc."twinId", pc."lastActivity" DESC
    `, [userId]);

    logger.info(`[getUserPublicChats] Query returned ${chatsResult?.rows?.length || 0} rows`);

    // Group by twin and format response
    const twinChatsMap = new Map();

    chatsResult.rows.forEach(row => {
      const twinId = row.twinId;
      
      if (!twinChatsMap.has(twinId)) {
        twinChatsMap.set(twinId, {
          twin: {
            id: twinId,
            publicHandle: row.publicHandle,
            bio: row.bio,
            profileImage: row.profileImage,
            likeCount: row.likeCount || 0,
            chatCount: row.chatCount || 0,
            followCount: row.followCount || 0,
            verified: row.verified || false
          },
          latestChat: {
            id: row.chat_id,
            messageCount: row.messageCount || 0,
            createdAt: row.createdAt,
            lastActivity: row.lastActivity,
            title: row.title
          },
          lastMessage: row.last_message_content ? {
            content: row.last_message_content,
            createdAt: row.last_message_time
          } : null
        });
      } else {
        // Update if this chat is more recent
        const existing = twinChatsMap.get(twinId);
        if (new Date(row.lastActivity) > new Date(existing.latestChat.lastActivity)) {
          existing.latestChat = {
            id: row.chat_id,
            messageCount: row.messageCount || 0,
            createdAt: row.createdAt,
            lastActivity: row.lastActivity,
            title: row.title
          };
          existing.lastMessage = row.last_message_content ? {
            content: row.last_message_content,
            createdAt: row.last_message_time
          } : null;
        }
      }
    });

    // Convert map to array and sort by last activity
    const twinChats = Array.from(twinChatsMap.values())
      .sort((a, b) => {
        const timeA = a.latestChat.lastActivity;
        const timeB = b.latestChat.lastActivity;
        return new Date(timeB).getTime() - new Date(timeA).getTime();
      });

    logger.info(`[getUserPublicChats] Found ${twinChats.length} unique twins with chats for userId: ${userId}`);
    logger.debug(`[getUserPublicChats] Raw query result count: ${chatsResult.rows.length}`);

    res.json({
      success: true,
      chats: twinChats,
      total: twinChats.length
    });

  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw createError.internal('Failed to get user public chats', error);
  }
};

// Delete public chat
export const deletePublicChat = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { chatId } = req.params;

    if (!chatId) {
      return res.status(400).json({
        success: false,
        error: 'Chat ID is required',
        errorCode: 'VALIDATION_ERROR'
      });
    }

    // Check if chat exists
    const chatResult = await db.query(`
      SELECT id FROM "PublicChat" WHERE id = $1
    `, [chatId]);
    
    if (!chatResult || chatResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Public chat not found',
        errorCode: ErrorCodes.CHAT_NOT_FOUND
      });
    }
    
    // Delete chat (CASCADE will automatically delete all messages)
    await db.query(`
      DELETE FROM "PublicChat" WHERE id = $1
    `, [chatId]);
    
    logger.info('Public chat deleted successfully:', { chatId });
    
    res.json({
      success: true,
      message: 'Chat deleted successfully'
    });
  } catch (error: any) {
    logger.error('deletePublicChat error:', error);
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        error: error.message,
        errorCode: error.errorCode
      });
    }
    return res.status(500).json({
      success: false,
      error: 'Failed to delete public chat',
      errorCode: 'INTERNAL_ERROR'
    });
  }
};

// Update public chat title
export const updatePublicChatTitle = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { chatId } = req.params;
    const { title } = req.body;

    if (!chatId) {
      return res.status(400).json({
        success: false,
        error: 'Chat ID is required',
        errorCode: 'VALIDATION_ERROR'
      });
    }

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Title is required',
        errorCode: 'VALIDATION_ERROR'
      });
    }

    // Check if chat exists
    const chatResult = await db.query(`
      SELECT id FROM "PublicChat" WHERE id = $1
    `, [chatId]);
    
    if (!chatResult || chatResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Public chat not found',
        errorCode: ErrorCodes.CHAT_NOT_FOUND
      });
    }

    // Update chat title
    await db.query(`
      UPDATE "PublicChat" SET "title" = $1, "lastActivity" = NOW() WHERE id = $2
    `, [title.trim(), chatId]);
    
    logger.info('Public chat title updated:', { chatId, title: title.trim() });
    
    res.json({
      success: true,
      message: 'Chat title updated successfully'
    });
  } catch (error: any) {
    logger.error('updatePublicChatTitle error:', error);
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        error: error.message,
        errorCode: error.errorCode
      });
    }
    return res.status(500).json({
      success: false,
      error: 'Failed to update chat title',
      errorCode: 'INTERNAL_ERROR'
    });
  }
};