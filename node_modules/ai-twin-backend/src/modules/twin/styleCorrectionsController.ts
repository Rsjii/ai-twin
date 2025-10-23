import { Response } from 'express';
import { z } from 'zod';
import { db } from '../../config/database';
import { EventLogger } from '../../services/eventLogger';
import { logger } from '../../config/logger';

// Validation schemas
const createCorrectionSchema = z.object({
  knob: z.enum(['shorter', 'casual', 'emoji_off', 'punchline', 'formal', 'humor', 'question_freq']),
  delta: z.number().int().min(-1).max(1),
  source: z.string().optional()
});

const updateCorrectionSchema = z.object({
  knob: z.enum(['shorter', 'casual', 'emoji_off', 'punchline', 'formal', 'humor', 'question_freq']).optional(),
  delta: z.number().int().min(-1).max(1).optional(),
  source: z.string().optional()
});

// Create a new style correction
export const createCorrection = async (req: any, res: Response) => {
  try {
    const { id: twinId } = req.params;
    const { knob, delta, source } = createCorrectionSchema.parse(req.body);
    const userId = req.user.id;

    // Verify twin ownership - FIX THIS LINE
    const twin = await db.query('SELECT * FROM "Twin" WHERE id = $1 AND "userId" = $2', [twinId, userId]);
    if (twin.rows.length === 0) {
      return res.status(404).json({ error: 'Twin not found or access denied' });
    }

    const correctionId = `correction_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    await db.query(
      'INSERT INTO style_corrections (id, twin_id, knob, delta, source) VALUES ($1, $2, $3, $4, $5)',
      [correctionId, twinId, knob, delta, source]
    );

    // Log the correction
    try {
      await EventLogger.logUserEvent(userId, 'style_correction_created', {
        twinId, knob, delta, source
      });
    } catch (logError) {
      logger.warn('Failed to log style correction event:', logError);
    }

    res.status(201).json({
      id: correctionId,
      twinId,
      knob,
      delta,
      source,
      createdAt: new Date()
    });

  } catch (error) {
    logger.error('Error creating style correction:', error);
    res.status(500).json({ error: 'Failed to create style correction' });
  }
};

// Get all corrections for a twin - FIX THIS TOO
export const getCorrections = async (req: any, res: Response) => {
  try {
    const { id: twinId } = req.params;
    const userId = req.user.id;

    // Verify twin ownership - FIX THIS LINE
    const twin = await db.query('SELECT * FROM "Twin" WHERE id = $1 AND "userId" = $2', [twinId, userId]);
    if (twin.rows.length === 0) {
      return res.status(404).json({ error: 'Twin not found or access denied' });
    }

    const corrections = await db.query(
      'SELECT * FROM style_corrections WHERE twin_id = $1 ORDER BY ts DESC',
      [twinId]
    );

    res.json(corrections.rows);

  } catch (error) {
    logger.error('Error fetching style corrections:', error);
    res.status(500).json({ error: 'Failed to fetch style corrections' });
  }
};

// Update a correction - FIX THIS TOO
export const updateCorrection = async (req: any, res: Response) => {
  try {
    const { id: twinId, correctionId } = req.params;
    const updates = updateCorrectionSchema.parse(req.body);
    const userId = req.user.id;

    // Verify twin ownership - FIX THIS LINE
    const twin = await db.query('SELECT * FROM "Twin" WHERE id = $1 AND "userId" = $2', [twinId, userId]);
    if (twin.rows.length === 0) {
      return res.status(404).json({ error: 'Twin not found or access denied' });
    }

    // Build update query dynamically
    const updateFields = [];
    const values = [];
    let paramCount = 1;

    if (updates.knob !== undefined) {
      updateFields.push(`knob = $${paramCount++}`);
      values.push(updates.knob);
    }
    if (updates.delta !== undefined) {
      updateFields.push(`delta = $${paramCount++}`);
      values.push(updates.delta);
    }
    if (updates.source !== undefined) {
      updateFields.push(`source = $${paramCount++}`);
      values.push(updates.source);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(correctionId, twinId);

    const result = await db.query(
      `UPDATE style_corrections SET ${updateFields.join(', ')} WHERE id = $${paramCount++} AND twin_id = $${paramCount++} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Correction not found' });
    }

    res.json(result.rows[0]);

  } catch (error) {
    logger.error('Error updating style correction:', error);
    res.status(500).json({ error: 'Failed to update style correction' });
  }
};

// Delete a correction - FIX THIS TOO
export const deleteCorrection = async (req: any, res: Response) => {
  try {
    const { id: twinId, correctionId } = req.params;
    const userId = req.user.id;

    // Verify twin ownership - FIX THIS LINE
    const twin = await db.query('SELECT * FROM "Twin" WHERE id = $1 AND "userId" = $2', [twinId, userId]);
    if (twin.rows.length === 0) {
      return res.status(404).json({ error: 'Twin not found or access denied' });
    }

    const result = await db.query(
      'DELETE FROM style_corrections WHERE id = $1 AND twin_id = $2 RETURNING *',
      [correctionId, twinId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Correction not found' });
    }

    res.json({ message: 'Correction deleted successfully' });

  } catch (error) {
    logger.error('Error deleting style correction:', error);
    res.status(500).json({ error: 'Failed to delete style correction' });
  }
};

// Get correction statistics - FIX THIS TOO
export const getCorrectionStats = async (req: any, res: Response) => {
  try {
    const { id: twinId } = req.params;
    const userId = req.user.id;

    // Verify twin ownership - FIX THIS LINE
    const twin = await db.query('SELECT * FROM "Twin" WHERE id = $1 AND "userId" = $2', [twinId, userId]);
    if (twin.rows.length === 0) {
      return res.status(404).json({ error: 'Twin not found or access denied' });
    }

    const stats = await db.query(`
      SELECT 
        knob,
        COUNT(*) as count,
        AVG(delta) as avg_delta,
        SUM(CASE WHEN delta > 0 THEN 1 ELSE 0 END) as positive_count,
        SUM(CASE WHEN delta < 0 THEN 1 ELSE 0 END) as negative_count
      FROM style_corrections 
      WHERE twin_id = $1 
      GROUP BY knob
      ORDER BY count DESC
    `, [twinId]);

    res.json(stats.rows);

  } catch (error) {
    logger.error('Error fetching correction stats:', error);
    res.status(500).json({ error: 'Failed to fetch correction stats' });
  }
};

// Apply corrections to style vector
export const applyCorrections = async (req: any, res: Response) => {
  try {
    const { id: twinId } = req.params;
    const userId = req.user.id;

    console.log('🔧 Applying corrections for twin:', twinId, 'user:', userId);

    // Verify twin ownership
    const twin = await db.query('SELECT * FROM "Twin" WHERE id = $1 AND "userId" = $2', [twinId, userId]);
    if (twin.rows.length === 0) {
      console.log('❌ Twin not found or access denied');
      return res.status(404).json({ error: 'Twin not found or access denied' });
    }

    console.log('✅ Twin ownership verified');

    // Get all corrections
    const corrections = await db.query(
      'SELECT knob, AVG(delta) as avg_delta FROM style_corrections WHERE twin_id = $1 GROUP BY knob',
      [twinId]
    );

    console.log('📊 Found corrections:', corrections.rows.length);

    // Get current style vector
    const twinData = await db.query('SELECT "styleVector" FROM "Twin" WHERE id = $1', [twinId]);
    if (twinData.rows.length === 0) {
      console.log('❌ Twin data not found');
      return res.status(404).json({ error: 'Twin not found' });
    }

    let styleVector = twinData.rows[0].styleVector || {};

    // Initialize default style vector if it's empty or null
    if (!styleVector || Object.keys(styleVector).length === 0) {
      console.log('🔧 Initializing default style vector');
      styleVector = {
        response_length_preference: 'detailed',
        formality_level: 0.5,
        emoji_usage: 0.3,
        humor_style: 'light',
        question_frequency: 0.4
      };
    }

    console.log('📝 Current style vector:', styleVector);

    // Apply corrections
    for (const correction of corrections.rows) {
      const { knob, avg_delta } = correction;
      const delta = parseFloat(avg_delta);

      console.log(`🔧 Applying correction: ${knob} = ${delta}`);

      switch (knob) {
        case 'shorter':
          styleVector.response_length_preference = delta > 0 ? 'brief' : 'detailed';
          break;
        case 'casual':
          styleVector.formality_level = Math.max(0, Math.min(1, (styleVector.formality_level || 0.5) - delta * 0.2));
          break;
        case 'emoji_off':
          styleVector.emoji_usage = Math.max(0, Math.min(1, (styleVector.emoji_usage || 0.3) - delta * 0.2));
          break;
        case 'punchline':
          styleVector.humor_style = delta > 0 ? 'witty' : 'light';
          break;
        case 'formal':
          styleVector.formality_level = Math.max(0, Math.min(1, (styleVector.formality_level || 0.5) + delta * 0.2));
          break;
        case 'humor':
          styleVector.humor_style = delta > 0 ? 'heavy' : 'light';
          break;
        case 'question_freq':
          styleVector.question_frequency = Math.max(0, Math.min(1, (styleVector.question_frequency || 0.4) + delta * 0.2));
          break;
      }
    }

    console.log('📝 Updated style vector:', styleVector);

    // Update style vector - FIX: Use JSON.stringify
    await db.query(
      'UPDATE "Twin" SET "styleVector" = $1, "updatedAt" = $2 WHERE id = $3',
      [JSON.stringify(styleVector), new Date(), twinId]
    );

    console.log('✅ Style vector updated successfully');

    res.json({
      message: 'Corrections applied successfully',
      updatedStyleVector: styleVector
    });

  } catch (error) {
    console.error('❌ Error applying corrections:', error);
    logger.error('Error applying corrections:', error);
    res.status(500).json({ error: 'Failed to apply corrections' });
  }
};
