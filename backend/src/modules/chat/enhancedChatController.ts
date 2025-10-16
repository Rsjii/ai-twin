import { Response } from 'express';
import { db } from '../../config/database';
import { TwinService } from '../twin/twinService';
import { logger } from '../../config/logger';
import { z } from 'zod';
import { AuthenticatedRequest } from '../../middleware/auth';
import { checkBlacklist, validateMessageLength } from '../../middleware/security';

const twinService = new TwinService();

const sendMessageSchema = z.object({
  content: z.string().min(1, 'Message cannot be empty').max(300, 'Message too long (max 300 characters)'),
});

// Enhanced send message with persona data
export const sendEnhancedMessage = async (req: AuthenticatedRequest, res: Response) => {
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

    // Get chat with twin data
    const chatResult = await db.query(`
      SELECT c.*, t."styleVector", t."personaData", t."systemPrompt", t."tokenLimit", t."tier"
      FROM "Chat" c
      JOIN "Twin" t ON c."twinId" = t.id
      WHERE c.id = $1 AND c."userId" = $2
    `, [id, req.user.id]);

    if (chatResult.rows.length === 0) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    const chat = chatResult.rows[0];
    
    // Save user message
    const userMessageResult = await db.query(`
      INSERT INTO "Message" ("chatId", sender, content, approved, "createdAt")
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, "createdAt"
    `, [chat.id, 'human', content, true, new Date()]);

    // Get chat history for context
    const historyResult = await db.query(`
      SELECT sender, content, "createdAt"
      FROM "Message"
      WHERE "chatId" = $1
      ORDER BY "createdAt" DESC
      LIMIT 20
    `, [chat.id]);

    const chatHistory = historyResult.rows.reverse();

    // Generate AI response using persona data
    let aiResponse: string;
    const tokenLimit = chat.tokenLimit || 500;
    
    if (chat.personaData && chat.systemPrompt) {
      // Use enhanced persona-based response
      const personaData = typeof chat.personaData === 'string' 
        ? JSON.parse(chat.personaData) 
        : chat.personaData;
      
      aiResponse = await twinService.generatePersonaResponse(
        content,
        personaData,
        chat.systemPrompt,
        chatHistory,
        tokenLimit
      );
    } else {
      // Fallback to basic style vector response
      const styleVector = typeof chat.styleVector === 'string' 
        ? JSON.parse(chat.styleVector) 
        : chat.styleVector;
      
      aiResponse = await twinService.generateResponse(content, styleVector);
    }

    // Save AI response
    const aiMessageResult = await db.query(`
      INSERT INTO "Message" ("chatId", sender, content, approved, "createdAt")
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, "createdAt"
    `, [chat.id, 'twin', aiResponse, true, new Date()]);

    // Update chat count
    await db.query(`
      UPDATE "Twin" 
      SET "chatCount" = "chatCount" + 1
      WHERE id = $1
    `, [chat.twinId]);

    res.json({
      success: true,
      messages: [
        {
          id: userMessageResult.rows[0].id,
          sender: 'human',
          content: content,
          createdAt: userMessageResult.rows[0].createdAt
        },
        {
          id: aiMessageResult.rows[0].id,
          sender: 'twin',
          content: aiResponse,
          createdAt: aiMessageResult.rows[0].createdAt
        }
      ]
    });

  } catch (error) {
    logger.error('Enhanced send message error:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Enhanced start chat with persona data
export const startEnhancedChat = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { twinId } = req.body;
    
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

    // Create new chat
    const chatResult = await db.query(`
      INSERT INTO "Chat" ("userId", "twinId", "createdAt")
      VALUES ($1, $2, $3)
      RETURNING id, "createdAt"
    `, [req.user.id, twin.id, new Date()]);

    const chat = chatResult.rows[0];

    // Generate welcome message using persona data
    let welcomeMessage: string;
    
    if (twin.personaData && twin.systemPrompt) {
      const personaData = typeof twin.personaData === 'string' 
        ? JSON.parse(twin.personaData) 
        : twin.personaData;
      
      const name = personaData.name || 'there';
      const personality = personaData.personality || {};
      const isExtraverted = personality.ocean?.extraversion > 3;
      const isFormal = personaData.tone?.sliders?.formalCasual > 50;
      
      if (isFormal) {
        welcomeMessage = `Hello! I'm ${name}. It's a pleasure to meet you. How may I assist you today?`;
      } else if (isExtraverted) {
        welcomeMessage = `Hey there! I'm ${name}! Great to meet you! What's going on?`;
      } else {
        welcomeMessage = `Hi! I'm ${name}. How are you doing?`;
      }
    } else {
      welcomeMessage = "Hey! Great to meet you! What's on your mind?";
    }

    // Save welcome message
    await db.query(`
      INSERT INTO "Message" ("chatId", sender, content, approved, "createdAt")
      VALUES ($1, $2, $3, $4, $5)
    `, [chat.id, 'twin', welcomeMessage, true, new Date()]);

    res.json({
      success: true,
      chat: {
        id: chat.id,
        twinId: twin.id,
        createdAt: chat.createdAt
      },
      welcomeMessage: {
        sender: 'twin',
        content: welcomeMessage,
        createdAt: new Date()
      }
    });

  } catch (error) {
    logger.error('Enhanced start chat error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
