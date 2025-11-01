import { Request, Response } from 'express';
import { db, styleAnchorsQueries } from '../../config/database';
import { logger } from '../../config/logger';

/**
 * Add manual training example
 */
export const addManualTraining = async (req: any, res: Response) => {
  try {
    const { id: twinId } = req.params;
    const userId = req.user.id;
    const { userMessage, idealReply, trainingType } = req.body;
    
    // Verify ownership
    const twinResult = await db.query(`
      SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);
    
    if (!twinResult || twinResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Twin not found' });
    }
    
    // Create style anchor for manual training
    const anchorId = `anchor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await db.query(`
      INSERT INTO "style_anchors" (id, twin_id, user_utterance, ideal_reply, tags, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
    `, [anchorId, twinId, userMessage, idealReply, [trainingType || 'manual']]);
    
    res.json({ success: true, message: 'Training example added successfully' });
  } catch (error) {
    logger.error('Manual training API error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

/**
 * Get messages for a specific chat
 */
export const getChatMessages = async (req: any, res: Response) => {
  try {
    const { id: twinId, chatId } = req.params;
    const userId = req.user.id;
    
    // Verify ownership using raw SQL
    const twinResult = await db.query(`
      SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);
    
    if (!twinResult || twinResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Twin not found' });
    }
    
    // Get messages for the chat using raw SQL
    const messagesResult = await db.query(`
      SELECT id, content, sender, "createdAt"
      FROM "Message"
      WHERE "chatId" = $1
      ORDER BY "createdAt" ASC
    `, [chatId]);
    
    const messages = messagesResult.rows.map((msg: any) => ({
      id: msg.id,
      content: msg.content,
      sender: msg.sender,
      createdAt: msg.createdAt
    }));
    
    res.json({ success: true, messages });
  } catch (error) {
    logger.error('Error fetching chat messages:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch chat messages' });
  }
};

/**
 * Convert multiple messages to training examples
 */
export const convertMessagesToTraining = async (req: any, res: Response) => {
  try {
    const { id: twinId } = req.params;
    const { messageIds, trainingType } = req.body;
    const userId = req.user.id;
    
    // Verify ownership
    const twinResult = await db.query(`
      SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);
    
    if (!twinResult || twinResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Twin not found' });
    }
    
    // Get messages using raw SQL
    const placeholders = messageIds.map((_: any, i: number) => `$${i + 1}`).join(', ');
    const messagesResult = await db.query(`
      SELECT id, "chatId", content, sender, "createdAt"
      FROM "Message"
      WHERE id IN (${placeholders})
      ORDER BY "createdAt" ASC
    `, messageIds);
    
    const messages = messagesResult.rows;
    
    // Group messages by chat and create training examples
    const chatGroups: Record<string, any[]> = {};
    messages.forEach((message: any) => {
      if (!chatGroups[message.chatId]) {
        chatGroups[message.chatId] = [];
      }
      chatGroups[message.chatId].push(message);
    });
    
    let createdAnchors = 0;
    
    // Create style anchors from message pairs
    for (const chatId in chatGroups) {
      const chatMessages = chatGroups[chatId];
      
      for (let i = 0; i < chatMessages.length - 1; i++) {
        const userMessage = chatMessages[i];
        const aiMessage = chatMessages[i + 1];
        
        if (userMessage.sender === 'user' && aiMessage.sender === 'ai') {
          await styleAnchorsQueries.create({
            twinId: twinId,
            userUtterance: userMessage.content,
            idealReply: aiMessage.content,
            trainingType: trainingType || 'chat_conversion',
            metadata: {
              sourceChatId: chatId,
              sourceMessageIds: [userMessage.id, aiMessage.id]
            }
          });
          createdAnchors++;
        }
      }
    }
    
    res.json({ 
      success: true, 
      message: `Created ${createdAnchors} training examples`,
      createdAnchors 
    });
  } catch (error) {
    logger.error('Error converting messages to training:', error);
    res.status(500).json({ success: false, error: 'Failed to convert messages to training' });
  }
};

/**
 * Get training effectiveness metrics
 */
export const getTrainingEffectiveness = async (req: any, res: Response) => {
  try {
    const { id: twinId } = req.params;
    const userId = req.user.id;
    
    // Verify ownership using raw SQL
    const twinResult = await db.query(`
      SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);
    
    if (!twinResult || twinResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Twin not found' });
    }
    
    // Calculate effectiveness score using raw SQL
    const anchorsResult = await db.query(`
      SELECT COUNT(*) as count FROM "style_anchors" WHERE twin_id = $1
    `, [twinId]);
    
    const memoriesResult = await db.query(`
      SELECT COUNT(*) as count FROM "mem_chunks" WHERE twin_id = $1
    `, [twinId]);
    
    const correctionsResult = await db.query(`
      SELECT COUNT(*) as count 
      FROM "style_corrections" 
      WHERE "twin_id" = $1 AND ts >= NOW() - INTERVAL '7 days'
    `, [twinId]);
    
    const totalAnchors = parseInt(anchorsResult.rows[0]?.count || '0');
    const totalMemories = parseInt(memoriesResult.rows[0]?.count || '0');
    const recentCorrections = parseInt(correctionsResult.rows[0]?.count || '0');
    
    // Calculate score based on various factors
    let score = 0;
    if (totalAnchors >= 10) score += 30;
    else score += (totalAnchors / 10) * 30;
    
    if (totalMemories >= 20) score += 30;
    else score += (totalMemories / 20) * 30;
    
    if (recentCorrections <= 5) score += 40; // Fewer corrections = better
    else score += Math.max(0, 40 - (recentCorrections - 5) * 5);
    
    // Generate recommendations
    const recommendations: any[] = [];
    if (totalAnchors < 5) {
      recommendations.push({
        type: 'tip',
        icon: '💡',
        message: 'Add more style anchors to improve response quality'
      });
    }
    if (totalMemories < 10) {
      recommendations.push({
        type: 'warning',
        icon: '⚠️',
        message: 'Consider adding more memory chunks for better context'
      });
    }
    
    // Generate achievements
    const achievements = [
      {
        name: 'Style Master',
        description: '10+ anchors',
        icon: '🎯',
        unlocked: totalAnchors >= 10
      },
      {
        name: 'Memory Builder',
        description: '50+ memories',
        icon: '🧠',
        unlocked: totalMemories >= 50
      },
      {
        name: 'Quick Learner',
        description: '5+ examples',
        icon: '⚡',
        unlocked: totalAnchors >= 5
      },
      {
        name: 'Perfectionist',
        description: 'Low corrections',
        icon: '🔒',
        unlocked: recentCorrections <= 3
      }
    ];
    
    // Generate goals
    const goals = [
      {
        name: 'Add 5 more style anchors',
        current: totalAnchors,
        target: 5,
        progress: Math.min(100, (totalAnchors / 5) * 100),
        color: 'bg-blue-600'
      },
      {
        name: 'Create 10 memory chunks',
        current: totalMemories,
        target: 10,
        progress: Math.min(100, (totalMemories / 10) * 100),
        color: 'bg-green-600'
      },
      {
        name: 'Convert 3 chats to training',
        current: Math.min(3, Math.floor(totalAnchors / 2)),
        target: 3,
        progress: Math.min(100, (Math.min(3, Math.floor(totalAnchors / 2)) / 3) * 100),
        color: 'bg-purple-600'
      }
    ];
    
    res.json({
      success: true,
      effectiveness: {
        score: Math.round(score),
        totalAnchors,
        totalMemories,
        recentCorrections
      },
      recommendations,
      achievements,
      goals
    });
  } catch (error) {
    logger.error('Error calculating training effectiveness:', error);
    res.status(500).json({ success: false, error: 'Failed to calculate training effectiveness' });
  }
};

/**
 * Convert chat message to training example
 */
export const convertToTraining = async (req: any, res: Response) => {
  try {
    const { id: twinId } = req.params;
    const userId = req.user.id;
    const { messageId, idealReply } = req.body;
    
    // Verify ownership
    const twinResult = await db.query(`
      SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);
    
    if (!twinResult || twinResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Twin not found' });
    }
    
    // Get the original message
    const messageResult = await db.query(`
      SELECT content FROM "Message" 
      WHERE id = $1 AND "chatId" IN (
        SELECT id FROM "Chat" WHERE "twinId" = $2 AND "userId" = $3
      )
    `, [messageId, twinId, userId]);
    
    if (!messageResult || messageResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Message not found' });
    }
    
    // Create style anchor
    const anchorId = `anchor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await db.query(`
      INSERT INTO "style_anchors" (id, twin_id, user_utterance, ideal_reply, tags, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
    `, [anchorId, twinId, messageResult.rows[0].content, idealReply, ['chat_conversion']]);
    
    res.json({ success: true, message: 'Message converted to training example' });
  } catch (error) {
    logger.error('Convert to training API error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

/**
 * Get training progress
 */
export const getTrainingProgress = async (req: any, res: Response) => {
  try {
    const { id: twinId } = req.params;
    const userId = req.user.id;
    
    // Verify ownership
    const twinResult = await db.query(`
      SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);
    
    if (!twinResult || twinResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Twin not found' });
    }
    
    // Get training statistics
    const statsResult = await db.query(`
      SELECT 
        COUNT(*) as total_examples,
        COUNT(CASE WHEN tags @> ARRAY['manual']::text[] THEN 1 END) as manual_examples,
        COUNT(CASE WHEN tags @> ARRAY['chat_conversion']::text[] THEN 1 END) as converted_examples,
        COUNT(CASE WHEN tags @> ARRAY['auto']::text[] THEN 1 END) as auto_examples
      FROM "style_anchors" 
      WHERE twin_id = $1
    `, [twinId]);
    
    // Get recent training activity
    const recentResult = await db.query(`
      SELECT user_utterance, ideal_reply, tags, created_at
      FROM "style_anchors" 
      WHERE twin_id = $1
      ORDER BY created_at DESC
      LIMIT 10
    `, [twinId]);
    
    if (!statsResult || !recentResult) {
      return res.status(500).json({ success: false, error: 'Failed to fetch training data' });
    }
    
    const stats = statsResult.rows[0];
    const recent = recentResult.rows;
    
    res.json({ 
      success: true, 
      progress: {
        totalExamples: parseInt(stats.total_examples) || 0,
        manualExamples: parseInt(stats.manual_examples) || 0,
        convertedExamples: parseInt(stats.converted_examples) || 0,
        autoExamples: parseInt(stats.auto_examples) || 0,
        recentActivity: recent.map((item: any) => ({
          userUtterance: item.user_utterance,
          idealReply: item.ideal_reply,
          trainingType: item.tags,
          timestamp: item.created_at
        }))
      }
    });
  } catch (error) {
    logger.error('Training progress API error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

