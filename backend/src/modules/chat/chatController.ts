import { Response } from 'express';
import { prisma } from '../../config/prisma';
import { TwinService } from '../twin/twinService';
import { logger } from '../../config/logger';
import { z } from 'zod';
import { AuthenticatedRequest } from '../../middleware/auth';
import { checkBlacklist, validateMessageLength } from '../../middleware/security';
import { twinQueries } from '../../config/database';

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

    // Verify twin belongs to user
    const twin = await prisma.twin.findFirst({
      where: {
        id: twinId,
        userId: req.user.id,
      },
    });
    
    if (!twin) {
      return res.status(404).json({ error: 'Twin not found' });
    }
    
    // Create chat
    const chat = await prisma.chat.create({
      data: {
        userId: req.user.id,
        twinId: twinId,
      },
    });
    
    // Log chat started event
    await prisma.event.create({
      data: {
        userId: req.user.id,
        type: 'chat_started',
        meta: { chatId: chat.id, twinId },
      },
    });
    
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

    const chat = await prisma.chat.findFirst({
      where: {
        id: id,
        userId: req.user.id,
      },
      include: {
        twin: {
          select: {
            id: true,
            styleVector: true,
            sampleReply: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    
    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }
    
    res.json({ chat });
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

    const chats = await prisma.chat.findMany({
      where: { userId: req.user.id },
      include: {
        twin: {
          select: {
            id: true,
            sampleReply: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    
    res.json({ chats });
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

    const chats = await prisma.chat.findMany({
      where: { userId: req.user.id },
      include: {
        twin: {
          select: {
            id: true,
            sampleReply: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        _count: {
          select: {
            messages: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Format chat history with summary
    const chatHistory = chats.map(chat => ({
      id: chat.id,
      twinId: chat.twinId,
      twin: chat.twin,
      messageCount: chat._count.messages,
      lastMessage: chat.messages[0] || null,
      createdAt: chat.createdAt,
      updatedAt: chat.messages[0]?.createdAt || chat.createdAt,
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

    const chat = await prisma.chat.findFirst({
      where: {
        id: id,
        userId: req.user.id,
      },
      include: {
        twin: {
          select: {
            id: true,
            styleVector: true,
            sampleReply: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    res.json({
      success: true,
      chat: {
        id: chat.id,
        twinId: chat.twinId,
        twin: chat.twin,
        messages: chat.messages,
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
    const twin = await prisma.twin.findFirst({
      where: {
        id: twinId,
        userId: req.user.id,
      },
    });
    
    if (!twin) {
      return res.status(404).json({ error: 'Twin not found' });
    }

    // Find the most recent chat with this twin
    const existingChat = await prisma.chat.findFirst({
      where: {
        userId: req.user.id,
        twinId: twinId,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    let chat;
    
    if (existingChat) {
      // Continue existing chat
      chat = existingChat;
    } else {
      // Create new chat
      chat = await prisma.chat.create({
        data: {
          userId: req.user.id,
          twinId: twinId,
        },
      });
    }

    // Log chat continued/started event
    await prisma.event.create({
      data: {
        userId: req.user.id,
        type: existingChat ? 'chat_continued' : 'chat_started',
        meta: { chatId: chat.id, twinId },
      },
    });

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

    // Get chat and twin
    const chat = await prisma.chat.findFirst({
      where: {
        id: id,
        userId: req.user.id,
      },
      include: {
        twin: true,
      },
    });
    
    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }
    
    // Generate draft
    const draft = await twinService.generateDraft(
      chat.twin.styleVector as any,
      messages
    );
    
    // Log draft generated event
    await prisma.event.create({
      data: {
        userId: req.user.id,
        type: 'draft_generated',
        meta: { chatId: chat.id, twinId: chat.twinId },
      },
    });
    
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
    const chat = await prisma.chat.findFirst({
      where: {
        id: id,
        userId: req.user.id,
      },
    });
    
    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }
    
    // Save message
    const message = await prisma.message.create({
      data: {
        chatId: chat.id,
        sender: 'twin',
        content,
        approved: true,
      },
    });
    
    // Log message approved event
    await prisma.event.create({
      data: {
        userId: req.user.id,
        type: 'message_approved',
        meta: { chatId: chat.id, messageId: message.id },
      },
    });

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
    const recentMessages = await prisma.message.findMany({
      where: { chatId: twinId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { content: true, sender: true }
    });

    // Filter only human messages for style analysis
    const humanMessages = recentMessages
      .filter(msg => msg.sender === 'human')
      .map(msg => msg.content);

    if (humanMessages.length === 0) {
      logger.info('No human messages found for style vector update');
      return;
    }

    // Update style vector based on new conversations
    const currentStyleVector = twin.styleVector as any;
    const updatedStyleVector = await twinService.updateStyleVector(currentStyleVector, humanMessages);

    // Save updated style vector to database
    await twinQueries.updateStyleVector(userId, updatedStyleVector);

    logger.info('Style vector updated successfully for twin:', twinId);
  } catch (error) {
    logger.error('Error updating style vector:', error);
  }
}
