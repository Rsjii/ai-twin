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
import { handleControllerError } from '../../utils/errorHandler';
import { logEvent } from '../../services/eventLogger';
import { QUERY_LIMITS } from '../../config/constants';

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
    const chatResult = await db.query(`
      INSERT INTO "Chat" (id, "userId", "twinId", "createdAt")
      VALUES ($1, $2, $3, NOW())
      RETURNING *
    `, [chatId, req.user.id, twin.id]);
    const chat = chatResult.rows[0];
    
    // Log chat started event
    await logEvent(req.user.id, 'chat_started', { chatId: chat.id, twinId: twin.id });
    
    res.json({
      success: true,
      chatId: chat.id,
      redirect: `/chat/${chat.id}`,
    });
  } catch (error) {
    handleControllerError(error, 'Failed to start chat');
  }
};

export const getChat = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    
    if (!req.user) {
      throw createError.unauthorized();
    }

    if (!id) {
      throw createError.validation('Chat ID is required');
    }

    // Get chat with twin information using raw SQL
    const chatResult = await db.query(`
      SELECT c.id, c."userId", c."twinId", c."createdAt", c."chatVector",
             t.id as twin_id, t."styleVector", t."sampleReply"
      FROM "Chat" c
      JOIN "Twin" t ON c."twinId" = t.id
      WHERE c.id = $1 AND c."userId" = $2
    `, [id, req.user.id]);
    
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
    `, [id]);

    const chatData = {
      id: chat.id,
      userId: chat.userId,
      twinId: chat.twinId,
      createdAt: chat.createdAt,
      chatVector: chat.chatVector,
      twin: {
        id: chat.twin_id,
        styleVector: chat.styleVector,
        sampleReply: chat.sampleReply,
      },
      messages: messagesResult.rows
    };
    
    res.json({ chat: chatData });
  } catch (error) {
    handleControllerError(error, 'Failed to get chat');
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
      id: chat.id,
      twinId: chat.twinId,
      title: chat.title || null, // ✅ Include title
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt || chat.createdAt, // Use updatedAt or fallback to createdAt
      messageCount: chat.messageCount || 0,
      lastMessage: chat.last_message || null, // Frontend expects lastMessage
      twin: {
        id: chat.twin_id,
        sampleReply: chat.sampleReply
      }
    }));
    
    res.json({ chats: formattedChats });
  } catch (error) {
    handleControllerError(error, 'Failed to get chats');
  }
};

// Get chat history for user (all previous chats)
export const getChatHistory = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
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
        t."sampleReply" as twinName
      FROM "Chat" c
      JOIN "Twin" t ON c."twinId" = t.id
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
      id: chat.id,
      twinId: chat.twinId,
      title: chat.title || 'New Chat',
      summary: chat.summary || '',
      lastMessage: chat.lastMessage || '',
      messageCount: chat.messageCount || 0,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
      twinName: chat.twinName || 'AI Twin'
    }));

    const total = parseInt(totalResult.rows[0]?.total || '0', 10);
    
    res.json({
      success: true,
      chats,
      total: total,
      page: page,
      limit: limit,
      totalPages: Math.ceil(total / limit)
    });

  } catch (error) {
    handleControllerError(error, 'Failed to get chat history');
  }
};

// Get specific chat with all messages
export const getChatMessages = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    
    if (!req.user) {
      throw createError.unauthorized();
    }

    if (!id) {
      throw createError.validation('Chat ID is required');
    }

    // Get chat with twin information using raw SQL
    const chatResult = await db.query(`
      SELECT c.id, c."userId", c."twinId", c."createdAt", c."chatVector",
             t.id as twin_id, t."styleVector", t."sampleReply"
      FROM "Chat" c
      JOIN "Twin" t ON c."twinId" = t.id
      WHERE c.id = $1 AND c."userId" = $2
    `, [id, req.user.id]);

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
    `, [id]);

    res.json({
      success: true,
      chat: {
        id: chat.id,
        twinId: chat.twinId,
        chatVector: chat.chatVector,
        twin: {
          id: chat.twin_id,
          styleVector: chat.styleVector,
          sampleReply: chat.sampleReply,
        },
        messages: messagesResult.rows,
        createdAt: chat.createdAt,
      },
    });
  } catch (error) {
    handleControllerError(error, 'Failed to get chat messages');
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
      const newChatResult = await db.query(`
        INSERT INTO "Chat" ("id", "userId", "twinId", "createdAt")
        VALUES ($1, $2, $3, NOW())
        RETURNING id, "userId", "twinId", "createdAt"
      `, [
        generateId.chat(),
        req.user.id,
        twin.id
      ]);
      chat = newChatResult.rows[0];
    }

    // Log chat continued/started event
    await logEvent(req.user.id, existingChat ? 'chat_continued' : 'chat_started', { chatId: chat.id, twinId: twin.id });

    res.json({
      success: true,
      chatId: chat.id,
      isNewChat: !existingChat,
      redirect: `/chat/${chat.id}`,
    });
  } catch (error) {
    handleControllerError(error, 'Failed to continue chat');
  }
};

export const generateDraft = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { messages } = generateDraftSchema.parse(req.body);
    const { id } = req.params;
    
    if (!req.user) {
      throw createError.unauthorized();
    }

    if (!id) {
      throw createError.validation('Chat ID is required');
    }

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
    `, [id, req.user.id]);
    
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
      twinId: chat.twinId // Add twinId for memory retrieval
    };

    // Generate draft with full context
    const draftResult = await twinService.generateDraftWithContext(context);
    // Handle both string and object response
    const draft = typeof draftResult === 'object' && draftResult.response 
      ? draftResult.response 
      : (typeof draftResult === 'string' ? draftResult : '');
    
    // Log draft generated event
      await logEvent(req.user.id, 'draft_generated', { chatId: chat.id, twinId: chat.twinId });
    
    res.json({ draft });
  } catch (error) {
    handleControllerError(error, 'Failed to generate draft');
  }
};

export const sendMessage = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { content } = sendMessageSchema.parse(req.body);
    const { id } = req.params;
    
    if (!req.user) {
      throw createError.unauthorized();
    }

    // Validate message
    if (!validateMessageLength(content)) {
      throw createError.validation('Message length invalid');
    }

    if (checkBlacklist(content)) {
      throw createError.validation('Message contains restricted content');
    }

    if (!id) {
      throw createError.validation('Chat ID is required');
    }

    // Get chat using raw SQL
    const chatResult = await db.query(`
      SELECT id, "userId", "twinId"
      FROM "Chat"
      WHERE id = $1 AND "userId" = $2
    `, [id, req.user.id]);
    
    if (chatResult.rows.length === 0) {
      throw createError.notFound('Chat not found', ErrorCodes.CHAT_NOT_FOUND);
    }
    
    const chat = chatResult.rows[0];
    
    // Save message using raw SQL
    const messageResult = await db.query(`
      INSERT INTO "Message" ("id", "chatId", sender, content, approved, "createdAt")
      VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING id, "chatId", sender, content, approved, "createdAt"
    `, [
      generateId.message(),
      chat.id,
      'twin',
      content,
      true
    ]);
    
    const message = messageResult.rows[0];

    // Log message approved event using raw SQL
    await logEvent(req.user.id, 'message_approved', { chatId: chat.id, messageId: message.id });

    // Update style vector based on new conversation (async, don't wait)
    updateStyleVectorAfterChat(chat.twinId, req.user.id).catch(error => {
      logger.error('Style vector update failed:', error);
    });
    
    res.json({
      success: true,
      message: {
        id: message.id,
        content: message.content,
        sender: message.sender,
        createdAt: message.createdAt,
      },
    });
  } catch (error) {
    handleControllerError(error, 'Failed to send message');
  }
};

// New function to handle user messages and generate AI responses
export const handleUserMessage = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { message } = req.body;
    const { id } = req.params;
    
    if (!req.user) {
      throw createError.unauthorized();
    }

    // ✅ Use shared validation
    chatUtils.validateMessage(message);

    if (!id) {
      throw createError.validation('Chat ID is required');
    }

    // Get chat with twin information
    const chatResult = await db.query(`
      SELECT c.id, c."userId", c."twinId", c."createdAt", c."chatVector",
             t.id as twin_id, t."styleVector", t."sampleReply", t."instructions", 
             t."personaData", t."systemPrompt", t."tokenLimit"
      FROM "Chat" c
      JOIN "Twin" t ON c."twinId" = t.id
      WHERE c.id = $1 AND c."userId" = $2
    `, [id, req.user.id]);
    
    let chat;
    if (chatResult.rows.length === 0) {
      logger.info('Chat not found, creating new chat for user:', { chatId: id, userId: req.user.id });
      
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
      
      // Create new chat
      const newChatResult = await db.query(`
        INSERT INTO "Chat" ("id", "userId", "twinId", "createdAt")
        VALUES ($1, $2, $3, NOW())
        RETURNING id, "userId", "twinId", "createdAt"
      `, [id, req.user.id, twin.id]);
      
      if (newChatResult.rows.length === 0) {
        logger.error('Failed to create new chat');
        throw createError.internal('Failed to create chat');
      }
      
      const newChat = newChatResult.rows[0];
      logger.info('New chat created:', newChat.id);
      
      // Log chat started event
      try {
        await logEvent(req.user.id, 'chat_started', { chatId: newChat.id, twinId: twin.id });
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

    // ✅ Check first message and title
    const [isFirstMessage, currentTitle] = await Promise.all([
      chatUtils.checkFirstMessage(chat.id, 'Message'),
      chatUtils.getChatTitle(chat.id, 'Chat')
    ]);
    
    // ✅ Always generate title for first message (even if title is "New Chat")
    const shouldGenerateTitle = isFirstMessage === true;

    // ✅ Get recent messages and session memory in parallel
    const [sessionMemory, recentMessages] = await Promise.all([
      chatUtils.getSessionMemoryForContext(chat.id).catch(() => null),
      chatUtils.getRecentMessages(chat.id, 'Message', 10)
    ]);

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

    // ✅ Generate AI response
    const { aiResponse, generatedTitle } = await chatUtils.generateAIResponse(context);

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
        content: userMessage.content,
        sender: userMessage.sender,
        createdAt: userMessage.createdAt,
      },
      aiMessage: {
        id: aiMessage.id,
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
          await logEvent(userId, 'chat_message', { chatId: chat.id, twinId: chat.twinId, userMessageId: userMessage.id, aiMessageId: aiMessage.id }),

          // Update style vector
          updateStyleVectorAfterChat(chat.twinId, userId).catch(err => 
            logger.warn('Style vector update failed:', err)
          ),

          // Update chat vector
          updateChatVectorAfterMessage(chat.id, [userMessage, aiMessage]).catch(err => 
            logger.warn('Chat vector update failed:', err)
          )
        ]);

        // Update session memory
        await chatUtils.updateSessionMemory(chat.id, chat.twinId);

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

        if (shouldExtractFacts && chat.twinId) {
          logger.info('✅ User requested to remember something - extracting facts');
          
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
    handleControllerError(error, 'Failed to handle user message');
  }
};

/**
 * Update chat metadata when new message is added
 * @deprecated This function is no longer used. Title generation is now handled
 * directly in handleUserMessage using the same OpenAI call that generates the response.
 * This function made a separate API call which caused issues.
 */


// Helper function to update style vector after chat
async function updateStyleVectorAfterChat(twinId: string, userId: string) {
  try {
    logger.info('Starting style vector update for twin:', twinId);
    
    // Get the twin's current style vector using raw SQL
    const twinResult = await db.query(`
      SELECT id, "styleVector"
      FROM "Twin"
      WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);
    
    if (twinResult.rows.length === 0) {
      logger.warn('Twin not found for style vector update:', twinId);
      return;
    }

    const twin = twinResult.rows[0];
    logger.info('Found twin for style vector update:', twin.id);

    // Get recent messages from this chat (last 10 messages) using raw SQL
    const recentMessagesResult = await db.query(`
      SELECT m.content, m.sender
      FROM "Message" m
      JOIN "Chat" c ON m."chatId" = c.id
      WHERE c."twinId" = $1 AND c."userId" = $2
      ORDER BY m."createdAt" DESC
      LIMIT ${QUERY_LIMITS.RECENT_MESSAGES}
    `, [twinId, userId]);
    
    const recentMessages = recentMessagesResult.rows;

    logger.info('Found recent messages:', recentMessages.length);

    // Filter only human messages for style analysis
    const humanMessages = recentMessages
      .filter(msg => msg.sender === 'human')
      .map(msg => msg.content);

    if (humanMessages.length === 0) {
      logger.info('No human messages found for style vector update');
      return;
    }

    logger.info('Human messages for style analysis:', humanMessages.length);

    // Update style vector based on new conversations
    const currentStyleVector = twin.styleVector as any;
    logger.info('Current style vector:', JSON.stringify(currentStyleVector, null, 2));
    
    const updatedStyleVector = await twinService.updateStyleVector(currentStyleVector, humanMessages);
    logger.info('Updated style vector:', JSON.stringify(updatedStyleVector, null, 2));

    // Save updated style vector to database using raw SQL
    await db.query(`
      UPDATE "Twin"
      SET "styleVector" = $1
      WHERE id = $2
    `, [JSON.stringify(updatedStyleVector), twinId]);

    logger.info('Style vector updated successfully for twin:', twinId);
  } catch (error) {
    logger.error('Error updating style vector:', error);
  }
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
    await db.query(`
      UPDATE "Chat"
      SET "chatVector" = $1, "updatedAt" = NOW()
      WHERE id = $2
    `, [JSON.stringify(updatedChatVector), chatId]);

    logger.info('Chat vector updated successfully for chat:', chatId);
  } catch (error) {
    logger.error('Error updating chat vector:', error);
  }
}

// Delete chat
export const deleteChat = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    
    if (!req.user) {
      throw createError.unauthorized();
    }

    if (!id) {
      throw createError.validation('Chat ID is required');
    }

    // Verify chat belongs to user
    const chatResult = await db.query(`
      SELECT id, "userId" FROM "Chat" WHERE id = $1
    `, [id]);
    
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
    `, [id]);
    
    // Log event
    try {
      await logEvent(req.user.id, 'chat_deleted', { chatId: id });
    } catch (error) {
      logger.warn('Failed to log chat deletion event:', error);
    }
    
    logger.info('Chat deleted successfully:', { chatId: id, userId: req.user.id });
    
    res.json({
      success: true,
      message: 'Chat deleted successfully'
    });
  } catch (error) {
    handleControllerError(error, 'Failed to delete chat');
  }
};

/**
 * Create new chat (from chatManagementController)
 */
export const createNewChat = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw createError.unauthorized();
    }

    const { twinId } = createNewChatSchema.parse(req.body);
    const userId = req.user.id;

    // Verify twin belongs to user
   await verifyTwinOwnership(twinId, userId);

    // Create new chat
    const chatId = generateId.chat();
    const chatResult = await db.query(`
      INSERT INTO "Chat" (id, "userId", "twinId", "title", "messageCount", "createdAt", "updatedAt")
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      RETURNING id, "twinId", "title", "messageCount", "createdAt"
    `, [chatId, userId, twinId, 'New Chat', 0]);

    const chat = chatResult.rows[0];

    // Log chat creation event
    await logEvent(userId, 'chat_created', { chatId: chat.id, twinId: chat.twinId });


    res.json({
      success: true,
      chat: {
        id: chat.id,
        twinId: chat.twinId,
        title: chat.title,
        messageCount: chat.messageCount,
        createdAt: chat.createdAt
      },
      redirect: `/chat-enhanced?chatId=${chat.id}`
    });

  } catch (error) {
    handleControllerError(error, 'Failed to create new chat');
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

    const { id: chatId } = req.params;
    const { title } = updateChatTitleSchema.parse(req.body);
    const userId = req.user.id;

    // Verify chat belongs to user
    const chatResult = await db.query(`
      SELECT id FROM "Chat" WHERE id = $1 AND "userId" = $2
    `, [chatId, userId]);

    if (chatResult.rows.length === 0) {
      throw createError.notFound('Chat not found', ErrorCodes.CHAT_NOT_FOUND);
    }

    // Update chat title
    await db.query(`
      UPDATE "Chat" SET "title" = $1, "updatedAt" = NOW() WHERE id = $2
    `, [title, chatId]);

    res.json({
      success: true,
      message: 'Chat title updated successfully'
    });

  } catch (error) {
    handleControllerError(error, 'Failed to update chat title');
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

    const { id: chatId } = req.params;
    const { firstMessage } = generateTitleSchema.parse(req.body);
    const userId = req.user.id;

    // Verify chat belongs to user
    const chatResult = await db.query(`
      SELECT id FROM "Chat" WHERE id = $1 AND "userId" = $2
    `, [chatId, userId]);

    if (chatResult.rows.length === 0) {
      throw createError.notFound('Chat not found', ErrorCodes.CHAT_NOT_FOUND);
    }

    // Generate title using AI
    const title = await generateTitleFromMessage(firstMessage);

    // Update chat title
    await db.query(`
      UPDATE "Chat" SET "title" = $1, "updatedAt" = NOW() WHERE id = $2
    `, [title, chatId]);

    res.json({
      success: true,
      title,
      message: 'Chat title generated successfully'
    });

  } catch (error) {
    handleControllerError(error, 'Failed to generate chat title');
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

    const { id: chatId } = req.params;
    const userId = req.user.id;

    // Verify chat belongs to user
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
    handleControllerError(error, 'Failed to get chat summary');
  }
};

/**
 * Helper function to generate title from message using AI (from chatManagementController)
 */
async function generateTitleFromMessage(message: string): Promise<string> {
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
    return title.length > 30 ? title.substring(0, 30) + '...' : title;

  } catch (error) {
    logger.error('AI title generation failed:', error);
    // Fallback to simple title
    return message.length > 30 ? message.substring(0, 30) + '...' : message;
  }
}