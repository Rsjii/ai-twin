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
import { formatRelativeTime, normalizeTimestamp } from '../../utils/timestampUtils';
import { detokenizeId, sanitizePublicChat, sanitizeTwin, tokenizeId } from '../../utils/idTokenization';
import { EVENT_TYPES } from '../../config/constants';

// Validation schemas
const startPublicChatSchema = z.object({
  twinToken: z.string().min(1, 'Twin token is required'),
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
    const twinToken = parsed.twinToken;

    // ✅ PHASE 2: Detokenize twinToken to get actual twinId
    const decoded = detokenizeId(twinToken);
    if (!decoded || decoded.type !== 'twin') {
      // Treat as "not found" so user just sees 404
      throw createError.notFound('This chat does not exist', ErrorCodes.TWIN_NOT_FOUND);      
    }

    const twinId = decoded.id;

    visitorId = parsed.visitorId;

    // Get userId if user is logged in
    userId = req.user?.id;
    logger.info(`[startPublicChat] Twin: ${twinId}, UserId: ${userId || 'anonymous'}, VisitorId: ${visitorId || 'none'}`);

    // Generate visitor ID if not provided and user not logged in
    finalVisitorId = userId ? null : (visitorId || generateId.visitor());

    // Check if twin exists and is public (allow even if twin doesn't exist - public chat should work)
    const twinResult = await db.query(`
      SELECT id, "isPublic", "styleVector", "sampleReply", "requireApproval", "requireLogin", "blockNonLoggedUsers"
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
        chatId: tokenizeId(publicChat.id, 'chat'),
        twin: {
          publicId: tokenizeId(defaultTwin.id, 'twin'),
          sampleReply: defaultTwin.sampleReply
        }
      });
    }

    const twin = twinResult.rows[0];

    // 🚩 NEW: non-logged + blockNonLoggedUsers => pretend twin not found
    if (!userId && twin.blockNonLoggedUsers === true) {
      throw createError.notFound('This chat does not exist', ErrorCodes.TWIN_NOT_FOUND);
    }

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
      // Blocked users should see generic "not found"
      throw createError.notFound('This chat does not exist', ErrorCodes.TWIN_NOT_FOUND);        
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
          redirectUrl: `/chat-enhanced?twinId=${tokenizeId(twinId, 'twin')}`
        });
      }
    }

    // ✅ NEW: Reuse existing chat for logged-in users, always create new for anonymous
    let publicChat;

    if (userId) {
      // Logged-in user: reuse canonical default thread per (user, twin)
      publicChat = await publicChatQueries.findLatestByTwinAndUser(twinId, userId);

      if (publicChat) {
        logger.info('[startPublicChat] Reusing existing public chat for user + twin', {
          twinId,
          userId,
          chatId: publicChat.id,
        });
      }
    }
    // Anonymous users: don't reuse, always create new (no check for existing)

    // If no existing chat found (logged-in) or anonymous → create new
// Around line 156-172, update the anonymous chat creation section:
    // If no existing chat found (logged-in) or anonymous → create new
    if (!publicChat) {
      const isAnonymous = !userId && !!finalVisitorId;
      logger.info('[startPublicChat] Creating NEW public chat', {
        twinId,
        userId: userId || 'null',
        visitorId: finalVisitorId || 'null',
        isAnonymous: isAnonymous,
        willBeAnonymous: !userId && !!finalVisitorId
      });

      try {
        publicChat = await publicChatQueries.create(
          twinId,
          finalVisitorId || undefined,
          userId || undefined
        );
        
        // ✅ ADD: Detailed logging after creation
        logger.info('[startPublicChat] Chat created successfully', {
          chatId: publicChat.id,
          userId: publicChat.userId || 'null',
          visitorId: publicChat.visitorId || 'null',
          twinId: publicChat.twinId,
          createdAt: publicChat.createdAt,
          messageCount: publicChat.messageCount || 0,
          isAnonymous: !publicChat.userId && !!publicChat.visitorId,
          actualDbValues: {
            userId: publicChat.userId,
            visitorId: publicChat.visitorId,
            twinId: publicChat.twinId
          }
        });
        
        // ✅ ADD: Verify chat exists in DB immediately after creation
        const verifyResult = await db.query(
          'SELECT id, "userId", "visitorId", "twinId", "messageCount", "createdAt" FROM "PublicChat" WHERE id = $1',
          [publicChat.id]
        );
        if (verifyResult.rows.length > 0) {
          logger.info('[startPublicChat] ✅ Verified chat exists in DB after creation', {
            chatId: publicChat.id,
            dbUserId: verifyResult.rows[0].userId || 'null',
            dbVisitorId: verifyResult.rows[0].visitorId || 'null',
            dbMessageCount: verifyResult.rows[0].messageCount || 0
          });
        } else {
          logger.error('[startPublicChat] ❌ CHAT NOT FOUND IN DB IMMEDIATELY AFTER CREATION!', {
            chatId: publicChat.id
          });
        }
        
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
          fullError: JSON.stringify(createError, Object.getOwnPropertyNames(createError))
        });
        
        throw createError; // Re-throw to be caught by outer catch
      }
    }    

    // Log event (don't fail if this fails)
    if (userId) {
      try {
        await EventLogger.logUserEvent(userId, EVENT_TYPES.PUBLIC_CHAT_STARTED, {
          publicTwinId: twinId,
          publicChatId: publicChat.id,
          source: 'public_profile'
        });
      } catch (eventError) {
        logger.warn('[startPublicChat] Failed to log event:', eventError);
      }
    } else if (finalVisitorId && !finalVisitorId.startsWith('visitor_')) {
      try {
        await EventLogger.logUserEvent(finalVisitorId, EVENT_TYPES.PUBLIC_CHAT_STARTED, {
          twinId,
          chatId: publicChat.id,
        });
      } catch (eventError) {
        logger.warn('[startPublicChat] Failed to log event:', eventError);
      }
    }

    // ✅ Response: always return the chatId token (stable for logged-in, new for anonymous)
    return res.json({
      success: true,
      chatId: tokenizeId(publicChat.id, 'chat'),
      twin: {
        publicId: tokenizeId(twin.id, 'twin'),
        sampleReply: twin.sampleReply,
      },
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
    const { chatToken } = req.params;
    const { message } = sendPublicMessageSchema.parse(req.body);

    if (!chatToken) {
      // Treat as "not found" so user just sees 404
      throw createError.notFound('This chat does not exist', ErrorCodes.CHAT_NOT_FOUND);      
    }

    // ✅ PHASE 4: Detokenize chatToken to get actual chatId
    const decoded = detokenizeId(chatToken);
    if (!decoded || decoded.type !== 'chat') {
      // Treat as "not found" so user just sees 404
      throw createError.notFound('This chat does not exist', ErrorCodes.CHAT_NOT_FOUND);      
    }
    const chatId = decoded.id;

    // ✅ Use shared validation
    try {
      chatUtils.validateMessage(message);
    } catch (error: any) {
      // ✅ SPECIAL CASE: restricted content → safe default reply + analytics + DB save
      if (error && error.message === 'Message contains restricted content') {
        const defaultText =
          "Sorry, I can't answer this like this. Please try asking in a different way.";
        const now = new Date().toISOString();

        // 1) Event log
        try {
          const userId = (req as any).user?.id || null;
          if (userId) {
            await EventLogger.logUserEvent(userId, EVENT_TYPES.MESSAGE_BLOCKED, {
              reason: 'restricted_content',
              source: 'public_chat',
              chatId,
              requestId: (req as any).requestId || null,
            });
          } else {
            await EventLogger.logSystemEvent(EVENT_TYPES.MESSAGE_BLOCKED, {
              reason: 'restricted_content',
              source: 'public_chat',
              chatId,
            });
          }
        } catch (logErr) {
          logger.error('Failed to log MESSAGE_BLOCKED event (public chat):', logErr);
        }

        // 2) DB me user + AI default messages save karo
        try {
          const userMessageId = generateId.message();
          const aiMessageId = generateId.message();

          // User message
          await db.query(`
            INSERT INTO "PublicMessage" ("id", "chatId", content, sender, "createdAt")
            VALUES ($1, $2, $3, 'human', $4::timestamptz)
          `, [userMessageId, chatId, message, now]);

          // AI default reply
          await db.query(`
            INSERT INTO "PublicMessage" ("id", "chatId", content, sender, "createdAt")
            VALUES ($1, $2, $3, 'twin', $4::timestamptz)
          `, [aiMessageId, chatId, defaultText, now]);

          // Chat metadata update (1 turn = +1)
          await db.query(`
            UPDATE "PublicChat"
            SET "messageCount" = "messageCount" + 1,
                "lastActivity" = $1::timestamptz
            WHERE id = $2
          `, [now, chatId]);
        } catch (dbErr) {
          logger.warn('Failed to persist blocked public message:', dbErr);
        }

        // 3) Frontend ko normal success response
        return res.status(200).json({
          success: true,
          messages: [
            {
              id: null,
              content: defaultText,
              sender: 'twin',
              createdAt: now,
            },
          ],
          serverTime: now,
          blocked: true,
        });
      }

      // 🔁 baaki validation errors → purana behavior
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
          redirectUrl: `/chat-enhanced?twinId=${tokenizeId(chat.twinId, 'twin')}`
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
        return res.status(404).json({
          success: false,
          error: 'Public chat not found',
          errorCode: ErrorCodes.CHAT_NOT_FOUND
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
        timestamp: msg.createdAt // Keep as Date for internal AI service use
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
          createdAt: normalizeTimestamp(userMessage.createdAt),
          relativeTime: formatRelativeTime(userMessage.createdAt)
        },
        {
          id: aiMessage.id,
          content: aiResponse,
          sender: 'twin',
          createdAt: normalizeTimestamp(aiMessage.createdAt),
          relativeTime: formatRelativeTime(aiMessage.createdAt)
        }
      ],
      generatedTitle: generatedTitle || null,
      isFirstMessage: isFirstMessage,
      // ✅ FIX: Send server time so frontend can use it instead of browser time
      serverTime: new Date().toISOString()
    });

  } catch (error: any) {
    logger.error('sendPublicMessage error:', error);
    handleErrorWithSuccessFormat(error, res, 'Failed to send public message');
  }
};

// Get public chat history
export const getPublicChatHistory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { chatToken } = req.params;
    const userId = req.user?.id; //Get userId if logged in

    if (!chatToken) {
      throw createError.notFound('This chat does not exist', ErrorCodes.CHAT_NOT_FOUND);
    }

    // ✅ PHASE 4: Detokenize chatToken to get actual chatId
    const decoded = detokenizeId(chatToken);
    if (!decoded || decoded.type !== 'chat') {
      throw createError.notFound('This chat does not exist', ErrorCodes.CHAT_NOT_FOUND);
    }
    const chatId = decoded.id;

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
    
    // 🚩 NEW: If viewer is blocked for this twin, pretend the chat does not exist
    if (userId) {
      const blockedCheck = await db.query(`
        SELECT id FROM "TwinBlockedUsers"
        WHERE "twinId" = $1 AND "userId" = $2
      `, [chat.twinId, userId]);

      if (blockedCheck.rows.length > 0) {
        return res.status(404).json({
          success: false,
          error: 'Public chat not found',
          errorCode: ErrorCodes.CHAT_NOT_FOUND
        });
      }
    }

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
        publicId: tokenizeId(chat.id, 'chat'),
        publicTwinId: tokenizeId(chat.twinId, 'twin'),
        visitorId: chat.visitorId,
        messageCount: chat.messageCount,
        twinHandle: chat.publicHandle,
        sampleReply: chat.sampleReply,
        isTwinOwner: isTwinOwner,
        showChatHistory: chat.showChatHistory
      },
      messages: messagesResult.rows.map(msg => ({
        id: msg.id,
        content: msg.content,
        sender: msg.sender,
        createdAt: normalizeTimestamp(msg.createdAt),
        relativeTime: formatRelativeTime(msg.createdAt)
      })),
      // ✅ FIX: Send server time so frontend can use it instead of browser time
      serverTime: new Date().toISOString()
    });

  } catch (error: any) {
    logger.error('getPublicChatHistory error:', error);
    handleErrorWithSuccessFormat(error, res, 'Failed to get public chat history');
  }
};

// Get public chat by twin ID (for starting new chat)
export const getPublicChatByTwin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { twinToken } = req.params;
    const { visitorId } = req.query;

    // ✅ PHASE 2: Detokenize twinToken to get actual twinId
    const decoded = detokenizeId(twinToken);
    if (!decoded || decoded.type !== 'twin') {
      throw createError.notFound('This chat does not exist', ErrorCodes.TWIN_NOT_FOUND);
    }
    const twinId = decoded.id;

    const userId = req.user?.id;

// Allow access to public chat - blockNonLoggedUsers only affects discover visibility
const twinResult = await db.query(`
  SELECT id, "isPublic", "publicHandle", "sampleReply", "blockNonLoggedUsers"
  FROM "Twin" t
  WHERE t.id = $1 
    AND t."isPublic" = true
`, [twinId]);    

    if (twinResult.rows.length === 0) {
      throw createError.notFound('Public twin not found', ErrorCodes.TWIN_NOT_FOUND);
    }

    const twin = twinResult.rows[0];

    // If owner has disabled non-logged access, act as if twin does not exist
    if (!userId && twin.blockNonLoggedUsers === true) {
      throw createError.notFound('Public twin not found', ErrorCodes.TWIN_NOT_FOUND);
    }

    // Check for existing public chat
    const existingChats = await publicChatQueries.findByTwinAndVisitor(twinId, visitorId as string);

    if (existingChats && existingChats.length > 0) {
      const existingChat = existingChats[0]; // Get first chat
      // Get chat history
      const messagesResult = await db.query(`
        SELECT id, content, sender, "createdAt"
        FROM "PublicMessage"
        WHERE "chatId" = $1
        ORDER BY "createdAt" ASC
      `, [existingChat.id]);

      return res.json({
        success: true,
        chatId: tokenizeId(existingChat.id, 'chat'),
        twin: {
          publicId: tokenizeId(twin.id, 'twin'),
          publicHandle: twin.publicHandle,
          sampleReply: twin.sampleReply
        },
        messages: messagesResult.rows.map(msg => ({
          id: msg.id,
          publicChatId: tokenizeId(existingChat.id, 'chat'),
          content: msg.content,
          sender: msg.sender,
          createdAt: msg.createdAt
        }))
      });
    }

    // No existing chat, return twin info for starting new chat
    res.json({
      success: true,
      chatId: null,
      twin: {
        publicId: tokenizeId(twin.id, 'twin'),
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
    const { twinToken } = req.params;
    const { visitorId } = req.query as { visitorId?: string };
    const userId = req.user?.id;

    // ✅ FIX: Only use tokenized ID from path - remove raw ID fallback
    const decoded = detokenizeId(twinToken);
    if (!decoded || decoded.type !== 'twin') {
      throw createError.validation('Invalid twin token', ErrorCodes.INVALID_INPUT);
    }
    const twinId = decoded.id;
    logger.info('[getPublicChatsByTwin] Decoded twinToken', { twinToken, twinId });

    // Check if twin exists and is public
    const twinResult = await db.query(`
      SELECT id, "isPublic", "publicHandle", "sampleReply", "showChatHistory", "userId"
      FROM "Twin"
      WHERE id = $1 AND "isPublic" = true
    `, [twinId]);

    if (twinResult.rows.length === 0) {
      // 🔸 Soft-fail: twin nahi mila to empty history bhejo, server crash mat karo
      logger.warn('[getPublicChatsByTwin] Twin not found or not public, returning empty history', { twinId });

      return res.json({
        success: true,
        twin: null,
        chats: [],
        serverTime: new Date().toISOString()
      });
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
      // ✅ History disabled for non-owner → hide ALL previous chats in sidebar
      // (User can still see their active conversation via direct chat view)
      logger.info(`[getPublicChatsByTwin] History disabled - hiding all chats for non-owner viewer`);
      
      // Fake an empty result so the mapping below still works
      chatsResult = { rows: [] } as { rows: any[] };
    } else {
      // ✅ Show ALL chats if history is enabled (true) OR user is owner OR null/undefined
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
          AND pc."messageCount" > 0
          AND (
            (pc."userId" = $2 AND $2 IS NOT NULL) 
            OR 
            (pc."visitorId" = $3 AND $2 IS NULL AND $3 IS NOT NULL)
          )
        ORDER BY pc."lastActivity" DESC NULLS LAST, pc."createdAt" DESC
      `, [twinId, userId || null, visitorId as string || null]);
    }

const chats = chatsResult.rows.map(chat => sanitizePublicChat({
  id: chat.id,
  twinId: chat.twinId,
  userId: chat.userId,
  visitorId: chat.visitorId,
  messageCount: chat.messageCount || 0,
  createdAt: chat.createdAt,
  lastActivity: chat.lastActivity,
  title: chat.title || null,
  last_message: chat.last_message,
  last_message_time: chat.last_message_time
}));    

    logger.info(`[getPublicChatsByTwin] Returning ${chats.length} chats for twinId: ${twinId}`);
    logger.info(`[getPublicChatsByTwin] First chat sample:`, chats[0] ? JSON.stringify(chats[0]) : 'no chats');

    const responseData = {
      success: true,
      twin: {
        publicId: tokenizeId(twin.id, 'twin'),
        publicHandle: twin.publicHandle,
        sampleReply: twin.sampleReply,
        showChatHistory: twin.showChatHistory
      },
      chats,
      // ✅ FIX: Send server time so frontend can use it instead of browser time
      serverTime: new Date().toISOString()
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
    const { twinToken, visitorId } = req.body;

    // ✅ FIX: Better validation - check for empty string too
    if (!twinToken || typeof twinToken !== 'string' || twinToken.trim() === '') {
      logger.warn('[createNewPublicChat] Missing or empty twinToken', { body: req.body });
      throw createError.validation('Twin token is required', ErrorCodes.INVALID_INPUT);
    }

    // ✅ FIX: Add better error logging
    let decoded;
    try {
      decoded = detokenizeId(twinToken, {
        userId: req.user?.id,
        endpoint: 'createNewPublicChat',
      });
    } catch (detokenizeError) {
      logger.error('[createNewPublicChat] Detokenization failed', {
        twinToken: twinToken.substring(0, 20) + '...', // Log partial token for debugging
        error: detokenizeError instanceof Error ? detokenizeError.message : String(detokenizeError),
        userId: req.user?.id
      });
      throw createError.validation('Invalid twin token', ErrorCodes.INVALID_INPUT);
    }

    if (!decoded || decoded.type !== 'twin' || !decoded.id) {
      logger.warn('[createNewPublicChat] Invalid decoded token', {
        decoded: decoded ? { type: decoded.type, hasId: !!decoded.id } : null,
        twinToken: twinToken.substring(0, 20) + '...'
      });
      throw createError.validation('Invalid twin token', ErrorCodes.INVALID_INPUT);
    }
    const twinId = decoded.id;
    logger.info(`[createNewPublicChat] Decoded from token: ${twinId}`);

    const userId = req.user?.id || undefined;
    logger.info(`[createNewPublicChat] Twin: ${twinId}, UserId: ${userId || 'anonymous'}, VisitorId: ${visitorId || 'none'}`);

    const twinResult = await db.query(`
      SELECT id, "isPublic", "styleVector", "sampleReply"
      FROM "Twin"
      WHERE id = $1 AND "isPublic" = true
    `, [twinId]);

    if (twinResult.rows.length === 0) {
      throw createError.notFound('Public twin not found', ErrorCodes.TWIN_NOT_FOUND);
    }

    const twin = twinResult.rows[0];

    // Create new public chat
    const publicChat = await publicChatQueries.create(twinId, visitorId || undefined, userId);
    logger.info(`[createNewPublicChat] Chat created - ChatId: ${publicChat.id}, UserId: ${publicChat.userId || 'null'}`);

    res.json({
      success: true,
      chatId: tokenizeId(publicChat.id, 'chat'),
      twin: {
        publicId: tokenizeId(twin.id, 'twin'),
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
          AND NOT EXISTS (
            SELECT 1
            FROM "TwinBlockedUsers" tbu
            WHERE tbu."twinId" = t.id
              AND tbu."userId" = $1
          )
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
          t."verified",
          t."userId" as "userId",
          u.handle as "userHandle",
          u.name   as "userName",
          u."profileImage" as "userProfileImage"
        FROM "PublicChat" pc
        JOIN "Twin" t ON pc."twinId" = t.id
        JOIN "User" u ON t."userId" = u.id
        WHERE pc."userId" = $1 
          AND t."isPublic" = true
          AND NOT EXISTS (
            SELECT 1
            FROM "TwinBlockedUsers" tbu
            WHERE tbu."twinId" = t.id
              AND tbu."userId" = $1
          )
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

    // ✅ NOW: send userHandle + userName into sanitizeTwin
    const twinChats = chatsResult.rows.map(row => ({
      twin: sanitizeTwin({
        id: row.twinId,
        userId: row.userId,
        publicHandle: row.publicHandle,
        bio: row.bio,
        profileImage: row.profileImage,
        likeCount: row.likeCount || 0,
        chatCount: row.chatCount || 0,
        followCount: row.followCount || 0,
        verified: row.verified || false,
        userHandle: row.userHandle,
        userName: row.userName,
        userProfileImage: row.userProfileImage,
      }),
      latestChat: sanitizePublicChat({
        id: row.chat_id,
        messageCount: row.latest_chat_message_count || 0,
        createdAt: row.latest_chat_created_at,
        lastActivity: row.latest_chat_last_activity,
        title: row.latest_chat_title
      }),
      totalChats: parseInt(row.total_chats || '0', 10),
      totalMessages: parseInt(row.total_messages || '0', 10),
      lastMessage: row.last_message_content ? {
        content: row.last_message_content,
        createdAt: normalizeTimestamp(row.last_message_time),
        relativeTime: formatRelativeTime(row.last_message_time)
      } : null
    }));

    logger.info(`[getUserPublicChats] Found ${twinChats.length} unique twins with chats for userId: ${userId}`);

    res.json({
      success: true,
      chats: twinChats,
      total: twinChats.length,
      serverTime: new Date().toISOString()
    });
  } catch (error) {
    handleControllerError(error, 'Failed to get user public chats');
  }
};



// Delete public chat
export const deletePublicChat = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { chatToken } = req.params;
    const userId = req.user?.id; // ✅ FIX: Get userId from req.user

    if (!chatToken) {
      throw createError.validation('Chat token is required', ErrorCodes.INVALID_INPUT);
    }

    // ✅ PHASE 4: Detokenize chatToken to get actual chatId
    const decoded = detokenizeId(chatToken);
    if (!decoded || decoded.type !== 'chat') {
      throw createError.validation('Invalid chat token', ErrorCodes.INVALID_INPUT);
    }
    const chatId = decoded.id;

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
    const { chatToken } = req.params;
    const { title } = req.body;

    if (!chatToken) {
      throw createError.validation('Chat token is required', ErrorCodes.INVALID_INPUT);
    }

    // ✅ PHASE 4: Detokenize chatToken to get actual chatId
    const decoded = detokenizeId(chatToken);
    if (!decoded || decoded.type !== 'chat') {
      throw createError.validation('Invalid chat token', ErrorCodes.INVALID_INPUT);
    }
    const chatId = decoded.id;

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
    // ✅ FIX: Use JavaScript Date for UTC timestamp
    const utcTimestamp = new Date().toISOString();
    await db.query(`
      UPDATE "PublicChat" SET "title" = $1, "lastActivity" = $2::timestamptz WHERE id = $3
    `, [title.trim(), utcTimestamp, chatId]);
    
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
    const { twinToken } = req.params;
    const userId = req.user?.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 5, 50);
    const offset = (page - 1) * limit;

    // ✅ NEW: Filter parameters
    const view = (req.query.view as string) || 'chat'; // 'chat' | 'user'
    const filterUserId = req.query.userId as string | undefined;
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;
    const search = req.query.search as string | undefined;
    const sortBy = (req.query.sortBy as string) || 'lastActivity'; // 'lastActivity' | 'createdAt' | 'messageCount'
    const participantType = (req.query.participantType as string) || 'all'; // ✅ NEW

    if(!userId){
      throw createError.unauthorized('Authentication required');
    }

      // ✅ PHASE 2: Detokenize twinToken to get actual twinId
      const decoded = detokenizeId(twinToken);
      if (!decoded || decoded.type !== 'twin') {
        throw createError.validation('Invalid twin token', ErrorCodes.INVALID_INPUT);
      }
      const twinId = decoded.id;

    // Verify twin ownership
    const twinResult = await db.query(`
      SELECT id, "publicHandle", "isPublic", "userId"
      FROM "Twin"
      WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);

    if (twinResult.rows.length === 0) {
      throw createError.notFound('This chat does not exist', ErrorCodes.TWIN_NOT_FOUND);
    }

    const twin = twinResult.rows[0];

    // ✅ Build dynamic WHERE conditions
    let whereConditions = ['pc."twinId" = $1'];
    let params: any[] = [twinId];
    let paramIndex = 2;

    // ✅ NEW: hide chat partners who have blocked the twin owner on ANY of their twins
    // If pc."userId" is NULL (anonymous), we always show it.
    if (userId) {
      whereConditions.push(`
        (
          pc."userId" IS NULL
          OR NOT EXISTS (
            SELECT 1
            FROM "Twin" t2
            JOIN "TwinBlockedUsers" tbu ON tbu."twinId" = t2.id
            WHERE t2."userId" = pc."userId"
              AND tbu."userId" = $${paramIndex}
          )
        )
      `);
      params.push(userId);
      paramIndex++;
    }

    // ✅ NEW: filter by participant type
if (participantType === 'loggedIn') {
  whereConditions.push('pc."userId" IS NOT NULL');
} else if (participantType === 'anonymous') {
  whereConditions.push('pc."userId" IS NULL');
}


    if (filterUserId) {
      whereConditions.push(`pc."userId" = $${paramIndex}`);
      params.push(filterUserId);
      paramIndex++;
    }

// Around line 1405-1415:
if (dateFrom) {
  // ✅ FIX: If dateFrom is date-only (YYYY-MM-DD), treat as start of day UTC
  // PostgreSQL will handle the conversion, but we ensure it's treated as UTC
  let dateFromParam = dateFrom;
  if (typeof dateFrom === 'string' && dateFrom.match(/^\d{4}-\d{2}-\d{2}$/)) {
    // It's a date-only string, PostgreSQL will interpret as midnight UTC when cast to timestamptz
    dateFromParam = dateFrom + 'T00:00:00.000Z';
  }
  whereConditions.push(`COALESCE(pc."lastActivity", pc."createdAt") >= $${paramIndex}::timestamptz`);
  params.push(dateFromParam);
  paramIndex++;
}

if (dateTo) {
  // ✅ FIX: If dateTo is date-only (YYYY-MM-DD), treat as end of day UTC
  let dateToParam = dateTo;
  if (typeof dateTo === 'string' && dateTo.match(/^\d{4}-\d{2}-\d{2}$/)) {
    // It's a date-only string, set to end of day
    dateToParam = dateTo + 'T23:59:59.999Z';
  }
  whereConditions.push(`COALESCE(pc."lastActivity", pc."createdAt") <= $${paramIndex}::timestamptz`);
  params.push(dateToParam);
  paramIndex++;
}    

    // ✅ Build search condition (search in messages)
    let searchJoin = '';
    let searchCondition = '';
    if (search && search.trim()) {
      searchJoin = `
        INNER JOIN "PublicMessage" pm_search ON pc.id = pm_search."chatId"
      `;
      searchCondition = `AND pm_search.content ILIKE $${paramIndex}`;
      params.push(`%${search.trim()}%`);
      paramIndex++;
    }

    // ✅ Build ORDER BY clause
    let orderByClause = '';
    switch (sortBy) {
      case 'createdAt':
        orderByClause = 'pc."createdAt" DESC';
        break;
      case 'messageCount':
        orderByClause = 'pc."messageCount" DESC';
        break;
      case 'lastActivity':
      default:
        orderByClause = 'COALESCE(pc."lastActivity", pc."createdAt") DESC';
        break;
    }

    // Get total count with filters
    const totalResult = await db.query(`
      SELECT COUNT(DISTINCT pc.id) as total
      FROM "PublicChat" pc
      ${searchJoin}
      WHERE ${whereConditions.join(' AND ')}
      ${searchCondition}
    `, params);

    const total = parseInt(totalResult.rows[0]?.total || '0', 10);

      // ✅ ADD: Check anonymous chats specifically
      const anonymousCheck = await db.query(`
        SELECT COUNT(*) as count, 
               COUNT(*) FILTER (WHERE pc."messageCount" > 0) as with_messages
        FROM "PublicChat" pc
        WHERE pc."twinId" = $1 
          AND pc."userId" IS NULL 
          AND pc."visitorId" IS NOT NULL
      `, [twinId]);
      
      logger.info(`[getAllPublicChatsForTwin] 📊 Anonymous chats check:`, {
        twinId,
        totalAnonymous: anonymousCheck.rows[0]?.count || 0,
        anonymousWithMessages: anonymousCheck.rows[0]?.with_messages || 0,
        totalAfterFilters: total,
        participantType,
        whereConditions: whereConditions.join(' AND ')
      });

    // Get all public chats with user/visitor info and message counts
    // ✅ FIX: Remove DISTINCT and use subquery to avoid ORDER BY issues
    // DISTINCT is only needed when searchJoin creates duplicates
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
      SELECT t2."publicHandle"
      FROM "Twin" t2
      WHERE t2."userId" = u.id
        AND t2."isPublic" = true
        AND (t2."blockNonLoggedUsers" = false OR t2."blockNonLoggedUsers" IS NULL)
      ORDER BY t2."createdAt" DESC
      LIMIT 1
    ) as user_public_twin_handle,
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
        ) as last_message_time,
        CASE WHEN pc."userId" IS NOT NULL THEN 0 ELSE 1 END as user_priority
      FROM "PublicChat" pc
      LEFT JOIN "User" u ON pc."userId" = u.id
      ${searchJoin}
      WHERE ${whereConditions.join(' AND ')}
      ${searchCondition}
      ${search && search.trim() ? 'GROUP BY pc.id, pc."twinId", pc."userId", pc."visitorId", pc."messageCount", pc."title", pc."createdAt", pc."lastActivity", u.id, u.handle, u.name, u."profileImage"' : ''}
      ORDER BY 
        user_priority,
        ${orderByClause}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, [...params, limit, offset]);    

const chats = chatsResult.rows.map(chatRow => {
  // Base sanitized chat (tokens, no raw IDs)
  const base = sanitizePublicChat({
    id: chatRow.id,
    twinId: chatRow.twinId,
    userId: chatRow.userId,
    visitorId: chatRow.visitorId,
    messageCount: chatRow.messageCount || 0,
    createdAt: chatRow.createdAt,
    lastActivity: chatRow.lastActivity,
    title: chatRow.title || 'Untitled Chat',
    last_message: chatRow.last_message_content,
    last_message_time: chatRow.last_message_time
  });

  // ✅ Attach user object if logged-in user exists
  const user = chatRow.user_id ? {
    publicId: tokenizeId(chatRow.user_id, 'user'),
    handle: chatRow.user_handle,
    name: chatRow.user_name,
    profileImage: chatRow.user_profile_image,
    publicTwinHandle: chatRow.user_public_twin_handle || null,
  } : null;

  return {
    ...base,
    user,               // used by twin-public-chat-history.ejs
    // keep visitor info for anonymous UI if needed
    visitorId: base.visitorId ?? null,
  };
});  

    res.json({
      success: true,
      chats: chats,
      twin: {
        publicId: tokenizeId(twin.id, 'twin'),
        publicHandle: twin.publicHandle
      },
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: limit
      },
      filters: {
        view,
        userId: filterUserId,
        dateFrom,
        dateTo,
        search,
        sortBy,
        participantType
      }
    });

  } catch (error) {
    handleControllerError(error, 'Failed to get public chats for twin');
  }
};

// ✅ NEW: Get public chats grouped by user
export const getUserWisePublicChats = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { twinToken } = req.params;
    const userId = req.user?.id;

    // ✅ PHASE 2: Detokenize twinToken to get actual twinId
    const decoded = detokenizeId(twinToken);
    if (!decoded || decoded.type !== 'twin') {
      throw createError.validation('Invalid twin token', ErrorCodes.INVALID_INPUT);
    }

    const twinId = decoded.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
    const offset = (page - 1) * limit;

    // Filter parameters
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;
    const search = req.query.search as string | undefined;
    const sortBy = (req.query.sortBy as string) || 'lastActivity';
    const userSortBy = (req.query.userSortBy as string) || 'lastActivity';
    const minMessages = req.query.minMessages ? parseInt(req.query.minMessages as string, 10) : undefined;
    const maxMessages = req.query.maxMessages ? parseInt(req.query.maxMessages as string, 10) : undefined;

    // ✅ Optional: filter by a specific participant user (for /public-chat-history?view=user&userId=...)
    const userFilterToken = req.query.userId as string | undefined;
    let participantUserId: string | null = null;
    if (userFilterToken) {
      try {
        const decodedUser = detokenizeId(userFilterToken);
        if (decodedUser && decodedUser.type === 'user') {
          participantUserId = decodedUser.id;
        } else {
          logger.warn('[getUserWisePublicChats] Invalid userId token type', { userFilterToken });
        }
      } catch (err) {
        logger.warn('[getUserWisePublicChats] Failed to detokenize userId filter, ignoring', {
          userFilterToken,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

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
      throw createError.notFound('This chat does not exist', ErrorCodes.TWIN_NOT_FOUND);
    }

    const twin = twinResult.rows[0];

    // Build WHERE conditions for filtering INDIVIDUAL CHATS (not users)
    let whereConditions = ['pc."twinId" = $1', 'pc."userId" IS NOT NULL'];
    let params: any[] = [twinId];
    let paramIndex = 2;

    // ✅ If we're filtering a specific participant, lock to that user
    if (participantUserId) {
      whereConditions.push(`pc."userId" = $${paramIndex}`);
      params.push(participantUserId);
      paramIndex++;
    }

    if (dateFrom) {
      whereConditions.push(`pc."createdAt" >= $${paramIndex}::timestamptz`);
      params.push(dateFrom);
      paramIndex++;
    }

    if (dateTo) {
      whereConditions.push(`pc."createdAt" <= $${paramIndex}::timestamptz`);
      params.push(dateTo);
      paramIndex++;
    }

    // ✅ FIX: Apply message count filters to INDIVIDUAL CHATS (not users)
    if (minMessages !== undefined && !isNaN(minMessages)) {
      whereConditions.push(`pc."messageCount" >= $${paramIndex}`);
      params.push(minMessages);
      paramIndex++;
    }

    if (maxMessages !== undefined && !isNaN(maxMessages)) {
      whereConditions.push(`pc."messageCount" <= $${paramIndex}`);
      params.push(maxMessages);
      paramIndex++;
    }

    // ✅ NEW: Exclude users who have blocked this owner via their own twins
    // If any twin owned by participant user (pc."userId") has blocked the current owner (userId),
    // completely hide that participant from this twin's analytics top users.
    whereConditions.push(`
      NOT EXISTS (
        SELECT 1
        FROM "Twin" t2
        JOIN "TwinBlockedUsers" tbu ON tbu."twinId" = t2.id
        WHERE t2."userId" = pc."userId"
          AND tbu."userId" = $${paramIndex}
      )
    `);
    params.push(userId);
    paramIndex++;

    // Search condition
    let searchJoin = '';
    let searchCondition = '';
    if (search && search.trim()) {
      searchJoin = `
        INNER JOIN "PublicMessage" pm_search ON pc.id = pm_search."chatId"
      `;
      searchCondition = `AND pm_search.content ILIKE $${paramIndex}`;
      params.push(`%${search.trim()}%`);
      paramIndex++;
    }


    // ✅ NEW: Build ORDER BY clause for USER sorting
    let userOrderByClause = '';
    switch (userSortBy) {
      case 'totalMessages':
        userOrderByClause = 'total_messages DESC';
        break;
      case 'totalChats':
        userOrderByClause = 'total_chats DESC';
        break;
      case 'lastActivity':
      default:
        userOrderByClause = 'last_activity DESC';
        break;
    }

    // Get users with their chat stats (based on FILTERED chats)
    const usersResult = await db.query(`
      SELECT DISTINCT
        u.id as user_id,
        u.handle as user_handle,
        u.name as user_name,
        u."profileImage" as user_profile_image,
        -- ✅ NEW: Get user's first public twin handle
        (SELECT t."publicHandle" 
         FROM "Twin" t 
         WHERE t."userId" = u.id 
           AND t."isPublic" = true
           AND (t."blockNonLoggedUsers" = false OR t."blockNonLoggedUsers" IS NULL)
         ORDER BY t."createdAt" DESC 
         LIMIT 1) as user_public_twin_handle,
        COUNT(DISTINCT pc.id) as total_chats,
        SUM(pc."messageCount") as total_messages,
        MAX(COALESCE(pc."lastActivity", pc."createdAt")) as last_activity
      FROM "PublicChat" pc
      INNER JOIN "User" u ON pc."userId" = u.id
      ${searchJoin}
      WHERE ${whereConditions.join(' AND ')}
      ${searchCondition}
      GROUP BY u.id, u.handle, u.name, u."profileImage"
      ORDER BY ${userOrderByClause}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, [...params, limit, offset]);

    // Get total user count (users who have at least one chat matching filters)
    const totalUsersResult = await db.query(`
      SELECT COUNT(DISTINCT u.id) as total
      FROM "PublicChat" pc
      INNER JOIN "User" u ON pc."userId" = u.id
      ${searchJoin}
      WHERE ${whereConditions.join(' AND ')}
      ${searchCondition}
    `, params);

    const totalUsers = parseInt(totalUsersResult.rows[0]?.total || '0', 10);

    // ✅ NEW: Build ORDER BY clause for CHAT sorting (within each user)
    let chatOrderByClause = '';
    switch (sortBy) {
      case 'messageCount':
        chatOrderByClause = 'pc."messageCount" DESC';
        break;
      case 'createdAt':
        chatOrderByClause = 'pc."createdAt" DESC';
        break;
      case 'lastActivity':
      default:
        chatOrderByClause = 'COALESCE(pc."lastActivity", pc."createdAt") DESC';
        break;
    }

    // For each user, get their FILTERED chats (with same filters applied)
    const usersWithChats = await Promise.all(
      usersResult.rows.map(async (userRow) => {
        // Build WHERE conditions for individual user chats (apply ALL filters)
        let chatWhereConditions = [
          'pc."twinId" = $1',
          'pc."userId" = $2',
          // ✅ NEW: hide this user entirely if they have blocked the owner
          `NOT EXISTS (
            SELECT 1
            FROM "Twin" t2
            JOIN "TwinBlockedUsers" tbu ON tbu."twinId" = t2.id
            WHERE t2."userId" = pc."userId"
              AND tbu."userId" = $3
          )`
        ];
        let chatParams: any[] = [twinId, userRow.user_id, userId];
        let chatParamIndex = 4;

        // Apply date filters to individual chats
        if (dateFrom) {
          chatWhereConditions.push(`pc."createdAt" >= $${chatParamIndex}::timestamptz`);
          chatParams.push(dateFrom);
          chatParamIndex++;
        }

        if (dateTo) {
          chatWhereConditions.push(`pc."createdAt" <= $${chatParamIndex}::timestamptz`);
          chatParams.push(dateTo);
          chatParamIndex++;
        }

        // ✅ FIX: Apply message count filters to INDIVIDUAL CHATS
        if (minMessages !== undefined && !isNaN(minMessages)) {
          chatWhereConditions.push(`pc."messageCount" >= $${chatParamIndex}`);
          chatParams.push(minMessages);
          chatParamIndex++;
        }

        if (maxMessages !== undefined && !isNaN(maxMessages)) {
          chatWhereConditions.push(`pc."messageCount" <= $${chatParamIndex}`);
          chatParams.push(maxMessages);
          chatParamIndex++;
        }

        // Add search condition for individual chats
        let chatSearchJoin = '';
        let chatSearchCondition = '';
        if (search && search.trim()) {
          chatSearchJoin = `
            INNER JOIN "PublicMessage" pm_chat_search ON pc.id = pm_chat_search."chatId"
          `;
          chatSearchCondition = `AND pm_chat_search.content ILIKE $${chatParamIndex}`;
          chatParams.push(`%${search.trim()}%`);
          chatParamIndex++;
        }

        const userChatsResult = await db.query(`
          SELECT DISTINCT
            pc.id,
            pc."messageCount",
            pc."title",
            pc."createdAt",
            pc."lastActivity",
            COALESCE(pc."lastActivity", pc."createdAt") as sort_date,
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
          ${chatSearchJoin}
          WHERE ${chatWhereConditions.join(' AND ')}
          ${chatSearchCondition}
          ORDER BY ${chatOrderByClause}
          LIMIT 10
        `, chatParams);

        return {
          user: {
            publicId: tokenizeId(userRow.user_id, 'user'),
            handle: userRow.user_handle,
            name: userRow.user_name,
            profileImage: userRow.user_profile_image,
            publicTwinHandle: userRow.user_public_twin_handle || null // ✅ NEW: Include twin handle
          },
          totalChats: parseInt(userRow.total_chats || '0', 10),
          totalMessages: parseInt(userRow.total_messages || '0', 10),
          lastActivity: normalizeTimestamp(userRow.last_activity),
          chats: userChatsResult.rows.map(chat => sanitizePublicChat({
            id: chat.id,
            twinId: chat.twinId,
            userId: chat.userId,
            visitorId: chat.visitorId,
            messageCount: chat.messageCount || 0,
            createdAt: chat.createdAt,
            lastActivity: chat.lastActivity,
            title: chat.title || 'Untitled Chat',
            last_message: chat.last_message_content,
            last_message_time: chat.last_message_time
          }))          
        };
      })
    );

    res.json({
      success: true,
      users: usersWithChats,
      twin: {
        publicId: tokenizeId(twin.id, 'twin'),
        publicHandle: twin.publicHandle
      },
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalUsers / limit),
        totalItems: totalUsers,
        itemsPerPage: limit
      },
      filters: {
        dateFrom,
        dateTo,
        search,
        sortBy, // For sorting chats within users
        userSortBy, // For sorting users
        minMessages,
        maxMessages
      }
    });

  } catch (error) {
    handleControllerError(error, 'Failed to get user-wise public chats');
  }
};

// ✅ NEW: Get public chat history for viewing (read-only, for twin owners)
export const viewPublicChatHistory = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    // 🔥 Accept both :chatId (from view page) and :chatToken (from route definition)
    const rawChatId = (req.params.chatId || req.params.chatToken) as string | undefined;
    const userId = req.user?.id;

    if (!userId) {
      throw createError.unauthorized('Authentication required');
    }

    if (!rawChatId) {
      throw createError.validation('Chat id is required', ErrorCodes.INVALID_INPUT);
    }

    // Get chat with twin info
    const chatResult = await db.query(`
      SELECT 
        pc.id, pc."twinId", pc."visitorId", pc."messageCount", 
        pc."title", pc."createdAt", pc."lastActivity",
        t."publicHandle" as publicHandle,
        t."userId" as twin_owner_id,
        u.id as user_id,
        u.handle as user_handle,
        u.name as user_name,
        u."profileImage" as user_profile_image,
        -- ✅ NEW: Get user's public twin handle
        (SELECT t2."publicHandle" 
         FROM "Twin" t2 
         WHERE t2."userId" = u.id 
           AND t2."isPublic" = true
         ORDER BY t2."createdAt" DESC 
         LIMIT 1) as user_public_twin_handle
      FROM "PublicChat" pc
      LEFT JOIN "Twin" t ON pc."twinId" = t.id
      LEFT JOIN "User" u ON pc."userId" = u.id
      WHERE pc.id = $1
    `, [rawChatId]);

    if (chatResult.rows.length === 0) {
      throw createError.notFound('This chat does not exist', ErrorCodes.CHAT_NOT_FOUND);
    }

    const chat = chatResult.rows[0];

    // ✅ Verify twin ownership
    const isTwinOwner = chat.twin_owner_id === userId;
    if (!isTwinOwner) {
      throw createError.unauthorized('Access denied. Only twin owner can view this chat.');
    }

    // Get all messages
    const messagesResult = await db.query(`
      SELECT id, content, sender, "createdAt"
      FROM "PublicMessage"
      WHERE "chatId" = $1
      ORDER BY "createdAt" ASC NULLS LAST
    `, [rawChatId]);

    res.json({
      success: true,
      chat: {
        publicId: tokenizeId(chat.id, 'chat'),
        publicTwinId: tokenizeId(chat.twinId, 'twin'),
        twinHandle: chat.publicHandle,
        title: chat.title || 'Untitled Chat',
        messageCount: chat.messageCount || 0,
        createdAt: normalizeTimestamp(chat.createdAt),
        lastActivity: normalizeTimestamp(chat.lastActivity),
        user: chat.user_id ? {
          publicId: tokenizeId(chat.user_id, 'user'),
          handle: chat.user_handle,
          name: chat.user_name,
          profileImage: chat.user_profile_image,
          publicTwinHandle: chat.user_public_twin_handle || null // ✅ NEW
        } : null,
        isAnonymous: !chat.userId && !!chat.visitorId,
        visitorId: chat.visitorId
      },
      messages: messagesResult.rows.map(msg => ({
        id: msg.id,
        content: msg.content,
        sender: msg.sender,
        createdAt: normalizeTimestamp(msg.createdAt),
        relativeTime: formatRelativeTime(msg.createdAt)
      })),
      serverTime: new Date().toISOString()
    });

  } catch (error) {
    handleControllerError(error, 'Failed to get chat history');
  }
};