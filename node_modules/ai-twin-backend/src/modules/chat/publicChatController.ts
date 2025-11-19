import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth';
import { db, publicChatQueries } from '../../config/database';
import { generateId } from '../../utils/idGenerator';
import { logger } from '../../config/logger';
import { EventLogger } from '../../services/eventLogger';
import { TwinService } from '../twin/twinService';
import { z } from 'zod';
import { createError, ErrorCodes } from '../../utils/errors';
import * as chatUtils from './chatSharedUtils';
import { handleControllerError, handleErrorWithSuccessFormat } from '../../utils/errorHandler';
import { QUERY_LIMITS } from '../../config/constants';

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
    finalVisitorId = userId ? null : (visitorId || generateId.visitor());

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
        
    const errorMessageToReturn = process.env.NODE_ENV === 'development' 
      ? errorMessage
      : 'Failed to start public chat';
    handleErrorWithSuccessFormat(error, res, errorMessageToReturn);
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
      // Return early with success:false format for validation errors
      handleErrorWithSuccessFormat(error, res, 'Message validation failed');
      return;
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
    handleErrorWithSuccessFormat(error, res, 'Failed to send public message');
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
             t."publicHandle", t."sampleReply", t."showChatHistory", t."userId" as twin_owner_id
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
    
    // ✅ Allow twin owner to view any chat for their twin (always show all)
    const isTwinOwner = userId && chat.twin_owner_id === userId;
    const isChatOwner = chat.userId === userId;
    
    // ✅ FIX: Get showChatHistory value explicitly (handle PostgreSQL boolean type)
    // PostgreSQL returns boolean as true/false, but we need to handle null/undefined
    const showChatHistoryValue = chat.showChatHistory;
    const isHistoryEnabled = showChatHistoryValue === true || showChatHistoryValue === null || showChatHistoryValue === undefined;
    const isHistoryDisabled = showChatHistoryValue === false;
    
    logger.info(`[getPublicChatHistory] ChatId: ${chatId}, showChatHistory: ${showChatHistoryValue} (type: ${typeof showChatHistoryValue}), isTwinOwner: ${isTwinOwner}, isChatOwner: ${isChatOwner}, isHistoryEnabled: ${isHistoryEnabled}`);
    
    // ✅ FIX: Logic for showChatHistory
    // 1. If showChatHistory is true (enabled) OR null/undefined → show all messages to everyone
    // 2. If showChatHistory is false (disabled) → only show latest chat to non-owners
    // 3. Twin owner always sees all chats and messages
    
    let canViewMessages = false;
    
    if (isTwinOwner || isChatOwner) {
      // Twin owner or chat owner can always view all messages
      canViewMessages = true;
      logger.info(`[getPublicChatHistory] Allowing access - Owner (twin: ${isTwinOwner}, chat: ${isChatOwner})`);
    } else if (isHistoryEnabled) {
      // ✅ FIX: If history is ENABLED (true or null/undefined), show all messages - NO isLatestChat check
      canViewMessages = true;
      logger.info(`[getPublicChatHistory] Allowing access - History enabled (value: ${showChatHistoryValue})`);
    } else if (isHistoryDisabled) {
      // ✅ FIX: If history is DISABLED, only show if this is the latest chat
      const latestChatResult = await db.query(`
        SELECT id FROM "PublicChat"
        WHERE "twinId" = $1
          AND (
            ("userId" = $2 AND $2 IS NOT NULL)
            OR
            ("visitorId" = $3 AND $2 IS NULL AND $3 IS NOT NULL)
          )
        ORDER BY "lastActivity" DESC NULLS LAST, "createdAt" DESC
        LIMIT 1
      `, [chat.twinId, userId || null, chat.visitorId || null]);
      
      const isLatestChat = latestChatResult && latestChatResult.rows.length > 0 && latestChatResult.rows[0].id === chatId;
      canViewMessages = isLatestChat;
      logger.info(`[getPublicChatHistory] History disabled - isLatestChat: ${isLatestChat}, latestChatId: ${latestChatResult?.rows[0]?.id || 'none'}`);
    }

    // Get chat messages
    let messagesResult;
    if (canViewMessages) {
      messagesResult = await db.query(`
        SELECT id, content, sender, "createdAt"
        FROM "PublicMessage"
        WHERE "chatId" = $1
        ORDER BY "createdAt" ASC
      `, [chatId]);
      logger.info(`[getPublicChatHistory] Returning ${messagesResult.rows.length} messages for chatId: ${chatId}`);
    } else {
      // Only return empty array if history is hidden and user is not the owner
      messagesResult = { rows: [] };
      logger.info(`[getPublicChatHistory] Returning empty messages - access denied for chatId: ${chatId}`);
    }

    res.json({
      success: true,
      chat: {
        id: chat.id,
        twinId: chat.twinId,
        visitorId: chat.visitorId,
        messageCount: chat.messageCount,
        twinHandle: chat.publicHandle,
        sampleReply: chat.sampleReply,
        isTwinOwner: isTwinOwner,
        showChatHistory: chat.showChatHistory
      },
      messages: messagesResult.rows
    });

  } catch (error: any) {
    logger.error('getPublicChatHistory error:', error);
    handleErrorWithSuccessFormat(error, res, 'Failed to get public chat history');
  }
};

// Get public chat by twin ID (for starting new chat)
export const getPublicChatByTwin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { twinId } = req.params;
    const { visitorId } = req.query;

// Allow access to public chat - blockNonLoggedUsers only affects discover visibility
const twinResult = await db.query(`
  SELECT id, "isPublic", "publicHandle", "sampleReply"
  FROM "Twin" t
  WHERE t.id = $1 
    AND t."isPublic" = true
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
    handleControllerError(error, 'Failed to get public chat by twin');
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

    // ✅ FIX: Check showChatHistory setting
    // Twin owner can always see all chats
    const isTwinOwner = userId && twin.userId === userId;
    
    // ✅ FIX: Get showChatHistory value explicitly (handle PostgreSQL boolean type)
    const showChatHistoryValue = twin.showChatHistory;
    const isHistoryEnabled = showChatHistoryValue === true || showChatHistoryValue === null || showChatHistoryValue === undefined;
    const isHistoryDisabled = showChatHistoryValue === false;
    
    logger.info(`[getPublicChatsByTwin] TwinId: ${twinId}, showChatHistory: ${showChatHistoryValue} (type: ${typeof showChatHistoryValue}), isTwinOwner: ${isTwinOwner}, isHistoryEnabled: ${isHistoryEnabled}`);
    
    // ✅ FIX: Only filter history if showChatHistory is EXPLICITLY false AND user is not owner
    // If showChatHistory is true OR null/undefined, show all chats
    const shouldFilterHistory = isHistoryDisabled && !isTwinOwner;

    // Get all chats for this visitor with this twin
    let chatsResult;
    if (shouldFilterHistory) {
      // ✅ Only get the LATEST/MOST RECENT chat if history is disabled
      logger.info(`[getPublicChatsByTwin] Filtering - showing only latest chat (history disabled)`);
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
        ORDER BY pc."lastActivity" DESC NULLS LAST, pc."createdAt" DESC
        LIMIT 1
      `, [twinId, userId || null, visitorId as string || null]);
    } else {
      // ✅ FIX: Show ALL chats if history is enabled (true) OR user is owner OR null/undefined
      logger.info(`[getPublicChatsByTwin] Showing all chats (history enabled: ${isHistoryEnabled} or owner: ${isTwinOwner})`);
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
        ORDER BY pc."lastActivity" DESC NULLS LAST, pc."createdAt" DESC
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

    logger.info(`[getPublicChatsByTwin] Returning ${chats.length} chats for twinId: ${twinId}`);
    logger.info(`[getPublicChatsByTwin] First chat sample:`, chats[0] ? JSON.stringify(chats[0]) : 'no chats');

    const responseData = {
      success: true,
      twin: {
        id: twin.id,
        publicHandle: twin.publicHandle,
        sampleReply: twin.sampleReply,
        showChatHistory: twin.showChatHistory
      },
      chats
    };

    logger.info(`[getPublicChatsByTwin] Sending response with ${responseData.chats.length} chats`);
    
    res.json(responseData);

  } catch (error) {
    handleControllerError(error, 'Failed to get public chats by twin');
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
    handleControllerError(error, 'Failed to create new public chat');
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
    // For each twin, get the latest chat, total chats count, and total messages count
    const chatsResult = await db.query(`
      WITH twin_stats AS (
        SELECT 
          pc."twinId",
          COUNT(DISTINCT pc.id) as total_chats,
          COALESCE(SUM(pc."messageCount"), 0) as total_messages,
          MAX(pc."lastActivity") as latest_activity
        FROM "PublicChat" pc
        JOIN "Twin" t ON pc."twinId" = t.id
        WHERE pc."userId" = $1 
          AND t."isPublic" = true
        GROUP BY pc."twinId"
      ),
      latest_chats AS (
        SELECT DISTINCT ON (pc."twinId")
          pc.id as chat_id,
          pc."twinId",
          pc."messageCount" as latest_chat_message_count,
          pc."createdAt" as latest_chat_created_at,
          pc."lastActivity" as latest_chat_last_activity,
          pc."title" as latest_chat_title,
          t."publicHandle",
          t.bio,
          t."profileImage",
          t."likeCount",
          t."chatCount",
          t."followCount",
          t."verified"
        FROM "PublicChat" pc
        JOIN "Twin" t ON pc."twinId" = t.id
        WHERE pc."userId" = $1 
          AND t."isPublic" = true
        ORDER BY pc."twinId", pc."lastActivity" DESC
      )
      SELECT 
        lc.*,
        ts.total_chats,
        ts.total_messages,
        (
          SELECT content 
          FROM "PublicMessage" 
          WHERE "chatId" = lc.chat_id 
          ORDER BY "createdAt" DESC 
          LIMIT 1
        ) as last_message_content,
        (
          SELECT "createdAt" 
          FROM "PublicMessage" 
          WHERE "chatId" = lc.chat_id 
          ORDER BY "createdAt" DESC 
          LIMIT 1
        ) as last_message_time
      FROM latest_chats lc
      JOIN twin_stats ts ON lc."twinId" = ts."twinId"
      ORDER BY lc.latest_chat_last_activity DESC
    `, [userId]);

    logger.info(`[getUserPublicChats] Query returned ${chatsResult?.rows?.length || 0} rows`);

    // Format response
    const twinChats = chatsResult.rows.map(row => ({
      twin: {
        id: row.twinId,
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
        messageCount: row.latest_chat_message_count || 0,
        createdAt: row.latest_chat_created_at,
        lastActivity: row.latest_chat_last_activity,
        title: row.latest_chat_title
      },
      totalChats: parseInt(row.total_chats || '0', 10),
      totalMessages: parseInt(row.total_messages || '0', 10),
      lastMessage: row.last_message_content ? {
        content: row.last_message_content,
        createdAt: row.last_message_time
      } : null
    }));

    logger.info(`[getUserPublicChats] Found ${twinChats.length} unique twins with chats for userId: ${userId}`);

    res.json({
      success: true,
      chats: twinChats,
      total: twinChats.length
    });

  } catch (error) {
    handleControllerError(error, 'Failed to get user public chats');
  }
};

// Delete public chat
export const deletePublicChat = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { chatId } = req.params;
    const userId = req.user?.id; // ✅ FIX: Get userId from req.user

    if (!chatId) {
      return res.status(400).json({
        success: false,
        error: 'Chat ID is required',
        errorCode: 'VALIDATION_ERROR'
      });
    }

    // Check if chat exists
    const chatResult = await db.query(`
      SELECT id, "userId", "visitorId", "twinId" FROM "PublicChat" WHERE id = $1
    `, [chatId]);
    
    if (!chatResult || chatResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Public chat not found',
        errorCode: ErrorCodes.CHAT_NOT_FOUND
      });
    }

    const chat = chatResult.rows[0];
    
    // ✅ FIX: Check ownership
    if (userId) {
      // Check if user owns the chat
      if (chat.userId !== userId) {
        // Check if user owns the twin
        const twinCheck = await db.query(`
          SELECT "userId" FROM "Twin" WHERE id = $1
        `, [chat.twinId]);
        
        if (twinCheck.rows.length === 0 || twinCheck.rows[0].userId !== userId) {
          return res.status(403).json({
            success: false,
            error: 'You do not have permission to delete this chat',
            errorCode: 'UNAUTHORIZED'
          });
        }
      }
    } else {
      // For anonymous users, require authentication
      return res.status(401).json({
        success: false,
        error: 'Authentication required to delete chat',
        errorCode: 'AUTH_REQUIRED'
      });
    }
    
    // ✅ FIX: Actually delete the chat (CASCADE will delete messages)
    await db.query(`
      DELETE FROM "PublicChat" WHERE id = $1
    `, [chatId]);
    
    logger.info('Public chat deleted successfully:', { chatId, userId });
    
    res.json({
      success: true,
      message: 'Chat deleted successfully'
    });
  } catch (error: any) {
    logger.error('deletePublicChat error:', error);
    handleErrorWithSuccessFormat(error, res, 'Failed to delete public chat');
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
    handleErrorWithSuccessFormat(error, res, 'Failed to update chat title');
  }
};

/**
 * Get all public chats for a twin (for twin owner to see all chats with their twin)
 */
export const getAllPublicChatsForTwin = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { twinId } = req.params;
    const userId = req.user?.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 5, 50);
    const offset = (page - 1) * limit;

    if (!userId) {
      throw createError.unauthorized('Authentication required');
    }

    // Verify twin ownership
    const twinResult = await db.query(`
      SELECT id, "publicHandle", "isPublic", "userId"
      FROM "Twin"
      WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);

    if (twinResult.rows.length === 0) {
      throw createError.notFound('Twin not found or access denied', ErrorCodes.TWIN_NOT_FOUND);
    }

    const twin = twinResult.rows[0];

    // Get total count of all public chats for this twin
    const totalResult = await db.query(`
      SELECT COUNT(*) as total
      FROM "PublicChat"
      WHERE "twinId" = $1
    `, [twinId]);

    const total = parseInt(totalResult.rows[0]?.total || '0', 10);

    // Get all public chats with user/visitor info and message counts
    const chatsResult = await db.query(`
      SELECT 
        pc.id,
        pc."twinId",
        pc."userId",
        pc."visitorId",
        pc."messageCount",
        pc."title",
        pc."createdAt",
        pc."lastActivity",
        u.id as user_id,
        u.handle as user_handle,
        u.name as user_name,
        u."profileImage" as user_profile_image,
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
  LEFT JOIN "User" u ON pc."userId" = u.id
  WHERE pc."twinId" = $1
    AND (
      pc."userId" IS NOT NULL  -- All logged-in user chats
      OR pc.id IN (  -- OR last 50 anonymous chats
        SELECT id FROM "PublicChat"
        WHERE "twinId" = $1 AND "userId" IS NULL AND "visitorId" IS NOT NULL
        ORDER BY "lastActivity" DESC, "createdAt" DESC
        LIMIT ${QUERY_LIMITS.DEFAULT_PAGE_SIZE}
      )
    )
  ORDER BY 
    CASE WHEN pc."userId" IS NOT NULL THEN 0 ELSE 1 END,  -- Logged-in users first
    pc."lastActivity" DESC, 
    pc."createdAt" DESC
  LIMIT $2 OFFSET $3
`, [twinId, limit, offset]);    

    const chats = chatsResult.rows.map(chat => ({
      id: chat.id,
      twinId: chat.twinId,
      userId: chat.userId,
      visitorId: chat.visitorId || null,
      messageCount: chat.messageCount || 0,
      title: chat.title || 'Untitled Chat',
      createdAt: chat.createdAt,
      lastActivity: chat.lastActivity,
      user: chat.user_id ? {
        id: chat.user_id,
        handle: chat.user_handle,
        name: chat.user_name,
        profileImage: chat.user_profile_image
      } : null,
      isAnonymous: !chat.userId && (chat.visitorId!==null && chat.visitorId!==undefined),
      lastMessage: chat.last_message_content ? {
        content: chat.last_message_content,
        createdAt: chat.last_message_time
      } : null
    }));

    res.json({
      success: true,
      chats: chats,
      twin: {
        id: twin.id,
        publicHandle: twin.publicHandle
      },
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: limit
      }
    });

  } catch (error) {
    handleControllerError(error, 'Failed to get public chats for twin');
  }
};

// ✅ NEW: Get public chat history for viewing (read-only, for twin owners)
export const viewPublicChatHistory = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { chatId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      throw createError.unauthorized('Authentication required');
    }

    // Get chat with twin info
    const chatResult = await db.query(`
      SELECT 
        pc.id, 
        pc."twinId", 
        pc."visitorId", 
        pc."messageCount", 
        pc."userId",
        pc."title",
        pc."createdAt",
        pc."lastActivity",
        t."publicHandle", 
        t."sampleReply", 
        t."showChatHistory",
        t."userId" as twin_owner_id,
        u.id as user_id,
        u.handle as user_handle,
        u.name as user_name,
        u."profileImage" as user_profile_image
      FROM "PublicChat" pc
      LEFT JOIN "Twin" t ON pc."twinId" = t.id
      LEFT JOIN "User" u ON pc."userId" = u.id
      WHERE pc.id = $1
    `, [chatId]);

    if (chatResult.rows.length === 0) {
      throw createError.notFound('Chat not found', ErrorCodes.CHAT_NOT_FOUND);
    }

    const chat = chatResult.rows[0];
    
    // ✅ Verify twin ownership
    const isTwinOwner = chat.twin_owner_id === userId;
    if (!isTwinOwner) {
      throw createError.forbidden('Access denied. Only twin owner can view this chat.', ErrorCodes.ACCESS_DENIED);
    }

    // Get all messages
    const messagesResult = await db.query(`
      SELECT id, content, sender, "createdAt"
      FROM "PublicMessage"
      WHERE "chatId" = $1
      ORDER BY "createdAt" ASC
    `, [chatId]);

    res.json({
      success: true,
      chat: {
        id: chat.id,
        twinId: chat.twinId,
        twinHandle: chat.publicHandle,
        title: chat.title || 'Untitled Chat',
        messageCount: chat.messageCount || 0,
        createdAt: chat.createdAt,
        lastActivity: chat.lastActivity,
        user: chat.user_id ? {
          id: chat.user_id,
          handle: chat.user_handle,
          name: chat.user_name,
          profileImage: chat.user_profile_image
        } : null,
        isAnonymous: !chat.userId && !!chat.visitorId,
        visitorId: chat.visitorId
      },
      messages: messagesResult.rows
    });

  } catch (error) {
    handleControllerError(error, 'Failed to get chat history');
  }
};