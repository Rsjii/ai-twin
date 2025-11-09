import { Response, NextFunction } from 'express';
import { db } from '../../config/database';
import { TwinService } from '../twin/twinService';
import { logger } from '../../config/logger';
import { z } from 'zod';
import { AuthenticatedRequest } from '../../middleware/auth';
import { validateMessageLength, checkBlacklist } from '../../utils/safety';
import { AppError, createError, ErrorCodes } from '../../utils/errors';
import * as chatUtils from './chatSharedUtils';

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
    const chatId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const chatResult = await db.query(`
      INSERT INTO "Chat" (id, "userId", "twinId", "createdAt")
      VALUES ($1, $2, $3, NOW())
      RETURNING *
    `, [chatId, req.user.id, twin.id]);
    const chat = chatResult.rows[0];
    
    // Log chat started event
    const eventId = `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await db.query(`
      INSERT INTO "Event" (id, "userId", type, meta, "createdAt")
      VALUES ($1, $2, $3, $4, NOW())
    `, [eventId, req.user.id, 'chat_started', JSON.stringify({ chatId: chat.id, twinId: twin.id })]);
    
    res.json({
      success: true,
      chatId: chat.id,
      redirect: `/chat/${chat.id}`,
    });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw createError.internal('Failed to start chat', error);
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
    if (error instanceof AppError) {
      throw error;
    }
    throw createError.internal('Failed to get chat', error);
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
    if (error instanceof AppError) {
      throw error;
    }
    throw createError.internal('Failed to get chats', error);
  }
};

// Get chat history for user (all previous chats)
export const getChatHistory = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw createError.unauthorized();
    }

    // Pagination support with defaults for backward compatibility
    const page = parseInt(req.query['page'] as string) || 1;
    const limit = Math.min(parseInt(req.query['limit'] as string) || 50, 100); // Max 100 per page
    const offset = (page - 1) * limit;

    const chats = await db.query(`
      SELECT c.id, c."twinId", c."createdAt",
             t.id as twin_id, t."sampleReply",
             m.content as last_message, m."createdAt" as last_message_time,
             msg_count.message_count
      FROM "Chat" c
      JOIN "Twin" t ON c."twinId" = t.id
      LEFT JOIN LATERAL (
        SELECT content, "createdAt"
        FROM "Message" 
        WHERE "chatId" = c.id 
        ORDER BY "createdAt" DESC 
        LIMIT 1
      ) m ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*) as message_count
        FROM "Message" 
        WHERE "chatId" = c.id
      ) msg_count ON true
      WHERE c."userId" = $1
      ORDER BY c."createdAt" DESC
      LIMIT $2 OFFSET $3
    `, [req.user.id, limit, offset]);

    // Get total count for pagination metadata
    const totalResult = await db.query(`
      SELECT COUNT(*) as total
      FROM "Chat" c
      WHERE c."userId" = $1
    `, [req.user.id]);

    // Format chat history with summary
    const chatHistory = chats.rows.map(chat => ({
      id: chat.id,
      twinId: chat.twinId,
      twin: {
        id: chat.twin_id,
        sampleReply: chat.sampleReply
      },
      messageCount: parseInt(chat.message_count) || 0,
      lastMessage: chat.last_message ? {
        content: chat.last_message,
        createdAt: chat.last_message_time
      } : null,
      createdAt: chat.createdAt,
      updatedAt: chat.last_message_time || chat.createdAt,
    }));
    
    const total = parseInt(totalResult.rows[0]?.total || '0', 10);
    
    res.json({ 
      success: true,
      chats: chatHistory,
      total: total,
      page: page,
      limit: limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw createError.internal('Failed to get chat history', error);
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
    if (error instanceof AppError) {
      throw error;
    }
    throw createError.internal('Failed to get chat messages', error);
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
        `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        req.user.id,
        twin.id
      ]);
      chat = newChatResult.rows[0];
    }

    // Log chat continued/started event using raw SQL
    await db.query(`
      INSERT INTO "Event" ("id", "userId", "type", "meta", "createdAt")
      VALUES ($1, $2, $3, $4, NOW())
    `, [
      `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      req.user.id,
      existingChat ? 'chat_continued' : 'chat_started',
      JSON.stringify({ chatId: chat.id, twinId: twin.id })
    ]);

    res.json({
      success: true,
      chatId: chat.id,
      isNewChat: !existingChat,
      redirect: `/chat/${chat.id}`,
    });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw createError.internal('Failed to continue chat', error);
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
    
    // Log draft generated event using raw SQL
    await db.query(`
      INSERT INTO "Event" ("id", "userId", "type", "meta", "createdAt")
      VALUES ($1, $2, $3, $4, NOW())
    `, [
      `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      req.user.id,
      'draft_generated',
      JSON.stringify({ chatId: chat.id, twinId: chat.twinId })
    ]);
    
    res.json({ draft });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw createError.internal('Failed to generate draft', error);
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
      `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      chat.id,
      'twin',
      content,
      true
    ]);
    
    const message = messageResult.rows[0];

    // Log message approved event using raw SQL
    await db.query(`
      INSERT INTO "Event" ("id", "userId", "type", "meta", "createdAt")
      VALUES ($1, $2, $3, $4, NOW())
    `, [
      `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      req.user.id,
      'message_approved',
      JSON.stringify({ chatId: chat.id, messageId: message.id })
    ]);

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
    if (error instanceof AppError) {
      throw error;
    }
    throw createError.internal('Failed to send message', error);
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
        await db.query(`
          INSERT INTO "Event" ("id", "userId", "type", "meta", "createdAt")
          VALUES ($1, $2, $3, $4, NOW())
        `, [
          `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          req.user.id,
          'chat_started',
          JSON.stringify({ chatId: newChat.id, twinId: twin.id })
        ]);
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
    
    const shouldGenerateTitle = isFirstMessage && (!currentTitle || currentTitle === 'New Chat' || currentTitle === '' || currentTitle === null);

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
          db.query(`
            INSERT INTO "Event" ("id", "userId", "type", "meta", "createdAt")
            VALUES ($1, $2, $3, $4, NOW())
          `, [
            `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            userId,
            'chat_message',
            JSON.stringify({ 
              chatId: chat.id, 
              twinId: chat.twinId,
              userMessageId: userMessage.id,
              aiMessageId: aiMessage.id
            })
          ]).catch(err => logger.warn('Event logging failed:', err)),

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
      } catch (error) {
        logger.error('Post-response cleanup failed:', error);
      }
    })();
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw createError.internal('Failed to handle user message', error);
  }
};

/**
 * Update chat metadata when new message is added
 * @deprecated This function is no longer used. Title generation is now handled
 * directly in handleUserMessage using the same OpenAI call that generates the response.
 * This function made a separate API call which caused issues.
 */
export const updateChatMetadata = async (chatId: string, message: string, sender: string) => {
  // DISABLED: Title generation is now handled in handleUserMessage
  // This function is kept for backwards compatibility but does nothing
  logger.warn('updateChatMetadata called but is deprecated. Title generation handled in handleUserMessage.');
  return;
  
  /* OLD CODE - DISABLED
  try {
    console.log('Updating chat metadata:', { chatId, message: message.substring(0, 50), sender });
    
    // Update last message and timestamp
    const updateResult = await db.query(`
      UPDATE "Chat" SET "lastMessage" = $1, "updatedAt" = NOW() WHERE id = $2
    `, [message, chatId]);
    
    console.log('Last message updated:', updateResult.rowCount);

    // Update message count
    const countResult = await db.query(`
      UPDATE "Chat" SET "messageCount" = (
        SELECT COUNT(*) FROM "Message" 
        WHERE "chatId" = $1
      )  WHERE id = $1
    `, [chatId]);
    
    console.log('Message count updated:', countResult.rowCount);

    // Generate title if this is the first message
    const chatResult = await db.query(`
      SELECT "title", "messageCount" FROM "Chat" WHERE id = $1
    `, [chatId]);

    if (chatResult.rows.length > 0) {
      const chat = chatResult.rows[0];
      
      // If title is default and this is the first user message, generate title
      if ((!chat.title || chat.title === 'New Chat') && sender === 'human' && chat.messageCount === 1) {
        try {
          const { OpenAI } = await import('openai');
          const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
          });

          const completion = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [{
              role: 'system',
              content: `Generate a short, descriptive title (max 30 characters) for a chat that starts with: "${message}"`
            }],
            max_tokens: 20,
            temperature: 0.3
          });

          const title = completion.choices[0]?.message?.content?.trim() || 'New Chat';
          const finalTitle = title.length > 30 ? title.substring(0, 30) + '...' : title;

          await db.query(`
            UPDATE "Chat" SET "title" = $1 WHERE id = $2
          `, [finalTitle, chatId]);
          
          console.log('Chat title generated:', finalTitle);
        } catch (error) {
          logger.error('Failed to generate chat title:', error);
        }
      }
    }

    console.log('Chat metadata updated successfully for chat:', chatId);
  } catch (error) {
    logger.error('Error updating chat metadata:', error);
    throw error; // Re-throw to see the actual error
  }
  */
};


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
      LIMIT 10
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
      const eventId = `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await db.query(`
        INSERT INTO "Event" (id, "userId", type, meta, "createdAt")
        VALUES ($1, $2, $3, $4, NOW())
      `, [eventId, req.user.id, 'chat_deleted', JSON.stringify({ chatId: id })]);
    } catch (error) {
      logger.warn('Failed to log chat deletion event:', error);
    }
    
    logger.info('Chat deleted successfully:', { chatId: id, userId: req.user.id });
    
    res.json({
      success: true,
      message: 'Chat deleted successfully'
    });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw createError.internal('Failed to delete chat', error);
  }
};