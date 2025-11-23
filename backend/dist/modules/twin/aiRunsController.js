"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getQualityDashboard = exports.getRunStats = exports.updateRun = exports.getRuns = exports.createRun = void 0;
const zod_1 = require("zod");
const database_1 = require("../../config/database");
const eventLogger_1 = require("../../services/eventLogger");
const logger_1 = require("../../config/logger");
const constants_1 = require("../../config/constants");
const twinUtils_1 = require("../../utils/twinUtils");
const idGenerator_1 = require("../../utils/idGenerator");
const createRunSchema = zod_1.z.object({
    mode: zod_1.z.enum(['human', 'ai2ai']),
    tokens_in: zod_1.z.number().int().min(0).optional(),
    tokens_out: zod_1.z.number().int().min(0).optional(),
    critic_score: zod_1.z.number().int().min(1).max(10).optional(),
    regen: zod_1.z.boolean().optional(),
    latency_ms: zod_1.z.number().int().min(0).optional()
});
const updateRunSchema = zod_1.z.object({
    tokens_in: zod_1.z.number().int().min(0).optional(),
    tokens_out: zod_1.z.number().int().min(0).optional(),
    critic_score: zod_1.z.number().int().min(1).max(10).optional(),
    regen: zod_1.z.boolean().optional(),
    latency_ms: zod_1.z.number().int().min(0).optional()
});
const createRun = async (req, res) => {
    try {
        const { id: twinId } = req.params;
        const runData = createRunSchema.parse(req.body);
        const userId = req.user.id;
        await (0, twinUtils_1.verifyTwinOwnership)(twinId, userId);
        const runId = idGenerator_1.generateId.run();
        await database_1.db.query('INSERT INTO ai_runs (id, twin_id, mode, tokens_in, tokens_out, critic_score, regen, latency_ms) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)', [runId, twinId, runData.mode, runData.tokens_in, runData.tokens_out, runData.critic_score, runData.regen, runData.latency_ms]);
        try {
            await eventLogger_1.EventLogger.logUserEvent(userId, 'ai_run_created', {
                twinId, runId, mode: runData.mode
            });
        }
        catch (logError) {
            logger_1.logger.warn('Failed to log AI run event:', logError);
        }
        res.status(201).json({
            id: runId,
            twinId,
            ...runData,
            createdAt: new Date()
        });
        return;
    }
    catch (error) {
        logger_1.logger.error('Error creating AI run:', error);
        res.status(500).json({ error: 'Failed to create AI run' });
        return;
    }
};
exports.createRun = createRun;
const getRuns = async (req, res) => {
    try {
        const { id: twinId } = req.params;
        const { limit = constants_1.QUERY_LIMITS.DEFAULT_PAGE_SIZE, offset = 0, mode } = req.query;
        const userId = req.user.id;
        await (0, twinUtils_1.verifyTwinOwnership)(twinId, userId);
        let query = 'SELECT id, twin_id, mode, tokens_in, tokens_out, critic_score, regen, latency_ms, ts FROM ai_runs WHERE twin_id = $1';
        const params = [twinId];
        let paramCount = 1;
        if (mode) {
            query += ` AND mode = $${++paramCount}`;
            params.push(mode);
        }
        query += ` ORDER BY ts DESC LIMIT $${++paramCount} OFFSET $${++paramCount}`;
        params.push(parseInt(limit), parseInt(offset));
        const runs = await database_1.db.query(query, params);
        res.json(runs.rows);
        return;
    }
    catch (error) {
        logger_1.logger.error('Error fetching AI runs:', error);
        res.status(500).json({ error: 'Failed to fetch AI runs' });
        return;
    }
};
exports.getRuns = getRuns;
const updateRun = async (req, res) => {
    try {
        const { id: twinId, runId } = req.params;
        const updates = updateRunSchema.parse(req.body);
        const userId = req.user.id;
        await (0, twinUtils_1.verifyTwinOwnership)(twinId, userId);
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
        const result = await database_1.db.query(`UPDATE ai_runs SET ${updateFields.join(', ')} WHERE id = $${paramCount++} AND twin_id = $${paramCount++} RETURNING id, twin_id, mode, tokens_in, tokens_out, critic_score, regen, latency_ms, ts`, values);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Run not found' });
        }
        res.json(result.rows[0]);
        return;
    }
    catch (error) {
        logger_1.logger.error('Error updating AI run:', error);
        res.status(500).json({ error: 'Failed to update AI run' });
        return;
    }
};
exports.updateRun = updateRun;
const getRunStats = async (req, res) => {
    try {
        const { id: twinId } = req.params;
        const { days = 30 } = req.query;
        const userId = req.user.id;
        await (0, twinUtils_1.verifyTwinOwnership)(twinId, userId);
        const daysValue = parseInt(days) || 30;
        const stats = await database_1.db.query(`
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
        AND ts >= NOW() - INTERVAL $2
      GROUP BY mode
      ORDER BY mode
    `, [twinId, `${daysValue} days`]);
        const qualityTrends = await database_1.db.query(`
      SELECT 
        DATE(ts) as date,
        AVG(critic_score) as avg_score,
        COUNT(*) as run_count
      FROM ai_runs 
      WHERE twin_id = $1 
        AND ts >= NOW() - INTERVAL $2
        AND critic_score IS NOT NULL
      GROUP BY DATE(ts)
      ORDER BY date DESC
      LIMIT ${constants_1.QUERY_LIMITS.ANALYTICS_TIMELINE}
    `, [twinId, `${daysValue} days`]);
        res.json({
            stats: stats.rows,
            qualityTrends: qualityTrends.rows
        });
        return;
    }
    catch (error) {
        logger_1.logger.error('Error fetching run stats:', error);
        res.status(500).json({ error: 'Failed to fetch run stats' });
        return;
    }
};
exports.getRunStats = getRunStats;
const getQualityDashboard = async (req, res) => {
    try {
        const { id: twinId } = req.params;
        const userId = req.user.id;
        await (0, twinUtils_1.verifyTwinOwnership)(twinId, userId);
        const qualityMetrics = await database_1.db.query(`
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
        const recentTrends = await database_1.db.query(`
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
        const modePerformance = await database_1.db.query(`
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
    }
    catch (error) {
        logger_1.logger.error('Error fetching quality dashboard:', error);
        res.status(500).json({ error: 'Failed to fetch quality dashboard' });
        return;
    }
};
exports.getQualityDashboard = getQualityDashboard;
//# sourceMappingURL=aiRunsController.js.map