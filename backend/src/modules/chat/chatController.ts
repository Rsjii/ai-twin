import { Request, Response } from 'express';
import { prisma } from '../../config/prisma';
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
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getChat = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const chat = await prisma.chat.findFirst({
      where: {
        id,
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
    res.status(500).json({ error: 'Internal server error' });
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
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const generateDraft = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { messages } = generateDraftSchema.parse(req.body);
    const { id } = req.params;
    
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
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
        id,
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
    res.status(500).json({ error: 'Internal server error' });
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

    // Get chat
    const chat = await prisma.chat.findFirst({
      where: {
        id,
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
    res.status(500).json({ error: 'Internal server error' });
  }
};
