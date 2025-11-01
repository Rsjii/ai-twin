import { Response } from 'express';
import { db } from '../config/database';
import { logger } from '../config/logger';

/**
 * Chat Continue - Redirect to chat with latest twin
 */
export async function getChatContinue(req: any, res: Response) {
  console.log('🚀 CHAT CONTINUE ROUTE HIT!');
  try {
    console.log('=== CHAT CONTINUE ROUTE ===');
    console.log('req.user:', req.user);
    console.log('req.user.id:', req.user.id);
    console.log('========================');
    
    if (!req.user) {
      console.log('❌ No user, redirecting to auth');
      return res.redirect('/auth');
    }

    // Get user's latest twin using raw SQL like my-twins
    const twins = await db.query(`
      SELECT id, "styleVector", "sampleReply", "createdAt" 
      FROM "Twin" 
      WHERE "userId" = $1 
      ORDER BY "createdAt" DESC
      LIMIT 1
    `, [req.user.id]);

    console.log('Found twins:', twins.rows);

    if (twins.rows.length === 0) {
      console.log('❌ No twin found, redirecting to create');
      return res.redirect('/twin/create');
    }

    const latestTwin = twins.rows[0];
    console.log('✅ Latest twin found:', latestTwin);

    // Find existing chat with this twin or create new one using raw SQL
    let chats = await db.query(`
      SELECT id, "userId", "twinId", "createdAt"
      FROM "Chat"
      WHERE "userId" = $1 AND "twinId" = $2
      ORDER BY "createdAt" DESC
      LIMIT 1
    `, [req.user.id, latestTwin.id]);

    console.log('Existing chats:', chats.rows);

    let chat;
    if (chats.rows.length === 0) {
      // Create new chat using raw SQL with generated ID
      const chatId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const newChat = await db.query(`
        INSERT INTO "Chat" ("id", "userId", "twinId", "createdAt")
        VALUES ($1, $2, $3, NOW())
        RETURNING id
      `, [chatId, req.user.id, latestTwin.id]);
      
      chat = { id: newChat.rows[0].id };
      console.log('Created new chat:', chat);
    } else {
      chat = chats.rows[0];
      console.log('Using existing chat:', chat);
    }

    // Redirect to chat page
    console.log('🎯 SUCCESS! Redirecting to chat:', `/chat/${chat.id}`);
    res.redirect(`/chat/${chat.id}`);
  } catch (error) {
    console.error('💥 Chat continue error:', error);
    console.error('Error details:', error.message);
    console.error('Stack trace:', error.stack);
    logger.error('Chat continue error:', error);
    res.redirect('/dashboard');
  }
}

/**
 * Chat page - Individual chat view
 */
export function getChat(req: any, res: Response) {
  try {
    console.log('🚀 CHAT PAGE ROUTE HIT!');
    console.log('Chat ID:', req.params.id);
    console.log('User:', req.user);
    
    if (!req.user) {
      console.log('❌ No user, redirecting to auth');
      return res.redirect('/auth');
    }
    
    console.log('✅ Rendering chat page');
    console.log('CSRF Token:', res.locals['csrfToken']);
    console.log('User data:', JSON.stringify(req.user, null, 2));
    
    console.log('Rendering chat-simple template...');
    console.log('Template data:', {
      title: 'Chat - AI Twin',
      user: req.user,
      chatId: req.params.id,
      csrfToken: res.locals['csrfToken'],
    });
    
    // Test with minimal template first
    res.render('chat-simple', {
      title: 'Chat - AI Twin',
      user: req.user,
      chatId: req.params.id,
      csrfToken: res.locals['csrfToken'],
    });
  } catch (error) {
    console.error('💥 Chat page error:', error);
    console.error('Error details:', error.message);
    console.error('Stack trace:', error.stack);
    console.error('Error type:', typeof error);
    console.error('Error constructor:', error.constructor.name);
    
    logger.error('Chat page error:', error);
    // Send detailed error for debugging
    res.status(500).json({ 
      error: 'Internal server error', 
      details: error.message,
      stack: error.stack,
      type: error.constructor.name
    });
  }
}

/**
 * Chat History page
 */
export function getChatHistory(req: any, res: Response) {
  res.render('chat-history', {
    title: 'Chat History - AI Twin',
    user: req.user,
    csrfToken: res.locals['csrfToken'],
  });
}

/**
 * Enhanced Chat page
 */
export async function getChatEnhanced(req: any, res: Response) {
  try {
    console.log('🚀 ENHANCED CHAT ROUTE HIT!');
    console.log('req.user:', req.user);
    
    if (!req.user) {
      console.log('❌ No user, redirecting to auth');
      return res.redirect('/auth');
    }

    // Get user's latest twin
    const twins = await db.query(`
      SELECT id, "styleVector", "sampleReply", "createdAt" 
      FROM "Twin" 
      WHERE "userId" = $1 
      ORDER BY "createdAt" DESC
      LIMIT 1
    `, [req.user.id]);

    console.log('Found twins:', twins.rows);

    if (twins.rows.length === 0) {
      console.log('❌ No twin found, redirecting to create');
      return res.redirect('/twin/create');
    }

    const latestTwin = twins.rows[0];
    console.log('✅ Latest twin found:', latestTwin);

    // Find existing chat with this twin or create new one
    let chats = await db.query(`
      SELECT id, "userId", "twinId", "createdAt"
      FROM "Chat"
      WHERE "userId" = $1 AND "twinId" = $2
      ORDER BY "createdAt" DESC
      LIMIT 1
    `, [req.user.id, latestTwin.id]);

    console.log('Existing chats:', chats.rows);

    let chat;
    if (chats.rows.length === 0) {
      // Create new chat
      const chatId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const newChat = await db.query(`
        INSERT INTO "Chat" ("id", "userId", "twinId", "createdAt")
        VALUES ($1, $2, $3, NOW())
        RETURNING id
      `, [chatId, req.user.id, latestTwin.id]);
      
      chat = { id: newChat.rows[0].id };
      console.log('Created new chat:', chat);
    } else {
      chat = chats.rows[0];
      console.log('Using existing chat:', chat);
    }

    // Render enhanced chat page with proper chatId
    res.render('chat-enhanced', { 
      title: 'Enhanced Chat - AI Twin',
      user: req.user,
      chatId: chat.id,
      twinId: latestTwin.id,
      csrfToken: res.locals['csrfToken']
    });
  } catch (error) {
    console.error('💥 Enhanced chat route error:', error);
    logger.error('Enhanced chat route error:', error);
    res.redirect('/dashboard');
  }
}

