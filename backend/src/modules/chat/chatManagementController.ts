import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { db } from '../../config/database';
import { logger } from '../../config/logger';
import { TwinService } from '../twin/twinService';
import { AppError, createError, ErrorCodes } from '../../utils/errors';

const twinService = new TwinService();

// Validation schemas
const createNewChatSchema = z.object({
  twinId: z.string().min(1, 'Twin ID is required')
});

const updateChatTitleSchema = z.object({
  title: z.string().min(1, 'Title is required').max(100, 'Title too long')
});

const generateTitleSchema = z.object({
  firstMessage: z.string().min(1, 'First message is required')
});

/**
 * Get all user's chats with titles and last messages
 */
export const getChatHistory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw createError.unauthorized();
    }

    const userId = req.user.id;

    // Pagination support with defaults for backward compatibility
    const page = parseInt(req.query['page'] as string) || 1;
    const limit = Math.min(parseInt(req.query['limit'] as string) || 50, 100); // Max 100 per page
    const offset = (page - 1) * limit;

    // Get all user's chats with last message and message count
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
    if (error instanceof AppError) {
      throw error;
    }
    throw createError.internal('Failed to get chat history', error);
  }
};

/**
 * Create new chat
 */
export const createNewChat = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw createError.unauthorized();
    }

    const { twinId } = createNewChatSchema.parse(req.body);
    const userId = req.user.id;

    // Verify twin belongs to user
    const twinResult = await db.query(`
      SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);

    if (twinResult.rows.length === 0) {
      throw createError.notFound('Twin not found', ErrorCodes.TWIN_NOT_FOUND);
    }

    // Create new chat
    const chatId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const chatResult = await db.query(`
      INSERT INTO "Chat" (id, "userId", "twinId", "title", "messageCount", "createdAt", "updatedAt")
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      RETURNING id, "twinId", "title", "messageCount", "createdAt"
    `, [chatId, userId, twinId, 'New Chat', 0]);

    const chat = chatResult.rows[0];

    // Log chat creation event
    await db.query(`
      INSERT INTO "Event" (id, "userId", type, meta, "createdAt")
      VALUES ($1, $2, $3, $4, NOW())
    `, [
      `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      'chat_created',
      JSON.stringify({ chatId: chat.id, twinId: chat.twinId })
    ]);

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
    if (error instanceof AppError) {
      throw error;
    }
    throw createError.internal('Failed to create new chat', error);
  }
};

/**
 * Update chat title
 */
export const updateChatTitle = async (req: Request, res: Response, next: NextFunction) => {
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
    if (error instanceof AppError) {
      throw error;
    }
    throw createError.internal('Failed to update chat title', error);
  }
};

/**
 * Generate chat title using AI
 */
export const generateChatTitle = async (req: Request, res: Response, next: NextFunction) => {
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
    if (error instanceof AppError) {
      throw error;
    }
    throw createError.internal('Failed to generate chat title', error);
  }
};

/**
 * Get chat summary
 */
export const getChatSummary = async (req: Request, res: Response, next: NextFunction) => {
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
    if (error instanceof AppError) {
      throw error;
    }
    throw createError.internal('Failed to get chat summary', error);
  }
};

/**
 * Helper function to generate title from message using AI
 */
async function generateTitleFromMessage(message: string): Promise<string> {
  try {
    // Use OpenAI to generate title
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
    return title.length > 30 ? title.substring(0, 30) + '...' : title;

  } catch (error) {
    logger.error('AI title generation failed:', error);
    // Fallback to simple title
    return message.length > 30 ? message.substring(0, 30) + '...' : message;
  }
}