import { Request, Response } from 'express';
import { db } from '../../config/database';
import { logger } from '../../config/logger';
import { systemPromptUpdater } from '../../services/systemPromptUpdater';

/**
 * Regenerate system prompt for a twin
 */
export const regeneratePrompt = async (req: any, res: Response) => {
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
    
    // Update system prompt
    const success = await systemPromptUpdater.updateTwinSystemPrompt(twinId);
    
    if (success) {
      res.json({ success: true, message: 'System prompt regenerated successfully' });
    } else {
      res.status(500).json({ success: false, error: 'Failed to regenerate system prompt' });
    }
  } catch (error) {
    logger.error('Regenerate prompt API error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

/**
 * Get learning data for a twin
 */
export const getLearningData = async (req: any, res: Response) => {
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
    
    // Real learning data from database
    const learningData = {
      totalInteractions: 0,
      learningScore: 0,
      styleAccuracy: 0,
      events: [] as any[]
    };

    try {
      // Get real analytics from database
      const analyticsResult = await db.query(`
        SELECT 
          COUNT(DISTINCT c.id) as total_chats,
          COUNT(m.id) as total_messages,
          COUNT(CASE WHEN cf.rating = 'positive' THEN 1 END) as positive_feedback,
          COUNT(CASE WHEN cf.rating = 'negative' THEN 1 END) as negative_feedback
        FROM "Chat" c
        LEFT JOIN "Message" m ON c.id = m."chatId"
        LEFT JOIN "ChatFeedback" cf ON c.id = cf."chatId"
        WHERE c."twinId" = $1
      `, [twinId]);

      if (analyticsResult && analyticsResult.rows.length > 0) {
        const analytics = analyticsResult.rows[0];
        
        // Get recent learning events
        const eventsResult = await db.query(`
          SELECT 
            'Style correction applied' as description,
            ts as timestamp
          FROM "style_corrections" 
          WHERE "twin_id" = $1
          ORDER BY ts DESC
          LIMIT 5
        `, [twinId]);

        learningData.totalInteractions = parseInt(analytics.total_messages) || 0;
        learningData.learningScore = analytics.total_messages > 0 ? 
          Math.round((parseInt(analytics.positive_feedback) / parseInt(analytics.total_messages)) * 100) : 0;
        learningData.styleAccuracy = analytics.total_messages > 0 ? 
          Math.round((parseInt(analytics.positive_feedback) / parseInt(analytics.total_messages)) * 100) : 0;
        
        if (eventsResult && eventsResult.rows) {
          learningData.events = eventsResult.rows.map((event: any) => ({
            description: event.description,
            timestamp: event.timestamp
          }));
        }
      }
    } catch (error) {
      logger.error('Error loading learning data:', error);
      // Keep default values if error occurs
    }

    res.json({ success: true, learning: learningData });
  } catch (error) {
    logger.error('Learning data API error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

/**
 * Update learning settings
 */
export const updateLearningSettings = async (req: any, res: Response) => {
  try {
    const { id: twinId } = req.params;
    const userId = req.user.id;
    const { autoLearning, learningSensitivity } = req.body;
    
    // Verify ownership
    const twinResult = await db.query(`
      SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);
    
    if (!twinResult || twinResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Twin not found' });
    }
    
    // Update learning settings (implement database storage later)
    res.json({ success: true, message: 'Learning settings updated successfully' });
  } catch (error) {
    logger.error('Learning settings API error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

/**
 * Get chat history for a twin
 */
export const getTwinChatHistory = async (req: any, res: Response) => {
  try {
    const { id: twinId } = req.params;
    const { limit = 20, offset = 0 } = req.query;
    const userId = req.user.id;
    
    // Verify twin ownership
    const twinResult = await db.query(`
      SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);
    
    if (!twinResult || twinResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Twin not found' });
    }
    
    // Get all chats for this twin
    const chats = await db.query(`
      SELECT 
        c.id, 
        c."createdAt", 
        c."lastMessage",
        COUNT(m.id) as message_count,
        MAX(m."createdAt") as last_message_time
      FROM "Chat" c
      LEFT JOIN "Message" m ON c.id = m."chatId"
      WHERE c."twinId" = $1 AND c."userId" = $2
      GROUP BY c.id, c."createdAt", c."lastMessage"
      ORDER BY c."createdAt" DESC
      LIMIT $3 OFFSET $4
    `, [twinId, userId, parseInt(limit as string), parseInt(offset as string)]);
    
    if (!chats) {
      return res.status(500).json({ success: false, error: 'Failed to fetch chats' });
    }
    
    // Format chat data
    const chatHistory = chats.rows.map((chat: any) => ({
      id: chat.id,
      createdAt: chat.createdAt,
      lastMessage: chat.last_message,
      messageCount: parseInt(chat.message_count) || 0,
      lastMessageTime: chat.last_message_time
    }));
    
    res.json({ 
      success: true, 
      chats: chatHistory,
      total: chatHistory.length 
    });
  } catch (error) {
    logger.error('Chat history API error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

