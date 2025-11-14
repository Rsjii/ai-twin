import { Response } from 'express';
import { db } from '../config/database';
import { logger } from '../config/logger';
import { AppError, createError, ErrorCodes } from '../utils/errors';

/**
 * Chat Continue - Redirect to chat with latest twin
 */
export async function getChatContinue(req: any, res: Response) {
  try {
    if (!req.user) {
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

    let chats = await db.query(`
      SELECT id, "userId", "twinId", "createdAt"
      FROM "Chat"
      WHERE "userId" = $1 AND "twinId" = $2
      ORDER BY "createdAt" DESC
      LIMIT 1
    `, [req.user.id, latestTwin.id]);

    let chat;
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

    res.redirect(`/chat/${chat.id}`);
  } catch (error) {
    logger.error('Chat continue error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.id,
      path: req.path
    });
    
    if (error instanceof AppError) {
      return res.status(error.statusCode).render('error', {
        title: 'Error',
        message: error.message,
        errorCode: error.errorCode,
        user: req.user || null
      });
    }
    
    const appError = createError.internal('Failed to continue chat', error);
    res.redirect('/dashboard');
  }
}

/**
 * Chat page - Individual chat view
 */
export function getChat(req: any, res: Response) {
  try {
    if (!req.user) {
      return res.redirect('/auth');
    }
    
    res.render('chat-simple', {
      title: 'Chat - AI Twin',
      user: req.user || null,
      chatId: req.params.id,
      csrfToken: res.locals['csrfToken'],
    });
  } catch (error) {
    logger.error('Chat page error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.id,
      chatId: req.params.id,
      path: req.path
    });
    
    if (error instanceof AppError) {
      return res.status(error.statusCode).render('error', {
        title: 'Error',
        message: error.message,
        errorCode: error.errorCode,
        user: req.user || null
      });
    }
    
    const appError = createError.internal('Failed to load chat page', error);
    return res.status(appError.statusCode).render('error', {
      title: 'Error',
      message: appError.message,
      errorCode: appError.errorCode,
      user: req.user || null
    });
  }
}

/**
 * Chat History page
 */
export function getChatHistory(req: any, res: Response) {
  res.render('chat-history', {
    title: 'Chat History - AI Twin',
    user: req.user || null,
    csrfToken: res.locals['csrfToken'],
  });
}

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
      return res.status(error.statusCode).render('error', {
        title: 'Error',
        message: error.message,
        errorCode: error.errorCode,
        user: req.user || null
      });
    }
    
    const appError = createError.internal('Failed to load enhanced chat', error);
    res.redirect('/dashboard');
  }
}