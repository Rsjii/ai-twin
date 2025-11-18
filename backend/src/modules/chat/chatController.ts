import { Response } from 'express';
import { db, chatQueries, messageQueries, twinQueries, generateId } from '../../config/database';
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

export const startChat = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { twinId } = startChatSchema.parse(req.body);
    
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Verify twin belongs to user
    const twin = await twinQueries.findById(twinId);
    
    if (!twin || twin.userId !== req.user.id) {
      res.status(404).json({ error: 'Twin not found' });
      return;
    }
    
    // Create chat
    const chat = await chatQueries.create(req.user.id, twinId);
    
    // Log chat started event
    await db.query(
      'INSERT INTO "Event" (id, "userId", type, meta) VALUES ($1, $2, $3, $4)',
      [generateId(), req.user.id, 'chat_started', JSON.stringify({ chatId: chat.id, twinId })]
    );
    
    res.json({
      success: true,
      chatId: chat.id,
      redirect: `/chat/${chat.id}`,
    });
  } catch (error) {
    logger.error('Start chat error:', error);
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: error.errors });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getChat = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (!id) {
      res.status(400).json({ error: 'Chat ID is required' });
      return;
    }

    // Get chat with twin and messages
    const chatResult = await db.query(`
      SELECT c.*, t.id as "twinId", t."styleVector", t."sampleReply"
      FROM "Chat" c
      JOIN "Twin" t ON c."twinId" = t.id
      WHERE c.id = $1 AND c."userId" = $2
    `, [id, req.user.id]);
    
    if (chatResult.rows.length === 0) {
      res.status(404).json({ error: 'Chat not found' });
      return;
    }

    const chat = chatResult.rows[0];
    
    // Get messages for this chat
    const messages = await messageQueries.findByChatId(id);
    
    res.json({ 
      chat: {
        id: chat.id,
        userId: chat.userId,
        twinId: chat.twinId,
        createdAt: chat.createdAt,
        twin: {
          id: chat.twinId,
          styleVector: JSON.parse(chat.styleVector),
          sampleReply: chat.sampleReply
        },
        messages: messages
      }
    });
  } catch (error) {
    logger.error('Get chat error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getUserChats = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const chats = await db.query(`
      SELECT c.*, t.id as "twinId", t."sampleReply",
             (SELECT m.content FROM "Message" m WHERE m."chatId" = c.id ORDER BY m."createdAt" DESC LIMIT 1) as "lastMessage"
      FROM "Chat" c
      JOIN "Twin" t ON c."twinId" = t.id
      WHERE c."userId" = $1
      ORDER BY c."createdAt" DESC
    `, [req.user.id]);
    
    res.json({ 
      chats: chats.rows.map(chat => ({
        id: chat.id,
        twinId: chat.twinId,
        createdAt: chat.createdAt,
        twin: {
          id: chat.twinId,
          sampleReply: chat.sampleReply
        },
        lastMessage: chat.lastMessage
      }))
    });
  } catch (error) {
    logger.error('Get chats error:', error);
    res.status(500).json({ error: 'Internal server error' });
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

    // Get chat with twin
    const chatResult = await db.query(`
      SELECT c.*, t.id as "twinId", t."styleVector", t."sampleReply"
      FROM "Chat" c
      JOIN "Twin" t ON c."twinId" = t.id
      WHERE c.id = $1 AND c."userId" = $2
    `, [id, req.user.id]);

    if (chatResult.rows.length === 0) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    const chat = chatResult.rows[0];
    
    // Get messages for this chat
    const messages = await messageQueries.findByChatId(id);

    res.json({
      success: true,
      chat: {
        id: chat.id,
        twinId: chat.twinId,
        twin: {
          id: chat.twinId,
          styleVector: JSON.parse(chat.styleVector),
          sampleReply: chat.sampleReply
        },
        messages: messages,
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

    // Verify twin belongs to user
    const twin = await twinQueries.findById(twinId);
    
    if (!twin || twin.userId !== req.user.id) {
      return res.status(404).json({ error: 'Twin not found' });
    }

    // Find the most recent chat with this twin
    const existingChatResult = await db.query(`
      SELECT c.*, 
             (SELECT m.content FROM "Message" m WHERE m."chatId" = c.id ORDER BY m."createdAt" DESC LIMIT 1) as "lastMessage"
      FROM "Chat" c
      WHERE c."userId" = $1 AND c."twinId" = $2
      ORDER BY c."createdAt" DESC
      LIMIT 1
    `, [req.user.id, twinId]);

    let chat;
    let isNewChat = false;
    
    if (existingChatResult.rows.length > 0) {
      // Continue existing chat
      chat = existingChatResult.rows[0];
    } else {
      // Create new chat
      chat = await chatQueries.create(req.user.id, twinId);
      isNewChat = true;
    }

    // Log chat continued/started event
    await db.query(
      'INSERT INTO "Event" (id, "userId", type, meta) VALUES ($1, $2, $3, $4)',
      [generateId(), req.user.id, isNewChat ? 'chat_started' : 'chat_continued', JSON.stringify({ chatId: chat.id, twinId })]
    );

    res.json({
      success: true,
      chatId: chat.id,
      isNewChat: isNewChat,
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

    // Get chat and twin
    const chatResult = await db.query(`
      SELECT c.*, t.*
      FROM "Chat" c
      JOIN "Twin" t ON c."twinId" = t.id
      WHERE c.id = $1 AND c."userId" = $2
    `, [id, req.user.id]);
    
    if (chatResult.rows.length === 0) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    const chat = chatResult.rows[0];
    
    // Generate draft
    const draft = await twinService.generateDraft(
      JSON.parse(chat.styleVector),
      messages
    );
    
    // Log draft generated event
    await db.query(
      'INSERT INTO "Event" (id, "userId", type, meta) VALUES ($1, $2, $3, $4)',
      [generateId(), req.user.id, 'draft_generated', JSON.stringify({ chatId: chat.id, twinId: chat.twinId })]
    );
    
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

    // Get chat
    const chatResult = await db.query(`
      SELECT c.*, t."twinId"
      FROM "Chat" c
      WHERE c.id = $1 AND c."userId" = $2
    `, [id, req.user.id]);
    
    if (chatResult.rows.length === 0) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    const chat = chatResult.rows[0];
    
    // Save message
    const message = await messageQueries.create(chat.id, 'twin', content, true);
    
    // Log message approved event
    await db.query(
      'INSERT INTO "Event" (id, "userId", type, meta) VALUES ($1, $2, $3, $4)',
      [generateId(), req.user.id, 'message_approved', JSON.stringify({ chatId: chat.id, messageId: message.id })]
    );

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

// Helper function to update style vector after chat
async function updateStyleVectorAfterChat(twinId: string, userId: string) {
  try {
    // Get the twin's current style vector
    const twin = await twinQueries.findById(twinId);
    if (!twin) {
      logger.warn('Twin not found for style vector update:', twinId);
      return;
    }

    // Get recent messages from this chat (last 10 messages)
    const recentMessages = await db.query(`
      SELECT m.content, m.sender
      FROM "Message" m
      JOIN "Chat" c ON m."chatId" = c.id
      WHERE c."twinId" = $1
      ORDER BY m."createdAt" DESC
      LIMIT 10
    `, [twinId]);

    // Filter only human messages for style analysis
    const humanMessages = recentMessages.rows
      .filter(msg => msg.sender === 'human')
      .map(msg => msg.content);

    if (humanMessages.length === 0) {
      logger.info('No human messages found for style vector update');
      return;
    }

    // Update style vector based on new conversations
    const currentStyleVector = JSON.parse(twin.styleVector);
    const updatedStyleVector = await twinService.updateStyleVector(currentStyleVector, humanMessages);

    // Save updated style vector to database
    await twinQueries.updateStyleVector(userId, updatedStyleVector);

    logger.info('Style vector updated successfully for twin:', twinId);
  } catch (error) {
    logger.error('Error updating style vector:', error);
  }
}
