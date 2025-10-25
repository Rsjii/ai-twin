import { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../../config/database';
import { logger } from '../../config/logger';

const feedbackSchema = z.object({
  rating: z.enum(['up', 'down']),
  messageId: z.string(),
  correction: z.string().optional()
});

/**
 * Submit response feedback
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

    // Store feedback as style correction
    const correctionId = `correction_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const delta = rating === 'up' ? 1 : -1;
    
    await db.query(`
      INSERT INTO style_corrections (id, twin_id, knob, delta, source, ts)
      VALUES ($1, $2, $3, $4, 'user_feedback', NOW())
    `, [correctionId, twinId, 'user_style', delta]);

    // Update AI run with rating if available
    await db.query(`
      UPDATE ai_runs 
      SET feedback_score = $1, user_rating = $2 
      WHERE twin_id = $3 
      ORDER BY ts DESC LIMIT 1
    `, [rating === 'up' ? 85 : 25, rating, twinId]);

    // If correction text provided, create style anchor
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
 * Get feedback statistics for a twin
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

    // Get feedback statistics
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