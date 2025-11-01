import { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../../config/database';
import { logger } from '../../config/logger';

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
export const submitResponseFeedback = async (req: Request, res: Response) => {
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
      return res.status(404).json({ error: 'Chat not found or access denied' });
    }

    const twinId = chatResult.rows[0].twinId;

    // Store feedback as style correction using EXISTING table
    const correctionId = `correction_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const delta = rating === 'up' ? 1 : -1;
    
    // Use EXISTING style_corrections table with mapped knob
    await db.query(`
      INSERT INTO style_corrections (id, twin_id, knob, delta, source, ts)
      VALUES ($1, $2, $3, $4, 'user_feedback', NOW())
    `, [correctionId, twinId, knobMapping['user_style'], delta]);

    // Update AI run with rating if available
    await db.query(`
      UPDATE ai_runs 
      SET feedback_score = $1, user_rating = $2 
      WHERE twin_id = $3 
      ORDER BY ts DESC LIMIT 1
    `, [rating === 'up' ? 85 : 25, rating, twinId]);

    // If correction text provided, create style anchor using EXISTING table
    if (correction) {
      const anchorId = `anchor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await db.query(`
        INSERT INTO style_anchors (id, twin_id, user_utterance, ideal_reply, tags, created_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
      `, [anchorId, twinId, 'User feedback', correction, ['user_correction']]);
    }

    res.json({
      success: true,
      message: 'Feedback submitted successfully',
      correctionId
    });

  } catch (error) {
    logger.error('Submit feedback error:', error);
    res.status(500).json({ error: 'Failed to submit feedback' });
  }
};

/**
 * Get feedback statistics - INTEGRATED with existing style_corrections
 */
export const getFeedbackStats = async (req: Request, res: Response) => {
  try {
    const { twinId } = req.params;
    const userId = req.user.id;

    // Verify twin ownership
    const twinResult = await db.query(`
      SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);

    if (twinResult.rows.length === 0) {
      return res.status(404).json({ error: 'Twin not found or access denied' });
    }

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
    logger.error('Get feedback stats error:', error);
    res.status(500).json({ error: 'Failed to get feedback statistics' });
  }
};

// Additional feedback endpoints for ChatFeedback table
import { updateAILearning } from '../../services/aiLearningService';
import { generateResponseWithTone, adjustResponseTone } from '../../services/chatService';

/**
 * Submit feedback with ChatFeedback table (legacy/comprehensive feedback)
 */
export const submitChatFeedback = async (req: Request, res: Response) => {
  try {
    const { chatId } = req.params;
    const { responseId, rating, suggestion, tonePreference } = req.body;
    const userId = req.user.id;
    
    // Store feedback in database
    await db.query(`
      INSERT INTO "ChatFeedback" ("chatId", "responseId", "userId", "rating", "suggestion", "tonePreference", "createdAt")
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
    `, [chatId, responseId, userId, rating, suggestion, tonePreference]);
    
    // Update AI learning data
    await updateAILearning(chatId, rating, suggestion, tonePreference);
    
    res.json({ success: true });
  } catch (error) {
    logger.error('Feedback API error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

/**
 * Regenerate response with tone preference
 */
export const regenerateResponse = async (req: Request, res: Response) => {
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
export const getFeedbackAnalytics = async (req: Request, res: Response) => {
  try {
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
export const getChatFeedbackStatus = async (req: Request, res: Response) => {
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
export const adjustTone = async (req: Request, res: Response) => {
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
      return res.status(404).json({ error: 'Chat not found' });
    }
    
    // Adjust tone using AI service
    const adjustedResponse = await adjustResponseTone(chatResult.rows[0].twinId, responseId, tone);
    
    res.json({ success: true, adjustedResponse });
  } catch (error) {
    logger.error('Tone adjustment error:', error);
    res.status(500).json({ error: 'Failed to adjust tone' });
  }
};