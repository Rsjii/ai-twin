import { Response } from 'express';
import { db } from '../../config/database';
import { logger } from '../../config/logger';
import { systemPromptUpdater } from '../../services/systemPromptUpdater';
import { verifyTwinOwnership } from '../../utils/twinUtils';

/**
 * Regenerate system prompt for a twin
 */
export const regeneratePrompt = async (req: any, res: Response) => {
  try {
    const { id: twinId } = req.params;
    const userId = req.user.id;
    
    // Verify ownership
   await verifyTwinOwnership(twinId, userId);
    
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
    console.log('[BACKEND_LEARNING] ========== START getLearningData ==========');
    const { id: twinId } = req.params;
    const userId = req.user.id;
    
    console.log('[BACKEND_LEARNING] Request params:', {
      twinId,
      userId,
      hasUser: !!req.user
    });
    
    // Verify ownership
    console.log('[BACKEND_LEARNING] Verifying twin ownership...');
    await verifyTwinOwnership(twinId, userId);
    console.log('[BACKEND_LEARNING] ✅ Ownership verified');
    
    // Real learning data from database
    const learningData = {
      totalInteractions: 0,
      learningScore: 0,
      styleAccuracy: 0,
      events: [] as any[]
    };

    try {
      console.log('[BACKEND_LEARNING] Executing analytics query...');
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

      console.log('[BACKEND_LEARNING] Analytics query result:', {
        hasResult: !!analyticsResult,
        rowsCount: analyticsResult?.rows?.length || 0,
        firstRow: analyticsResult?.rows?.[0]
      });

      if (analyticsResult && analyticsResult.rows.length > 0) {
        const analytics = analyticsResult.rows[0];
        console.log('[BACKEND_LEARNING] Analytics data:', {
          total_chats: analytics.total_chats,
          total_messages: analytics.total_messages,
          positive_feedback: analytics.positive_feedback,
          negative_feedback: analytics.negative_feedback
        });
        
        console.log('[BACKEND_LEARNING] Executing events query...');
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

        console.log('[BACKEND_LEARNING] Events query result:', {
          hasResult: !!eventsResult,
          rowsCount: eventsResult?.rows?.length || 0
        });

        learningData.totalInteractions = parseInt(analytics.total_messages) || 0;
        learningData.learningScore = analytics.total_messages > 0 ? 
          Math.round((parseInt(analytics.positive_feedback) / parseInt(analytics.total_messages)) * 100) : 0;
        learningData.styleAccuracy = analytics.total_messages > 0 ? 
          Math.round((parseInt(analytics.positive_feedback) / parseInt(analytics.total_messages)) * 100) : 0;
        
        console.log('[BACKEND_LEARNING] Calculated learning data:', {
          totalInteractions: learningData.totalInteractions,
          learningScore: learningData.learningScore,
          styleAccuracy: learningData.styleAccuracy
        });
        
        if (eventsResult && eventsResult.rows) {
          learningData.events = eventsResult.rows.map((event: any) => ({
            description: event.description,
            timestamp: event.timestamp
          }));
          console.log('[BACKEND_LEARNING] Events mapped:', learningData.events.length, 'events');
        }
      } else {
        console.warn('[BACKEND_LEARNING] ⚠️ No analytics result, using default values');
      }
    } catch (error) {
      console.error('[BACKEND_LEARNING] ❌ Error loading learning data:', error);
      logger.error('Error loading learning data:', error);
      // Keep default values if error occurs
    }

    console.log('[BACKEND_LEARNING] Final learning data:', learningData);
    console.log('[BACKEND_LEARNING] ✅ Sending response with status 200');
    console.log('[BACKEND_LEARNING] ========== END getLearningData (SUCCESS) ==========');
    res.json({ success: true, learning: learningData });
  } catch (error) {
    console.error('[BACKEND_LEARNING] ========== ERROR in getLearningData ==========');
    console.error('[BACKEND_LEARNING] Error:', error);
    console.error('[BACKEND_LEARNING] Error stack:', error instanceof Error ? error.stack : 'No stack');
    logger.error('Learning data API error:', error);
    console.log('[BACKEND_LEARNING] ========== END getLearningData (ERROR) ==========');
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
   await verifyTwinOwnership(twinId, userId);
    
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
    
    await verifyTwinOwnership(twinId, userId);
    
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

