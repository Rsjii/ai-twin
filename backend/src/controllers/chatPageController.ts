import { Response } from 'express';
import { db } from '../config/database';
import { logger } from '../config/logger';
import { AppError, createError } from '../utils/errors';

/**
 * Enhanced Chat page
 */
export async function getChatEnhanced(req: any, res: Response) {
  try {
    if (!req.user) {
      return res.redirect('/auth');
    }

    // ✅ FIX: Fetch full user with profileImage
    const { userQueries } = await import('../config/database');
    const fullUser = await userQueries.findByEmail(req.user.email);
    if (!fullUser) {
      return res.redirect('/auth');
    }

    const twins = await db.query(`
      SELECT id, "styleVector", "sampleReply", "createdAt" 
      FROM "Twin" 
      WHERE "userId" = $1 
      ORDER BY "createdAt" DESC
      LIMIT 1
    `, [req.user.id]);

    if (twins.rows.length === 0) {
      return res.redirect('/twin/create');
    }

    const latestTwin = twins.rows[0];
    let chat;

    // ✅ FIX: Check if chatId query parameter exists
    const requestedChatId = req.query.chatId;
    
    if (requestedChatId) {
      // Verify the chat belongs to the user
      const chatResult = await db.query(`
        SELECT id, "userId", "twinId", "createdAt"
        FROM "Chat"
        WHERE id = $1 AND "userId" = $2
      `, [requestedChatId, req.user.id]);
      
      if (chatResult.rows.length > 0) {
        chat = chatResult.rows[0];
      } else {
        logger.warn('Requested chat not found or unauthorized', {
          requestedChatId,
          userId: req.user.id
        });
        
        const chats = await db.query(`
          SELECT id, "userId", "twinId", "createdAt"
          FROM "Chat"
          WHERE "userId" = $1 AND "twinId" = $2
          ORDER BY "createdAt" DESC
          LIMIT 1
        `, [req.user.id, latestTwin.id]);
        
        if (chats.rows.length === 0) {
          const chatId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const newChat = await db.query(`
            INSERT INTO "Chat" ("id", "userId", "twinId", "createdAt")
            VALUES ($1, $2, $3, NOW())
            RETURNING id
          `, [chatId, req.user.id, latestTwin.id]);
          
          chat = { id: newChat.rows[0].id };
        } else {
          chat = chats.rows[0];
        }
      }
    } else {
      const chats = await db.query(`
        SELECT id, "userId", "twinId", "createdAt"
        FROM "Chat"
        WHERE "userId" = $1 AND "twinId" = $2
        ORDER BY "createdAt" DESC
        LIMIT 1
      `, [req.user.id, latestTwin.id]);
      
      if (chats.rows.length === 0) {
        const chatId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const newChat = await db.query(`
          INSERT INTO "Chat" ("id", "userId", "twinId", "createdAt")
          VALUES ($1, $2, $3, NOW())
          RETURNING id
        `, [chatId, req.user.id, latestTwin.id]);
        
        chat = { id: newChat.rows[0].id };
      } else {
        chat = chats.rows[0];
      }
    }

    // ✅ FIX: Pass full user with profileImage
    const user = {
      id: fullUser.id,
      email: fullUser.email,
      handle: fullUser.handle,
      name: fullUser.name,
      profileImage: fullUser.profileImage,
    };

    res.render('chat-enhanced', { 
      title: 'Enhanced Chat - AI Twin',
      user: user,
      pathname: '/chat-enhanced',
      chatId: chat.id,
      twinId: latestTwin.id,
      csrfToken: res.locals['csrfToken']
    });
  } catch (error) {
    logger.error('Enhanced chat route error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.id,
      path: req.path
    });
    
    if (error instanceof AppError) {
      throw error;
    }
    
    throw createError.internal('Failed to load enhanced chat', error);
  }
}