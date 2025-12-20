import { Response } from 'express';
import { db, chatQueries, messageQueries, twinQueries } from '../../config/database';
import { TwinService } from '../twin/twinService';
import { logger } from '../../config/logger';
import { z } from 'zod';
import { AuthenticatedRequest } from '../../middleware/auth';
import { checkBlacklist, validateMessageLength } from '../../utils/safety';
import { MESSAGE_LIMITS } from '../../config/constants';
import { logEvent } from '../../services/eventLogger';
import { QUERY_LIMITS } from '../../config/constants';

const twinService = new TwinService();

const startChatSchema = z.object({
  twinId: z.string().min(1, 'Twin ID is required'),
});

const sendMessageSchema = z.object({
  content: z.string().min(MESSAGE_LIMITS.MIN_LENGTH, 'Message cannot be empty').max(MESSAGE_LIMITS.MAX_LENGTH, 'Message too long (max 300 characters)'),
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
    await logEvent(req.user.id, 'chat_started', { chatId: chat.id, twinId });
    
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
    await logEvent(req.user.id, isNewChat ? 'chat_started' : 'chat_continued', { chatId: chat.id, twinId });

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
    
    // MVP (personaData-only): Generate draft using personaData + systemPrompt
    const runtimeSystemPrompt =
      chat.systemPrompt ||
      (await twinService.generateSystemPrompt(chat.personaData));

    const draftResult = await twinService.generateDraftWithContext({
      personaData: chat.personaData,
      systemPrompt: runtimeSystemPrompt,
      tokenLimit: chat.tokenLimit || 500,
      chatMemory: [],
      currentMessages: messages,
      twinId: chat.twinId,
      isFirstMessage: false,
    });

    const draft =
      typeof draftResult === 'object' && draftResult && 'response' in draftResult
        ? (draftResult as any).response
        : (typeof draftResult === 'string' ? draftResult : '');
    
    // Log draft generated event
    await logEvent(req.user.id, 'draft_generated', { chatId: chat.id, twinId: chat.twinId });
    
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
    await logEvent(req.user.id, 'message_approved', { chatId: chat.id, messageId: message.id });

    // MVP (personaData-only): Disable automatic styleVector updates.
    // Style adaptation via chats will be revisited later.
    
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

// MVP (personaData-only): Legacy style vector update disabled.
// Style adaptation via chats will be revisited when we have a dedicated model / budget.
async function updateStyleVectorAfterChat(_twinId: string, _userId: string): Promise<void> {
  logger.debug('MVP: updateStyleVectorAfterChat() disabled (personaData-only mode)');
}
