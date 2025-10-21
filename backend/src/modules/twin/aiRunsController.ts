import { Response } from 'express';
import { z } from 'zod';
import { db } from '../../config/database';
import { EventLogger } from '../../services/eventLogger';
import { logger } from '../../config/logger';

// Validation schemas
const createRunSchema = z.object({
  mode: z.enum(['human', 'ai2ai']),
  tokens_in: z.number().int().min(0).optional(),
  tokens_out: z.number().int().min(0).optional(),
  critic_score: z.number().int().min(1).max(10).optional(),
  regen: z.boolean().optional(),
  latency_ms: z.number().int().min(0).optional()
});

const updateRunSchema = z.object({
  tokens_in: z.number().int().min(0).optional(),
  tokens_out: z.number().int().min(0).optional(),
  critic_score: z.number().int().min(1).max(10).optional(),
  regen: z.boolean().optional(),
  latency_ms: z.number().int().min(0).optional()
});

// Create a new AI run log
export const createRun = async (req: any, res: Response) => {
  try {
    const { id: twinId } = req.params;
    const runData = createRunSchema.parse(req.body);
    const userId = req.user.id;

    // Verify twin ownership
    const twin = await db.query('SELECT * FROM "Twin" WHERE id = $1 AND userId = $2', [twinId, userId]);
    if (twin.rows.length === 0) {
      return res.status(404).json({ error: 'Twin not found or access denied' });
    }

    const runId = `run_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    await db.query(
      'INSERT INTO ai_runs (id, twin_id, mode, tokens_in, tokens_out, critic_score, regen, latency_ms) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [runId, twinId, runData.mode, runData.tokens_in, runData.tokens_out, runData.critic_score, runData.regen, runData.latency_ms]
    );

    // Log the run
    try {
      await EventLogger.logUserEvent(userId, 'ai_run_created', {
        twinId, runId, mode: runData.mode
      });
    } catch (logError) {
      logger.warn('Failed to log AI run event:', logError);
    }

    res.status(201).json({
      id: runId,
      twinId,
      ...runData,
      createdAt: new Date()
    });
    return;

  } catch (error) {
    logger.error('Error creating AI run:', error);
    res.status(500).json({ error: 'Failed to create AI run' });
    return;
  }
};

// Get all runs for a twin
export const getRuns = async (req: any, res: Response) => {
  try {
    const { id: twinId } = req.params;
    const { limit = 50, offset = 0, mode } = req.query;
    const userId = req.user.id;

    // Verify twin ownership
    const twin = await db.query('SELECT * FROM "Twin" WHERE id = $1 AND userId = $2', [twinId, userId]);
    if (twin.rows.length === 0) {
      return res.status(404).json({ error: 'Twin not found or access denied' });
    }

    let query = 'SELECT * FROM ai_runs WHERE twin_id = $1';
    const params = [twinId];
    let paramCount = 1;

    if (mode) {
      query += ` AND mode = $${++paramCount}`;
      params.push(mode);
    }

    query += ` ORDER BY ts DESC LIMIT $${++paramCount} OFFSET $${++paramCount}`;
    params.push(parseInt(limit), parseInt(offset));

    const runs = await db.query(query, params);

    res.json(runs.rows);
    return;

  } catch (error) {
    logger.error('Error fetching AI runs:', error);
    res.status(500).json({ error: 'Failed to fetch AI runs' });
    return;
  }
};

// Update a run
export const updateRun = async (req: any, res: Response) => {
  try {
    const { id: twinId, runId } = req.params;
    const updates = updateRunSchema.parse(req.body);
    const userId = req.user.id;

    // Verify twin ownership
    const twin = await db.query('SELECT * FROM "Twin" WHERE id = $1 AND userId = $2', [twinId, userId]);
    if (twin.rows.length === 0) {
      return res.status(404).json({ error: 'Twin not found or access denied' });
    }

    // Build update query dynamically
    const updateFields = [];
    const values = [];
    let paramCount = 1;

    if (updates.tokens_in !== undefined) {
      updateFields.push(`tokens_in = $${paramCount++}`);
      values.push(updates.tokens_in);
    }
    if (updates.tokens_out !== undefined) {
      updateFields.push(`tokens_out = $${paramCount++}`);
      values.push(updates.tokens_out);
    }
    if (updates.critic_score !== undefined) {
      updateFields.push(`critic_score = $${paramCount++}`);
      values.push(updates.critic_score);
    }
    if (updates.regen !== undefined) {
      updateFields.push(`regen = $${paramCount++}`);
      values.push(updates.regen);
    }
    if (updates.latency_ms !== undefined) {
      updateFields.push(`latency_ms = $${paramCount++}`);
      values.push(updates.latency_ms);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(runId, twinId);

    const result = await db.query(
      `UPDATE ai_runs SET ${updateFields.join(', ')} WHERE id = $${paramCount++} AND twin_id = $${paramCount++} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Run not found' });
    }

    res.json(result.rows[0]);
    return;

  } catch (error) {
    logger.error('Error updating AI run:', error);
    res.status(500).json({ error: 'Failed to update AI run' });
    return;
  }
};

// Get run statistics
export const getRunStats = async (req: any, res: Response) => {
  try {
    const { id: twinId } = req.params;
    const { days = 30 } = req.query;
    const userId = req.user.id;

    // Verify twin ownership
    const twin = await db.query('SELECT * FROM "Twin" WHERE id = $1 AND userId = $2', [twinId, userId]);
    if (twin.rows.length === 0) {
      return res.status(404).json({ error: 'Twin not found or access denied' });
    }

    const stats = await db.query(`
      SELECT 
        mode,
        COUNT(*) as total_runs,
        AVG(tokens_in) as avg_tokens_in,
        AVG(tokens_out) as avg_tokens_out,
        AVG(critic_score) as avg_critic_score,
        AVG(latency_ms) as avg_latency_ms,
        SUM(CASE WHEN regen = true THEN 1 ELSE 0 END) as regen_count,
        SUM(tokens_in) as total_tokens_in,
        SUM(tokens_out) as total_tokens_out
      FROM ai_runs 
      WHERE twin_id = $1 
        AND ts >= NOW() - INTERVAL '${parseInt(days)} days'
      GROUP BY mode
      ORDER BY mode
    `, [twinId]);

    // Get quality trends
    const qualityTrends = await db.query(`
      SELECT 
        DATE(ts) as date,
        AVG(critic_score) as avg_score,
        COUNT(*) as run_count
      FROM ai_runs 
      WHERE twin_id = $1 
        AND ts >= NOW() - INTERVAL '${parseInt(days)} days'
        AND critic_score IS NOT NULL
      GROUP BY DATE(ts)
      ORDER BY date DESC
      LIMIT 30
    `, [twinId]);

    res.json({
      stats: stats.rows,
      qualityTrends: qualityTrends.rows
    });
    return;

  } catch (error) {
    logger.error('Error fetching run stats:', error);
    res.status(500).json({ error: 'Failed to fetch run stats' });
    return;
  }
};

// Get quality dashboard data
export const getQualityDashboard = async (req: any, res: Response) => {
  try {
    const { id: twinId } = req.params;
    const userId = req.user.id;

    // Verify twin ownership
    const twin = await db.query('SELECT * FROM "Twin" WHERE id = $1 AND userId = $2', [twinId, userId]);
    if (twin.rows.length === 0) {
      return res.status(404).json({ error: 'Twin not found or access denied' });
    }

    // Get overall quality metrics
    const qualityMetrics = await db.query(`
      SELECT 
        AVG(critic_score) as avg_quality,
        COUNT(*) as total_runs,
        SUM(CASE WHEN critic_score >= 8 THEN 1 ELSE 0 END) as high_quality_runs,
        SUM(CASE WHEN critic_score < 5 THEN 1 ELSE 0 END) as low_quality_runs,
        AVG(latency_ms) as avg_latency
      FROM ai_runs 
      WHERE twin_id = $1 
        AND critic_score IS NOT NULL
        AND ts >= NOW() - INTERVAL '30 days'
    `, [twinId]);

    // Get recent quality trends
    const recentTrends = await db.query(`
      SELECT 
        DATE(ts) as date,
        AVG(critic_score) as avg_score,
        COUNT(*) as run_count
      FROM ai_runs 
      WHERE twin_id = $1 
        AND critic_score IS NOT NULL
        AND ts >= NOW() - INTERVAL '7 days'
      GROUP BY DATE(ts)
      ORDER BY date DESC
    `, [twinId]);

    // Get performance by mode
    const modePerformance = await db.query(`
      SELECT 
        mode,
        AVG(critic_score) as avg_score,
        AVG(latency_ms) as avg_latency,
        COUNT(*) as run_count
      FROM ai_runs 
      WHERE twin_id = $1 
        AND critic_score IS NOT NULL
        AND ts >= NOW() - INTERVAL '30 days'
      GROUP BY mode
    `, [twinId]);

    res.json({
      qualityMetrics: qualityMetrics.rows[0],
      recentTrends: recentTrends.rows,
      modePerformance: modePerformance.rows
    });
    return;

  } catch (error) {
    logger.error('Error fetching quality dashboard:', error);
    res.status(500).json({ error: 'Failed to fetch quality dashboard' });
    return;
  }
};
