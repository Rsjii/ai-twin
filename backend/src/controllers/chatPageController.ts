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

    // ✅ Single twin per user (already hai)
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

    // ✅ NEW: chat token can come from path OR query
    const paramChatToken = req.params.chatToken as string | undefined;
    const queryChatToken = req.query.chatId as string | undefined;
    const requestedChatToken = paramChatToken || queryChatToken;

    if (requestedChatToken) {
      const decoded = detokenizeId(requestedChatToken as string);
      if (decoded && decoded.type === 'chat') {
        const actualChatId = decoded.id;

        const chatResult = await db.query(`
          SELECT id, "userId", "twinId", "createdAt"
          FROM "Chat"
          WHERE id = $1 AND "userId" = $2
        `, [actualChatId, req.user.id]);

        if (chatResult.rows.length > 0) {
          chat = chatResult.rows[0];
        } else {
          logger.warn('Requested chat not found or unauthorized', {
            requestedChatId: requestedChatToken,
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
        // invalid token → fallback to latest/create (existing branch)
        logger.warn('Invalid chat token in query', { requestedChatId: requestedChatToken });
        
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
      // ... existing "no chatId" branch (latest or new chat) ...
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
      chatId: tokenizeId(chat.id, 'chat'),       // token for frontend
      twinId: tokenizeId(latestTwin.id, 'twin'), // token for twin (if needed)
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