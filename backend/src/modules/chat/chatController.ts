import { Response } from 'express';
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

    let twin;
    
    // Handle 'latest' twin ID - get the most recent twin for the user
    if (twinId === 'latest') {
      twin = await prisma.twin.findFirst({
        where: {
          userId: req.user.id,
        },
        orderBy: { createdAt: 'desc' },
      });
    } else {
      // Verify specific twin belongs to user
      twin = await prisma.twin.findFirst({
        where: {
          id: twinId,
          userId: req.user.id,
        },
      });
    }
    
    if (!twin) {
      return res.status(404).json({ error: 'Twin not found' });
    }
    
    // Create chat
    const chat = await prisma.chat.create({
      data: {
        userId: req.user.id,
        twinId: twin.id,
      },
    });
    
    // Log chat started event
    await prisma.event.create({
      data: {
        userId: req.user.id,
        type: 'chat_started',
        meta: { chatId: chat.id, twinId: twin.id },
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

    let twin;
    
    // Handle 'latest' twin ID - get the most recent twin for the user
    if (twinId === 'latest') {
      twin = await prisma.twin.findFirst({
        where: {
          userId: req.user.id,
        },
        orderBy: { createdAt: 'desc' },
      });
    } else {
      // Verify specific twin belongs to user
      twin = await prisma.twin.findFirst({
        where: {
          id: twinId,
          userId: req.user.id,
        },
      });
    }
    
    if (!twin) {
      return res.status(404).json({ error: 'Twin not found' });
    }

    // Find the most recent chat with this twin
    const existingChat = await prisma.chat.findFirst({
      where: {
        userId: req.user.id,
        twinId: twin.id,
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
          twinId: twin.id,
        },
      });
    }

    // Log chat continued/started event
    await prisma.event.create({
      data: {
        userId: req.user.id,
        type: existingChat ? 'chat_continued' : 'chat_started',
        meta: { chatId: chat.id, twinId: twin.id },
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
    
    // Get chat messages for context
    const chatMessages = await prisma.message.findMany({
      where: { chatId: chat.id },
      orderBy: { createdAt: 'asc' },
      select: { content: true, sender: true, createdAt: true }
    });

    // Create context with style vector + chat memory + user query
    const context = {
      styleVector: chat.twin.styleVector as any,
      chatMemory: chatMessages.map(msg => ({
        content: msg.content,
        sender: msg.sender,
        timestamp: msg.createdAt
      })),
      currentMessages: messages
    };

    // Generate draft with full context
    const draft = await twinService.generateDraftWithContext(context);
    
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

    // Get chat with twin information
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
      logger.error('Chat not found:', { chatId: id, userId: req.user.id });
      return res.status(404).json({ error: 'Chat not found' });
    }

    if (!chat.twin) {
      logger.error('Twin not found for chat:', { chatId: id, twinId: chat.twinId });
      return res.status(404).json({ error: 'Twin not found for this chat' });
    }

    logger.info('Chat found:', { 
      chatId: chat.id, 
      twinId: chat.twinId, 
      userId: chat.userId,
      styleVector: chat.twin.styleVector 
    });

    // Save user message
    let userMessage;
    try {
      userMessage = await prisma.message.create({
        data: {
          chatId: chat.id,
          sender: 'human',
          content: message.trim(),
          approved: true,
        },
      });
      logger.info('User message saved successfully:', userMessage.id);
    } catch (error) {
      logger.error('Failed to save user message:', error);
      return res.status(500).json({ error: 'Failed to save user message' });
    }

    // Get recent chat context (last 10 messages)
    const recentMessages = await prisma.message.findMany({
      where: { chatId: chat.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { content: true, sender: true, createdAt: true }
    });

    // Create context for AI response generation
    const context = {
      styleVector: chat.twin.styleVector as any,
      chatMemory: recentMessages.reverse().map(msg => ({
        content: msg.content,
        sender: msg.sender,
        timestamp: msg.createdAt
      })),
      currentMessages: [message.trim()]
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

    // Save AI response
    let aiMessage;
    try {
      aiMessage = await prisma.message.create({
        data: {
          chatId: chat.id,
          sender: 'twin',
          content: aiResponse,
          approved: true,
        },
      });
      logger.info('AI message saved successfully:', aiMessage.id);
    } catch (error) {
      logger.error('Failed to save AI message:', error);
      return res.status(500).json({ error: 'Failed to save AI response' });
    }

    // Log chat message event
    try {
      await prisma.event.create({
        data: {
          userId: req.user.id,
          type: 'chat_message',
          meta: { 
            chatId: chat.id, 
            twinId: chat.twinId,
            userMessageId: userMessage.id,
            aiMessageId: aiMessage.id
          },
        },
      });
      logger.info('Chat event logged successfully');
    } catch (error) {
      logger.error('Failed to log chat event:', error);
      // Don't fail the request for logging errors
    }

    // Update style vector based on new conversation (async, don't wait)
    updateStyleVectorAfterChat(chat.twinId, req.user.id).catch(error => {
      logger.error('Style vector update failed:', error);
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
    
    // Get the twin's current style vector
    const twin = await prisma.twin.findFirst({
      where: { id: twinId, userId: userId }
    });
    
    if (!twin) {
      logger.warn('Twin not found for style vector update:', twinId);
      return;
    }

    logger.info('Found twin for style vector update:', twin.id);

    // Get recent messages from this chat (last 10 messages)
    const recentMessages = await prisma.message.findMany({
      where: { 
        chat: {
          twinId: twinId,
          userId: userId
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { content: true, sender: true }
    });

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

    // Save updated style vector to database
    await prisma.twin.update({
      where: { id: twinId },
      data: { styleVector: updatedStyleVector as any }
    });

    logger.info('Style vector updated successfully for twin:', twinId);
  } catch (error) {
    logger.error('Error updating style vector:', error);
  }
}
