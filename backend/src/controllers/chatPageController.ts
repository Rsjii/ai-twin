import { Response } from 'express';
import { db } from '../config/database';
import { logger } from '../config/logger';
import { AppError, createError } from '../utils/errors';
import { generateId } from '../utils/idGenerator';
import { handleControllerError } from '../utils/errorHandler';
import { detokenizeId, tokenizeId } from '../utils/idTokenization';

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

    // ✅ FIX: Check if chatId query parameter exists (now tokenized)
    const requestedChatId = req.query.chatId;
    
    if (requestedChatId) {
      // ✅ PHASE 4: Detokenize chatId token
      const decoded = detokenizeId(requestedChatId as string);
      if (decoded && decoded.type === 'chat') {
        const actualChatId = decoded.id;
        
        // Verify the chat belongs to the user
        const chatResult = await db.query(`
          SELECT id, "userId", "twinId", "createdAt"
          FROM "Chat"
          WHERE id = $1 AND "userId" = $2
        `, [actualChatId, req.user.id]);
        
        if (chatResult.rows.length > 0) {
          chat = chatResult.rows[0];
        } else {
          logger.warn('Requested chat not found or unauthorized', {
            requestedChatId,
            actualChatId,
            userId: req.user.id
          });
          
          // Fall through to create/get latest chat
          const chats = await db.query(`
            SELECT id, "userId", "twinId", "createdAt"
            FROM "Chat"
            WHERE "userId" = $1 AND "twinId" = $2
            ORDER BY "createdAt" DESC
            LIMIT 1
          `, [req.user.id, latestTwin.id]);
          
          if (chats.rows.length === 0) {
            const chatId = generateId.chat();
            const utcTimestamp = new Date().toISOString();
            const newChat = await db.query(`
              INSERT INTO "Chat" ("id", "userId", "twinId", "createdAt")
              VALUES ($1, $2, $3, $4::timestamptz)
              RETURNING id
            `, [chatId, req.user.id, latestTwin.id, utcTimestamp]);
            
            chat = { id: newChat.rows[0].id };
          } else {
            chat = chats.rows[0];
          }
        }
      } else {
        // Invalid token, fall through to create/get latest chat
        logger.warn('Invalid chat token in query', { requestedChatId });
        
        const chats = await db.query(`
          SELECT id, "userId", "twinId", "createdAt"
          FROM "Chat"
          WHERE "userId" = $1 AND "twinId" = $2
          ORDER BY "createdAt" DESC
          LIMIT 1
        `, [req.user.id, latestTwin.id]);
        
        if (chats.rows.length === 0) {
          const chatId = generateId.chat();
          const utcTimestamp = new Date().toISOString();
          const newChat = await db.query(`
            INSERT INTO "Chat" ("id", "userId", "twinId", "createdAt")
            VALUES ($1, $2, $3, $4::timestamptz)
            RETURNING id
          `, [chatId, req.user.id, latestTwin.id, utcTimestamp]);
          
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
        const chatId = generateId.chat();
        const utcTimestamp = new Date().toISOString();
        const newChat = await db.query(`
          INSERT INTO "Chat" ("id", "userId", "twinId", "createdAt")
          VALUES ($1, $2, $3, $4::timestamptz)
          RETURNING id
        `, [chatId, req.user.id, latestTwin.id, utcTimestamp]);
        
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

    // ✅ PHASE 4: Tokenize IDs before passing to view
    
    res.render('chat-enhanced', { 
      title: 'Enhanced Chat - AI Twin',
      user: user,
      pathname: '/chat-enhanced',
      chatId: tokenizeId(chat.id, 'chat'),
      twinId: tokenizeId(latestTwin.id, 'twin'),
      csrfToken: res.locals['csrfToken']
    });
  } catch (error) {
    logger.error('Enhanced chat route error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.id,
      path: req.path
    });
    
    handleControllerError(error, 'Failed to load enhanced chat');
  }
}