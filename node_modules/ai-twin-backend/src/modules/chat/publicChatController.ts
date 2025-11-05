import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth';
import { db, publicChatQueries } from '../../config/database';
import { logger } from '../../config/logger';
import { EventLogger } from '../../services/eventLogger';
import { TwinService } from '../twin/twinService';
import { z } from 'zod';
import { checkBlacklist, validateMessageLength } from '../../middleware/security';
import { AppError, createError, ErrorCodes } from '../../utils/errors';

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
export const startPublicChat = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { twinId, visitorId } = startPublicChatSchema.parse(req.body);

    // Get userId if user is logged in
    const userId = req.user?.id;
    logger.info(`[startPublicChat] Twin: ${twinId}, UserId: ${userId || 'anonymous'}, VisitorId: ${visitorId || 'none'}`);

    // Generate visitor ID if not provided and user not logged in
    const finalVisitorId = userId ? null : (visitorId || `visitor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);

    // Check if twin exists and is public
    const twinResult = await db.query(`
      SELECT id, "isPublic", "styleVector", "sampleReply"
      FROM "Twin"
      WHERE id = $1 AND "isPublic" = true
    `, [twinId]);

    if (twinResult.rows.length === 0) {
      throw createError.notFound('Public twin not found', ErrorCodes.TWIN_NOT_FOUND);
    }

    const twin = twinResult.rows[0];

    // Check for existing public chat or create new one
    // If user is logged in, search by userId; otherwise by visitorId
    let publicChat;
    if (userId) {
      const chatsByUser = await db.query(
        'SELECT * FROM "PublicChat" WHERE "twinId" = $1 AND "userId" = $2 ORDER BY "createdAt" DESC LIMIT 1',
        [twinId, userId]
      );
      publicChat = chatsByUser.rows.length > 0 ? chatsByUser.rows[0] : null;
    } else {
      publicChat = await publicChatQueries.findByTwinAndVisitor(twinId, finalVisitorId);
      if (publicChat && Array.isArray(publicChat)) {
        publicChat = publicChat.length > 0 ? publicChat[0] : null;
      }
    }

    if (!publicChat) {
      // Create new public chat with userId if logged in
      logger.info(`[startPublicChat] Creating new chat - TwinId: ${twinId}, UserId: ${userId || 'null'}, VisitorId: ${finalVisitorId || 'null'}`);
      publicChat = await publicChatQueries.create(twinId, finalVisitorId, userId);
      logger.info(`[startPublicChat] Chat created successfully - ChatId: ${publicChat.id}, UserId set: ${publicChat.userId || 'null'}`);
    } else {
      logger.info(`[startPublicChat] Existing chat found - ChatId: ${publicChat.id}, UserId: ${publicChat.userId || 'null'}`);
    }

    // Log event
    if (userId) {
      await EventLogger.logUserEvent(userId, 'public_chat_started', {
        twinId,
        chatId: publicChat.id
      });
    } else if (finalVisitorId && !finalVisitorId.startsWith('visitor_')) {
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
    if (error instanceof AppError) {
      throw error;
    }
    throw createError.internal('Failed to start public chat', error);
  }
};

// Send message in public chat
export const sendPublicMessage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { chatId } = req.params;
    const { message } = sendPublicMessageSchema.parse(req.body);

    // Validate message
    if (!validateMessageLength(message)) {
      throw createError.validation('Message length invalid');
    }

    if (checkBlacklist(message)) {
      throw createError.validation('Message contains restricted content');
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
      throw createError.notFound('Public chat not found', ErrorCodes.CHAT_NOT_FOUND);
    }

    const chat = chatResult.rows[0];

    // Save visitor message using raw SQL
    const visitorMessageId = `pub_msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await db.query(`
      INSERT INTO "PublicMessage" ("id", "chatId", "sender", "content", "approved", "createdAt")
      VALUES ($1, $2, $3, $4, $5, NOW())
    `, [visitorMessageId, chatId, 'human', message.trim(), true]);

    // Get recent chat context (last 10 messages)
    const recentMessagesResult = await db.query(`
      SELECT content, sender, "createdAt"
      FROM "PublicMessage"
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
      currentMessages: [message.trim()],
      twinId: chat.twinId // Add twinId for memory retrieval
    };

    // Generate AI response using TwinService
    let aiResponse;
    try {
      logger.info('Generating AI response for public chat:', { chatId, twinId: chat.twinId });
      aiResponse = await twinService.generateDraftWithContext(context);
      
      if (!aiResponse || aiResponse.trim().length === 0) {
        throw new Error('Empty response from AI');
      }
      
      logger.info('AI response generated successfully:', { responseLength: aiResponse.length });
    } catch (error) {
      logger.error('AI response generation failed:', error);
      aiResponse = "I'm having trouble thinking right now. Could you try again?";
    }

    // Save AI response using raw SQL
    const aiMessageId = `pub_msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await db.query(`
      INSERT INTO "PublicMessage" ("id", "chatId", "sender", "content", "approved", "createdAt")
      VALUES ($1, $2, $3, $4, $5, NOW())
    `, [aiMessageId, chatId, 'twin', aiResponse, true]);

    // ✅ OPTIMIZED: Send response immediately, update metadata async
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

    // ✅ POST-RESPONSE CLEANUP - ASYNC (non-blocking)
    if (chatId) {
      publicChatQueries.updateMessageCount(chatId).catch(err => 
        logger.warn('Failed to update public chat message count:', err)
      );
    }

  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw createError.internal('Failed to send public message', error);
  }
};

// Get public chat history
export const getPublicChatHistory = async (req: Request, res: Response, next: NextFunction) => {
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
      throw createError.notFound('Public chat not found', ErrorCodes.CHAT_NOT_FOUND);
    }

    const chat = chatResult.rows[0];

    // Get chat messages
    const messagesResult = await db.query(`
      SELECT id, content, sender, "createdAt"
      FROM "PublicMessage"
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
    if (error instanceof AppError) {
      throw error;
    }
    throw createError.internal('Failed to get public chat history', error);
  }
};

// Get public chat by twin ID (for starting new chat)
export const getPublicChatByTwin = async (req: Request, res: Response, next: NextFunction) => {
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
      throw createError.notFound('Public twin not found', ErrorCodes.TWIN_NOT_FOUND);
    }

    const twin = twinResult.rows[0];

    // Check for existing public chat
    const existingChat = await publicChatQueries.findByTwinAndVisitor(twinId, visitorId as string);

    if (existingChat) {
      // Get chat history
      const messagesResult = await db.query(`
        SELECT id, content, sender, "createdAt"
        FROM "PublicMessage"
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
    if (error instanceof AppError) {
      throw error;
    }
    throw createError.internal('Failed to get public chat by twin', error);
  }
};

// ADD after line 308 (after the closing } of getPublicChatByTwin):

// Get all public chats for a visitor with a specific twin
export const getPublicChatsByTwin = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { twinId } = req.params;
    const { visitorId } = req.query;
    const userId = req.user?.id;

    // Check if twin exists and is public
    const twinResult = await db.query(`
      SELECT id, "isPublic", "publicHandle", "sampleReply"
      FROM "Twin"
      WHERE id = $1 AND "isPublic" = true
    `, [twinId]);

    if (twinResult.rows.length === 0) {
      throw createError.notFound('Public twin not found', ErrorCodes.TWIN_NOT_FOUND);
    }

    const twin = twinResult.rows[0];

    // Get all chats for this visitor with this twin
    const chatsResult = await db.query(`
      SELECT pc.id, pc."messageCount", pc."createdAt", pc."lastActivity", pc."title",
             m.content as last_message, m."createdAt" as last_message_time
      FROM "PublicChat" pc
      LEFT JOIN LATERAL (
        SELECT content, "createdAt"
        FROM "PublicMessage" 
        WHERE "chatId" = pc.id 
        ORDER BY "createdAt" DESC 
        LIMIT 1
      ) m ON true
      WHERE pc."twinId" = $1 
        AND (
          (pc."userId" = $2 AND $2 IS NOT NULL) 
          OR 
          (pc."visitorId" = $3 AND $2 IS NULL AND $3 IS NOT NULL)
        )
      ORDER BY pc."lastActivity" DESC, pc."createdAt" DESC
    `, [twinId, userId || null, visitorId as string || null]);

    const chats = chatsResult.rows.map(chat => ({
      id: chat.id,
      messageCount: chat.messageCount || 0,
      createdAt: chat.createdAt,
      lastActivity: chat.lastActivity,
      lastMessage: chat.last_message ? {
        content: chat.last_message,
        createdAt: chat.last_message_time
      } : null
    }));

    res.json({
      success: true,
      twin: {
        id: twin.id,
        publicHandle: twin.publicHandle,
        sampleReply: twin.sampleReply
      },
      chats
    });

  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw createError.internal('Failed to get public chats by twin', error);
  }
};


// Create new public chat
export const createNewPublicChat = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { twinId, visitorId } = req.body;
    const userId = req.user?.id; // Get userId if logged in
    logger.info(`[createNewPublicChat] Twin: ${twinId}, UserId: ${userId || 'anonymous'}, VisitorId: ${visitorId || 'none'}`);

    // Check if twin exists and is public
    const twinResult = await db.query(`
      SELECT id, "isPublic", "styleVector", "sampleReply"
      FROM "Twin"
      WHERE id = $1 AND "isPublic" = true
    `, [twinId]);

    if (twinResult.rows.length === 0) {
      throw createError.notFound('Public twin not found', ErrorCodes.TWIN_NOT_FOUND);
    }

    const twin = twinResult.rows[0];

    // Create new public chat with userId if logged in
    const publicChat = await publicChatQueries.create(twinId, visitorId, userId);
    logger.info(`[createNewPublicChat] Chat created - ChatId: ${publicChat.id}, UserId: ${publicChat.userId || 'null'}`);

    res.json({
      success: true,
      chatId: publicChat.id,
      twin: {
        id: twin.id,
        sampleReply: twin.sampleReply
      }
    });

  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw createError.internal('Failed to create new public chat', error);
  }
};

// Get all public chats for logged-in user (grouped by twin)
export const getUserPublicChats = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw createError.unauthorized();
    }

    const userId = req.user.id;
    logger.info(`[getUserPublicChats] Fetching chats for userId: ${userId}`);

    // Get all public chats for this user, grouped by twin
    // For each twin, get the latest chat and message info
    const chatsResult = await db.query(`
      SELECT DISTINCT ON (pc."twinId")
        pc.id as chat_id,
        pc."twinId",
        pc."messageCount",
        pc."createdAt",
        pc."lastActivity",
        pc."title",
        t."publicHandle",
        t.bio,
        t."profileImage",
        t."likeCount",
        t."chatCount",
        t."followCount",
        t."verified",
        (
          SELECT content 
          FROM "PublicMessage" 
          WHERE "chatId" = pc.id 
          ORDER BY "createdAt" DESC 
          LIMIT 1
        ) as last_message_content,
        (
          SELECT "createdAt" 
          FROM "PublicMessage" 
          WHERE "chatId" = pc.id 
          ORDER BY "createdAt" DESC 
          LIMIT 1
        ) as last_message_time
      FROM "PublicChat" pc
      JOIN "Twin" t ON pc."twinId" = t.id
      WHERE pc."userId" = $1 
        AND t."isPublic" = true
      ORDER BY pc."twinId", pc."lastActivity" DESC
    `, [userId]);

    logger.info(`[getUserPublicChats] Query returned ${chatsResult?.rows?.length || 0} rows`);

    // Group by twin and format response
    const twinChatsMap = new Map();

    chatsResult.rows.forEach(row => {
      const twinId = row.twinId;
      
      if (!twinChatsMap.has(twinId)) {
        twinChatsMap.set(twinId, {
          twin: {
            id: twinId,
            publicHandle: row.publicHandle,
            bio: row.bio,
            profileImage: row.profileImage,
            likeCount: row.likeCount || 0,
            chatCount: row.chatCount || 0,
            followCount: row.followCount || 0,
            verified: row.verified || false
          },
          latestChat: {
            id: row.chat_id,
            messageCount: row.messageCount || 0,
            createdAt: row.createdAt,
            lastActivity: row.lastActivity,
            title: row.title
          },
          lastMessage: row.last_message_content ? {
            content: row.last_message_content,
            createdAt: row.last_message_time
          } : null
        });
      } else {
        // Update if this chat is more recent
        const existing = twinChatsMap.get(twinId);
        if (new Date(row.lastActivity) > new Date(existing.latestChat.lastActivity)) {
          existing.latestChat = {
            id: row.chat_id,
            messageCount: row.messageCount || 0,
            createdAt: row.createdAt,
            lastActivity: row.lastActivity,
            title: row.title
          };
          existing.lastMessage = row.last_message_content ? {
            content: row.last_message_content,
            createdAt: row.last_message_time
          } : null;
        }
      }
    });

    // Convert map to array and sort by last activity
    const twinChats = Array.from(twinChatsMap.values())
      .sort((a, b) => {
        const timeA = a.latestChat.lastActivity;
        const timeB = b.latestChat.lastActivity;
        return new Date(timeB).getTime() - new Date(timeA).getTime();
      });

    logger.info(`[getUserPublicChats] Found ${twinChats.length} unique twins with chats for userId: ${userId}`);
    logger.debug(`[getUserPublicChats] Raw query result count: ${chatsResult.rows.length}`);

    res.json({
      success: true,
      chats: twinChats,
      total: twinChats.length
    });

  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw createError.internal('Failed to get user public chats', error);
  }
};