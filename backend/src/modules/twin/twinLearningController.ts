import { Response, NextFunction } from 'express';
import { db } from '../../config/database';
import { logger } from '../../config/logger';
import { systemPromptUpdater } from '../../services/systemPromptUpdater';
import { verifyTwinOwnership } from '../../utils/twinUtils';
import { detokenizeId } from '../../utils/idTokenization';
import { createError, ErrorCodes } from '../../utils/errors';
import { isDev } from '../../config/env';

/**
 * Regenerate system prompt for a twin
 */
export const regeneratePrompt = async (req: any, res: Response, next: NextFunction) => {
  try {
    // ✅ SECURITY: Detokenize twinToken from URL
    const { twinToken } = req.params;
    const decoded = detokenizeId(twinToken, { userId: req.user.id, endpoint: 'regeneratePrompt' });
    if (!decoded || decoded.type !== 'twin') {
      throw createError.notFound('Invalid twin token', ErrorCodes.TWIN_NOT_FOUND);
    }
    const twinId = decoded.id;
    const userId = req.user.id;
    
    // Verify ownership
    await verifyTwinOwnership(twinId, userId);
    
    // Update system prompt
    const success = await systemPromptUpdater.updateTwinSystemPrompt(twinId);
    
    if (!success) {
      throw createError.internal('Failed to regenerate system prompt');
    }
    
    res.json({ success: true, message: 'System prompt regenerated successfully' });
  } catch (error) {
    next(error); // ✅ Let asyncHandler + errorHandlerMiddleware handle it
  }
};

/**
 * Get learning data for a twin
 */
export const getLearningData = async (req: any, res: Response, next: NextFunction) => {
  try {
    // ✅ SECURITY: Detokenize twinToken from URL
    const { twinToken } = req.params;
    const decoded = detokenizeId(twinToken, { userId: req.user.id, endpoint: 'getLearningData' });
    if (!decoded || decoded.type !== 'twin') {
      throw createError.notFound('Invalid twin token', ErrorCodes.TWIN_NOT_FOUND);
    }
    const twinId = decoded.id;
    const userId = req.user.id;
    
    // Verify ownership
    await verifyTwinOwnership(twinId, userId);
    
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
    next(error); // ✅ Standardize on next(error)
  }
};

/**
 * Update learning settings
 */
export const updateLearningSettings = async (req: any, res: Response, next: NextFunction) => {
  try {
    // ✅ SECURITY: Detokenize twinToken from URL
    const { twinToken } = req.params;
    const decoded = detokenizeId(twinToken, { userId: req.user.id, endpoint: 'updateLearningSettings' });
    if (!decoded || decoded.type !== 'twin') {
      throw createError.notFound('Invalid twin token', ErrorCodes.TWIN_NOT_FOUND);
    }
    const twinId = decoded.id;
    const userId = req.user.id;
    const { autoLearning, learningSensitivity } = req.body;

    // Verify ownership
    await verifyTwinOwnership(twinId, userId);

    // Load current personaData
    const twinResult = await db.query(`
      SELECT "personaData" FROM "Twin"
      WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);

    const currentPersona = twinResult.rows[0]?.personaData || {};

    // Merge learning settings into personaData
    const updatedPersona = {
      ...currentPersona,
      learningSettings: {
        autoLearning: !!autoLearning,
        learningSensitivity: learningSensitivity || 'medium',
      },
    };

    await db.query(`
      UPDATE "Twin"
      SET "personaData" = $1
      WHERE id = $2
    `, [JSON.stringify(updatedPersona), twinId]);

    res.json({ success: true, message: 'Learning settings updated successfully' });
  } catch (error) {
    next(error);
  }
};

/**
 * Get learning settings
 */
export const getLearningSettings = async (req: any, res: Response, next: NextFunction) => {
  try {
    const { twinToken } = req.params;
    const decoded = detokenizeId(twinToken, { userId: req.user.id, endpoint: 'getLearningSettings' });
    if (!decoded || decoded.type !== 'twin') {
      throw createError.notFound('Invalid twin token', ErrorCodes.TWIN_NOT_FOUND);
    }
    const twinId = decoded.id;
    const userId = req.user.id;

    await verifyTwinOwnership(twinId, userId);

    const twinResult = await db.query(`
      SELECT "personaData" FROM "Twin"
      WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);

    const persona = twinResult.rows[0]?.personaData || {};
    const settings = persona.learningSettings || {
      autoLearning: false,
      learningSensitivity: 'medium',
    };

    res.json({ success: true, settings });
  } catch (error) {
    next(error);
  }
};

/**
 * Get chat history for a twin
 */
export const getTwinChatHistory = async (req: any, res: Response, next: NextFunction) => {
  try {
    // ✅ SECURITY: Detokenize twinToken from URL
    const { twinToken } = req.params;
    const decoded = detokenizeId(twinToken, { userId: req.user.id, endpoint: 'getTwinChatHistory' });
    if (!decoded || decoded.type !== 'twin') {
      throw createError.notFound('Invalid twin token', ErrorCodes.TWIN_NOT_FOUND);
    }
    const twinId = decoded.id;
    const { QUERY_LIMITS } = await import('../../config/constants');
    const { limit = QUERY_LIMITS.CHAT_MESSAGES, offset = 0 } = req.query;
    
    const rawLimit = Number(limit) || QUERY_LIMITS.CHAT_MESSAGES;
    const safeLimit = Math.min(
      Math.max(rawLimit, 1),
      QUERY_LIMITS.MAX_PAGE_SIZE,
    );
    
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const userId = req.user.id;
    
    await verifyTwinOwnership(twinId, userId);
    
    // Get all chats for this twin - only with messages
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
      HAVING COUNT(m.id) > 0
      ORDER BY c."createdAt" DESC
      LIMIT $3 OFFSET $4
    `, [twinId, userId, safeLimit, safeOffset]);
    
    if (!chats) {
      throw createError.internal('Failed to fetch chats');
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
    next(error);
  }
};

