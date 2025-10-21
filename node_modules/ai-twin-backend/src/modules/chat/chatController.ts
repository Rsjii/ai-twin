import { Response } from 'express';
import { db } from '../../config/database';
import { TwinService } from '../twin/twinService';
import { logger } from '../../config/logger';
import { z } from 'zod';
import { AuthenticatedRequest } from '../../middleware/auth';
import { checkBlacklist, validateMessageLength } from '../../middleware/security';

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

export const startChat = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { twinId } = startChatSchema.parse(req.body);
    
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
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
      return res.status(404).json({ error: 'Twin not found' });
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
    logger.error('Start chat error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const getChat = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!id) {
      return res.status(400).json({ error: 'Chat ID is required' });
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
      return res.status(404).json({ error: 'Chat not found' });
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
    logger.error('Get chat error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const getUserChats = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const chats = await db.query(`
      SELECT c.id, c."twinId", c."createdAt",
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
      ORDER BY c."createdAt" DESC
    `, [req.user.id]);
    
    res.json({ chats: chats.rows });
  } catch (error) {
    logger.error('Get chats error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// Get chat history for user (all previous chats)
export const getChatHistory = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

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
    
    res.json({ 
      success: true,
      chats: chatHistory,
      total: chatHistory.length 
    });
  } catch (error) {
    logger.error('Get chat history error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// Get specific chat with all messages
export const getChatMessages = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!id) {
      return res.status(400).json({ error: 'Chat ID is required' });
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
      return res.status(404).json({ error: 'Chat not found' });
    }

    const chat = chatResult.rows[0];

    // Get messages for this chat
    const messagesResult = await db.query(`
      SELECT id, "chatId", sender, content, approved, "createdAt"
      FROM "Message"
      WHERE "chatId" = $1
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
    logger.error('Get chat messages error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// Continue existing chat or create new one
export const continueChat = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { twinId } = req.body;
    
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!twinId) {
      return res.status(400).json({ error: 'Twin ID is required' });
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
      return res.status(404).json({ error: 'Twin not found' });
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
    logger.error('Continue chat error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const generateDraft = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { messages } = generateDraftSchema.parse(req.body);
    const { id } = req.params;
    
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!id) {
      return res.status(400).json({ error: 'Chat ID is required' });
    }

    // Validate message lengths
    for (const message of messages) {
      if (!validateMessageLength(message)) {
        return res.status(400).json({ error: 'Message length invalid' });
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
      return res.status(404).json({ error: 'Chat not found' });
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
    const draft = await twinService.generateDraftWithContext(context);
    
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
    logger.error('Generate draft error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const sendMessage = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { content } = sendMessageSchema.parse(req.body);
    const { id } = req.params;
    
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Validate message
    if (!validateMessageLength(content)) {
      return res.status(400).json({ error: 'Message length invalid' });
    }

    if (checkBlacklist(content)) {
      return res.status(400).json({ error: 'Message contains restricted content' });
    }

    if (!id) {
      return res.status(400).json({ error: 'Chat ID is required' });
    }

    // Get chat using raw SQL
    const chatResult = await db.query(`
      SELECT id, "userId", "twinId"
      FROM "Chat"
      WHERE id = $1 AND "userId" = $2
    `, [id, req.user.id]);
    
    if (chatResult.rows.length === 0) {
      return res.status(404).json({ error: 'Chat not found' });
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
    logger.error('Send message error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// New function to handle user messages and generate AI responses
export const handleUserMessage = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { message } = req.body;
    const { id } = req.params;
    
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Validate message
    if (!message || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message cannot be empty' });
    }

    if (!validateMessageLength(message)) {
      return res.status(400).json({ error: 'Message length invalid' });
    }

    if (checkBlacklist(message)) {
      return res.status(400).json({ error: 'Message contains restricted content' });
    }

    if (!id) {
      return res.status(400).json({ error: 'Chat ID is required' });
    }

    // Get chat with twin information using raw SQL
    const chatResult = await db.query(`
      SELECT c.id, c."userId", c."twinId", c."createdAt", c."chatVector",
             t.id as twin_id, t."styleVector", t."sampleReply", t."instructions", 
             t."personaData", t."systemPrompt", t."tokenLimit"
      FROM "Chat" c
      JOIN "Twin" t ON c."twinId" = t.id
      WHERE c.id = $1 AND c."userId" = $2
    `, [id, req.user.id]);
    
    logger.info('Chat query result:', {
      chatId: id,
      userId: req.user.id,
      rowsFound: chatResult.rows.length,
      rows: chatResult.rows
    });
    
    // Also try to find any chats for this user to debug
    const allChatsResult = await db.query(`
      SELECT c.id, c."userId", c."twinId"
      FROM "Chat" c
      WHERE c."userId" = $1
      LIMIT 5
    `, [req.user.id]);
    
    logger.info('All chats for user:', {
      userId: req.user.id,
      totalChats: allChatsResult.rows.length,
      chats: allChatsResult.rows
    });
    
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
        return res.status(404).json({ error: 'No twin found. Please create a twin first.' });
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
        return res.status(500).json({ error: 'Failed to create chat' });
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

    const chat = chatResult.rows[0];
    logger.info('Chat found:', { 
      chatId: chat.id, 
      twinId: chat.twinId, 
      userId: chat.userId,
      styleVector: chat.styleVector 
    });

    // Save user message using raw SQL
    let userMessage;
    try {
      const userMessageResult = await db.query(`
        INSERT INTO "Message" ("id", "chatId", "sender", "content", "approved", "createdAt")
        VALUES ($1, $2, $3, $4, $5, NOW())
        RETURNING id, "chatId", sender, content, approved, "createdAt"
      `, [
        `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        chat.id,
        'human',
        message.trim(),
        true
      ]);
      
      userMessage = userMessageResult.rows[0];
      logger.info('User message saved successfully:', userMessage.id);
    } catch (error) {
      logger.error('Failed to save user message:', error);
      return res.status(500).json({ error: 'Failed to save user message' });
    }

    // Get recent chat context (last 10 messages) using raw SQL
    const recentMessagesResult = await db.query(`
      SELECT content, sender, "createdAt"
      FROM "Message"
      WHERE "chatId" = $1
      ORDER BY "createdAt" DESC
      LIMIT 10
    `, [chat.id]);
    
    const recentMessages = recentMessagesResult.rows;

    // Create context for AI response generation
    const context = {
      styleVector: chat.styleVector as any,
      personaData: chat.personaData as any,
      systemPrompt: chat.systemPrompt as string,
      tokenLimit: chat.tokenLimit as number,
      chatVector: chat.chatVector as any, // Compressed chat history
      chatMemory: recentMessages.reverse().map(msg => ({
        content: msg.content,
        sender: msg.sender,
        timestamp: msg.createdAt
      })),
      currentMessages: [message.trim()],
      twinId: chat.twinId // Add twinId for memory retrieval
    };

    // Generate AI response using TwinService
    let aiResponse;
    try {
      logger.info('Generating AI response with context:', {
        styleVector: context.styleVector,
        chatMemoryLength: context.chatMemory.length,
        currentMessages: context.currentMessages
      });
      
      aiResponse = await twinService.generateDraftWithContext(context);
      
      if (!aiResponse || aiResponse.trim().length === 0) {
        throw new Error('Empty response from AI');
      }
      
      logger.info('AI response generated successfully:', aiResponse.substring(0, 100));
    } catch (error) {
      logger.error('AI response generation failed:', error);
      aiResponse = "I'm having trouble thinking right now. Could you try again?";
    }

    // Save AI response using raw SQL
    let aiMessage;
    try {
      const aiMessageResult = await db.query(`
        INSERT INTO "Message" ("id", "chatId", "sender", "content", "approved", "createdAt")
        VALUES ($1, $2, $3, $4, $5, NOW())
        RETURNING id, "chatId", sender, content, approved, "createdAt"
      `, [
        `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        chat.id,
        'twin',
        aiResponse,
        true
      ]);
      
      aiMessage = aiMessageResult.rows[0];
      logger.info('AI message saved successfully:', aiMessage.id);
    } catch (error) {
      logger.error('Failed to save AI message:', error);
      return res.status(500).json({ error: 'Failed to save AI response' });
    }

    // Log chat message event using raw SQL
    try {
      await db.query(`
        INSERT INTO "Event" ("id", "userId", "type", "meta", "createdAt")
        VALUES ($1, $2, $3, $4, NOW())
      `, [
        `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        req.user.id,
        'chat_message',
        JSON.stringify({ 
          chatId: chat.id, 
          twinId: chat.twinId,
          userMessageId: userMessage.id,
          aiMessageId: aiMessage.id
        })
      ]);
      logger.info('Chat event logged successfully');
    } catch (error) {
      logger.error('Failed to log chat event:', error);
      // Don't fail the request for logging errors
    }

    // Update style vector and chat vector based on new conversation (async, don't wait)
    updateStyleVectorAfterChat(chat.twinId, req.user.id).catch(error => {
      logger.error('Style vector update failed:', error);
    });
    
    // Update chat vector with new conversation
    updateChatVectorAfterMessage(chat.id, [userMessage, aiMessage]).catch(error => {
      logger.error('Chat vector update failed:', error);
    });
    
    res.json({
      success: true,
      response: aiResponse,
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
  } catch (error) {
    logger.error('Handle user message error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
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
