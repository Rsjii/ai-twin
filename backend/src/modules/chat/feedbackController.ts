import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { db } from '../../config/database';
import { logger } from '../../config/logger';
import { AppError, createError, ErrorCodes } from '../../utils/errors';
import { verifyTwinOwnership } from '../../utils/twinUtils';
import { generateId } from '../../utils/idGenerator';
import { handleControllerError } from '../../utils/errorHandler';

const feedbackSchema = z.object({
  rating: z.enum(['up', 'down']),
  messageId: z.string(),
  correction: z.string().optional()
});

// Map new feedback to existing style_corrections knobs
const knobMapping = {
  'user_style': 'casual',        // Map to existing knob
  'formality': 'formal',         // Map to existing knob  
  'emoji': 'emoji_off',          // Map to existing knob
  'humor': 'humor',              // Map to existing knob
  'question_freq': 'question_freq' // Already exists
};

/**
 * Submit response feedback - INTEGRATED with existing style_corrections
 */
export const submitResponseFeedback = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rating, messageId, correction } = feedbackSchema.parse(req.body);
    const { id: chatId } = req.params;
    const userId = req.user.id;

    // Get chat and verify ownership
    const chatResult = await db.query(`
      SELECT c."twinId" FROM "Chat" c
      WHERE c.id = $1 AND c."userId" = $2
    `, [chatId, userId]);

    if (chatResult.rows.length === 0) {
      throw createError.notFound('Chat not found or access denied', ErrorCodes.CHAT_NOT_FOUND);
    }

    const twinId = chatResult.rows[0].twinId;

    // Store feedback as style correction using EXISTING table
    const correctionId = generateId.correction();
    const delta = rating === 'up' ? 1 : -1;
    const utcTimestamp = new Date().toISOString();
    
    // Use EXISTING style_corrections table with mapped knob
    await db.query(`
      INSERT INTO style_corrections (id, twin_id, knob, delta, source, ts)
      VALUES ($1, $2, $3, $4, 'user_feedback', $5::timestamptz)
    `, [correctionId, twinId, knobMapping['user_style'], delta, utcTimestamp]);

    // Update AI run with rating if available
    await db.query(`
      UPDATE ai_runs 
      SET feedback_score = $1, user_rating = $2 
      WHERE twin_id = $3 
      ORDER BY ts DESC LIMIT 1
    `, [rating === 'up' ? 85 : 25, rating, twinId]);

    // If correction text provided, create style anchor using EXISTING table
    if (correction) {
      const anchorId = generateId.anchor();
      await db.query(`
        INSERT INTO style_anchors (id, twin_id, user_utterance, ideal_reply, tags, created_at)
        VALUES ($1, $2, $3, $4, $5, $6::timestamptz)
      `, [anchorId, twinId, 'User feedback', correction, ['user_correction'], utcTimestamp]);
    }

    res.json({
      success: true,
      message: 'Feedback submitted successfully',
      correctionId
    });

  } catch (error) {
    handleControllerError(error, 'Failed to submit feedback');
  }
};

/**
 * Get feedback statistics - INTEGRATED with existing style_corrections
 */
export const getFeedbackStats = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { twinId } = req.params;
    const userId = req.user.id;

    // Verify twin ownership
   await verifyTwinOwnership(twinId, userId);

    // Get feedback statistics from EXISTING style_corrections table
    const statsResult = await db.query(`
      SELECT 
        COUNT(*) as total_feedback,
        SUM(CASE WHEN delta > 0 THEN 1 ELSE 0 END) as positive_feedback,
        SUM(CASE WHEN delta < 0 THEN 1 ELSE 0 END) as negative_feedback,
        AVG(delta) as avg_delta
      FROM style_corrections 
      WHERE twin_id = $1 AND source = 'user_feedback'
    `, [twinId]);

    const stats = statsResult.rows[0];

    res.json({
      success: true,
      stats: {
        totalFeedback: parseInt(stats.total_feedback),
        positiveFeedback: parseInt(stats.positive_feedback),
        negativeFeedback: parseInt(stats.negative_feedback),
        averageDelta: parseFloat(stats.avg_delta) || 0
      }
    });

  } catch (error) {
    handleControllerError(error, 'Failed to get feedback statistics');
  }
};

// Additional feedback endpoints for ChatFeedback table
import { updateAILearning } from '../../services/aiLearningService';
import { generateResponseWithTone, adjustResponseTone } from '../../services/chatService';

/**
 * Submit feedback with ChatFeedback table (legacy/comprehensive feedback)
 */
export const submitChatFeedback = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const utcTimestamp = new Date().toISOString();
    const { chatId } = req.params;
    const { responseId, rating, suggestion, tonePreference } = req.body;
    const userId = req.user.id;
    
    // Store feedback in database
    await db.query(`
      INSERT INTO "ChatFeedback" ("chatId", "responseId", "userId", "rating", "suggestion", "tonePreference", "createdAt")
      VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz)
    `, [chatId, responseId, userId, rating, suggestion, tonePreference, utcTimestamp]);
    
    // Update AI learning data
    await updateAILearning(chatId, rating, suggestion, tonePreference);
    
    res.json({ success: true });
  } catch (error) {
    handleControllerError(error, 'Failed to submit chat feedback');
  }
};

/**
 * Regenerate response with tone preference
 */
export const regenerateResponse = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { chatId } = req.params;
    const { responseId, tonePreference } = req.body;
    const userId = req.user.id;
    
    // Generate new response with tone preference
    const newResponse = await generateResponseWithTone(chatId, tonePreference);
    
    res.json({ success: true, newResponse });
  } catch (error) {
    logger.error('Regenerate API error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

/**
 * Get feedback analytics for user
 */
export const getFeedbackAnalytics = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // ✅ ULTRA-DETAILED LOGGING for feedback analytics
    try {
      logger.info('[FEEDBACK_ANALYTICS:START]', {
        path: req.path,
        method: req.method,
        userId: req.user?.id || null,
        headers: {
          ifNoneMatch: req.headers['if-none-match'] || null,
          ifModifiedSince: req.headers['if-modified-since'] || null,
          cacheControl: req.headers['cache-control'] || null,
        },
      });
    } catch (logErr) {
      logger.warn('[FEEDBACK_ANALYTICS] Failed to log START:', logErr);
    }

    const userId = req.user.id;
    
    // Get feedback counts
    const feedbackResult = await db.query(`
      SELECT 
        COUNT(CASE WHEN rating = 'positive' THEN 1 END) as positive_count,
        COUNT(CASE WHEN rating = 'negative' THEN 1 END) as negative_count,
        COUNT(*) as total_feedback
      FROM "ChatFeedback" 
      WHERE "userId" = $1
    `, [userId]);
    
    const feedback = feedbackResult.rows[0];
    const satisfactionScore = feedback.total_feedback > 0 
      ? Math.round((feedback.positive_count / feedback.total_feedback) * 100)
      : 0;
    
    // ✅ Log response before sending
    try {
      logger.info('[FEEDBACK_ANALYTICS:RESPONSE]', {
        userId,
        positiveCount: feedback.positive_count,
        negativeCount: feedback.negative_count,
        totalFeedback: feedback.total_feedback,
        satisfactionScore,
      });
    } catch (logErr) {
      logger.warn('[FEEDBACK_ANALYTICS] Failed to log RESPONSE:', logErr);
    }
    
    // ✅ ADD: Cache headers to prevent 304 responses
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0, private',
      'Pragma': 'no-cache',
      'Expires': '0',
    });
    res.json({
      success: true,
      analytics: {
        positiveFeedback: feedback.positive_count,
        negativeFeedback: feedback.negative_count,
        totalFeedback: feedback.total_feedback,
        satisfactionScore: satisfactionScore
      }
    });
  } catch (error) {
    logger.error('Feedback analytics error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

/**
 * Get feedback status for a specific chat
 */
export const getChatFeedbackStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { chatId } = req.params;
    const userId = req.user.id;
    
    // Get all feedback for this chat
    const feedbackResult = await db.query(`
      SELECT "responseId", "rating", "suggestion", "tonePreference"
      FROM "ChatFeedback"
      WHERE "chatId" = $1 AND "userId" = $2
    `, [chatId, userId]);
    
    // Convert to object with responseId as key
    const feedback: any = {};
    feedbackResult.rows.forEach(row => {
      feedback[row.responseId] = {
        rating: row.rating,
        suggestion: row.suggestion,
        tonePreference: row.tonePreference
      };
    });
    
    res.json({ success: true, feedback });
  } catch (error) {
    logger.error('Feedback status API error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

/**
 * Adjust response tone
 */
export const adjustTone = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { chatId } = req.params;
    const { responseId, tone } = req.body;
    const userId = req.user.id;
    
    // Get chat and twin info
    const chatResult = await db.query(`
      SELECT c."twinId", c."chatVector" FROM "Chat" c
      WHERE c.id = $1 AND c."userId" = $2
    `, [chatId, userId]);
    
    if (chatResult.rows.length === 0) {
      throw createError.notFound('Chat not found', ErrorCodes.CHAT_NOT_FOUND);
    }
    
    // Adjust tone using AI service
    const adjustedResponse = await adjustResponseTone(chatResult.rows[0].twinId, responseId, tone);
    
    res.json({ success: true, adjustedResponse });
  } catch (error) {
    handleControllerError(error, 'Failed to adjust tone');
  }
};