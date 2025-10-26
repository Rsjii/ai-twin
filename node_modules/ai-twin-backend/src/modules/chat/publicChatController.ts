import { Request, Response } from 'express';
import { db, publicChatQueries } from '../../config/database';
import { logger } from '../../config/logger';
import { EventLogger } from '../../services/eventLogger';
import { TwinService } from '../twin/twinService';
import { z } from 'zod';
import { checkBlacklist, validateMessageLength } from '../../middleware/security';

// Validation schemas
const startPublicChatSchema = z.object({
  twinId: z.string().min(1, 'Twin ID is required'),
  visitorId: z.string().optional()
});

const sendPublicMessageSchema = z.object({
  message: z.string()
    .min(1, 'Message cannot be empty')
    .max(1000, 'Message must be less than 1000 characters')
});

// Twin service instance
const twinService = new TwinService();

// Start public chat session
export const startPublicChat = async (req: Request, res: Response) => {
  try {
    const { twinId, visitorId } = startPublicChatSchema.parse(req.body);

    // Generate visitor ID if not provided
    const finalVisitorId = visitorId || `visitor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Check if twin exists and is public
    const twinResult = await db.query(`
      SELECT id, "isPublic", "styleVector", "sampleReply"
      FROM "Twin"
      WHERE id = $1 AND "isPublic" = true
    `, [twinId]);

    if (twinResult.rows.length === 0) {
      return res.status(404).json({ error: 'Public twin not found' });
    }

    const twin = twinResult.rows[0];

    // Check for existing public chat or create new one
    let publicChat = await publicChatQueries.findByTwinAndVisitor(twinId, finalVisitorId);

    if (!publicChat) {
      // Create new public chat
      publicChat = await publicChatQueries.create(twinId, finalVisitorId);
    }

    // Log event
    if (finalVisitorId && !finalVisitorId.startsWith('visitor_')) {
      await EventLogger.logUserEvent(finalVisitorId, 'public_chat_started', {
        twinId,
        chatId: publicChat.id
      });
    }

    res.json({
      success: true,
      chatId: publicChat.id,
      twin: {
        id: twin.id,
        sampleReply: twin.sampleReply
      }
    });

  } catch (error) {
    logger.error('Start public chat error:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Invalid input', 
        details: error.errors 
      });
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Send message in public chat
export const sendPublicMessage = async (req: Request, res: Response) => {
  try {
    const { chatId } = req.params;
    const { message } = sendPublicMessageSchema.parse(req.body);

    // Validate message
    if (!validateMessageLength(message)) {
      return res.status(400).json({ error: 'Message length invalid' });
    }

    if (checkBlacklist(message)) {
      return res.status(400).json({ error: 'Message contains restricted content' });
    }

    // Get public chat with twin information
    const chatResult = await db.query(`
      SELECT pc.id, pc."twinId", pc."visitorId", pc."messageCount",
             t."styleVector", t."sampleReply"
      FROM "PublicChat" pc
      JOIN "Twin" t ON pc."twinId" = t.id
      WHERE pc.id = $1
    `, [chatId]);

    if (chatResult.rows.length === 0) {
      return res.status(404).json({ error: 'Public chat not found' });
    }

    const chat = chatResult.rows[0];

    // Save visitor message using raw SQL
    const visitorMessageId = `pub_msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await db.query(`
      INSERT INTO "Message" ("id", "chatId", "sender", "content", "approved", "createdAt")
      VALUES ($1, $2, $3, $4, $5, NOW())
    `, [visitorMessageId, chatId, 'human', message.trim(), true]);

    // Get recent chat context (last 10 messages)
    const recentMessagesResult = await db.query(`
      SELECT content, sender, "createdAt"
      FROM "Message"
      WHERE "chatId" = $1
      ORDER BY "createdAt" DESC
      LIMIT 10
    `, [chatId]);
    
    const recentMessages = recentMessagesResult.rows.reverse();

    // Create context for AI response generation
    const context = {
      styleVector: chat.styleVector as any,
      chatMemory: recentMessages.map(msg => ({
        content: msg.content,
        sender: msg.sender,
        timestamp: msg.createdAt
      })),
      currentMessages: [message.trim()]
    };

    // Generate AI response using TwinService
    let aiResponse;
    try {
      aiResponse = await twinService.generateDraftWithContext(context);
      
      if (!aiResponse || aiResponse.trim().length === 0) {
        throw new Error('Empty response from AI');
      }
    } catch (error) {
      logger.error('AI response generation failed:', error);
      aiResponse = "I'm having trouble thinking right now. Could you try again?";
    }

    // Save AI response using raw SQL
    const aiMessageId = `pub_msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await db.query(`
      INSERT INTO "Message" ("id", "chatId", "sender", "content", "approved", "createdAt")
      VALUES ($1, $2, $3, $4, $5, NOW())
    `, [aiMessageId, chatId, 'twin', aiResponse, true]);

    // Update public chat message count
    await publicChatQueries.updateMessageCount(chatId);

    res.json({
      success: true,
      messages: [
        {
          id: visitorMessageId,
          content: message,
          sender: 'human',
          createdAt: new Date()
        },
        {
          id: aiMessageId,
          content: aiResponse,
          sender: 'twin',
          createdAt: new Date()
        }
      ]
    });

  } catch (error) {
    logger.error('Send public message error:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Invalid input', 
        details: error.errors 
      });
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get public chat history
export const getPublicChatHistory = async (req: Request, res: Response) => {
  try {
    const { chatId } = req.params;

    // Get public chat
    const chatResult = await db.query(`
      SELECT pc.id, pc."twinId", pc."visitorId", pc."messageCount",
             t."publicHandle", t."sampleReply"
      FROM "PublicChat" pc
      JOIN "Twin" t ON pc."twinId" = t.id
      WHERE pc.id = $1
    `, [chatId]);

    if (chatResult.rows.length === 0) {
      return res.status(404).json({ error: 'Public chat not found' });
    }

    const chat = chatResult.rows[0];

    // Get chat messages
    const messagesResult = await db.query(`
      SELECT id, content, sender, "createdAt"
      FROM "Message"
      WHERE "chatId" = $1
      ORDER BY "createdAt" ASC
    `, [chatId]);

    res.json({
      success: true,
      chat: {
        id: chat.id,
        twinId: chat.twinId,
        visitorId: chat.visitorId,
        messageCount: chat.messageCount,
        twinHandle: chat.publicHandle,
        sampleReply: chat.sampleReply
      },
      messages: messagesResult.rows
    });

  } catch (error) {
    logger.error('Get public chat history error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get public chat by twin ID (for starting new chat)
export const getPublicChatByTwin = async (req: Request, res: Response) => {
  try {
    const { twinId } = req.params;
    const { visitorId } = req.query;

    // Check if twin exists and is public
    const twinResult = await db.query(`
      SELECT id, "isPublic", "publicHandle", "sampleReply"
      FROM "Twin"
      WHERE id = $1 AND "isPublic" = true
    `, [twinId]);

    if (twinResult.rows.length === 0) {
      return res.status(404).json({ error: 'Public twin not found' });
    }

    const twin = twinResult.rows[0];

    // Check for existing public chat
    const existingChat = await publicChatQueries.findByTwinAndVisitor(twinId, visitorId as string);

    if (existingChat) {
      // Get chat history
      const messagesResult = await db.query(`
        SELECT id, content, sender, "createdAt"
        FROM "Message"
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
    logger.error('Get public chat by twin error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
