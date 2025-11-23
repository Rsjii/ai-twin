"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetPerformance = exports.exportAnalytics = exports.analyzePerformance = exports.optimizeMemories = exports.getPerformanceMetrics = exports.setLearningGoal = exports.getMilestones = exports.getTemplates = void 0;
const logger_1 = require("../../config/logger");
const performanceService_1 = require("../../services/performanceService");
const dbUtils_1 = require("../../utils/dbUtils");
const twinUtils_1 = require("../../utils/twinUtils");
const idGenerator_1 = require("../../utils/idGenerator");
const getTemplates = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }
        await (0, twinUtils_1.verifyTwinOwnership)(id, userId);
        const templates = {
            casual: {
                name: 'Casual Conversation',
                description: 'Friendly, relaxed responses',
                examples: [
                    { user: "Hey, how are you?", reply: "Hey! I'm doing great, thanks! 😊 How about you?" },
                    { user: "What's up?", reply: "Not much, just hanging out! What's going on with you?" }
                ]
            },
            professional: {
                name: 'Professional',
                description: 'Formal, business-like responses',
                examples: [
                    { user: "Can you help with this project?", reply: "I'd be happy to assist you with your project. Could you provide more details?" },
                    { user: "What's the status?", reply: "The current status is as follows. Let me provide you with the details." }
                ]
            },
            supportive: {
                name: 'Supportive',
                description: 'Encouraging, empathetic responses',
                examples: [
                    { user: "I'm feeling stressed", reply: "I understand that stress can be overwhelming. You're doing your best, and it's okay to take breaks." },
                    { user: "I'm worried about...", reply: "It's completely natural to feel worried about that. You're not alone in this." }
                ]
            }
        };
        res.json({ success: true, templates });
    }
    catch (error) {
        logger_1.logger.error('Error loading templates:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
};
exports.getTemplates = getTemplates;
const getMilestones = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }
        await (0, twinUtils_1.verifyTwinOwnership)(id, userId);
        const anchorsResult = await (0, dbUtils_1.fastQuery)(`
      SELECT COUNT(*) as count FROM "style_anchors" WHERE twin_id = $1
    `, [id]);
        const memoriesResult = await (0, dbUtils_1.fastQuery)(`
      SELECT 
        (SELECT COUNT(*) FROM "MemoryLongTerm" WHERE "twinId" = $1) +
        (SELECT COUNT(*) FROM "style_anchors" WHERE twin_id = $1) as count
    `, [id]);
        const trainingResult = await (0, dbUtils_1.fastQuery)(`
      SELECT COUNT(*) as count FROM "style_anchors" WHERE twin_id = $1 AND tags @> ARRAY['manual']::text[]
    `, [id]);
        const styleAnchorsCount = parseInt(anchorsResult?.rows?.[0]?.count || '0');
        const memoriesCount = parseInt(memoriesResult?.rows?.[0]?.count || '0');
        const trainingExamplesCount = parseInt(trainingResult?.rows?.[0]?.count || '0');
        const milestones = [
            {
                id: 'style_master',
                name: 'Style Master',
                description: '10+ style anchors',
                icon: '🎯',
                target: 10,
                current: styleAnchorsCount,
                completed: styleAnchorsCount >= 10,
                progress: Math.min(100, (styleAnchorsCount / 10) * 100)
            },
            {
                id: 'memory_builder',
                name: 'Memory Builder',
                description: '50+ memories',
                icon: '🧠',
                target: 50,
                current: memoriesCount,
                completed: memoriesCount >= 50,
                progress: Math.min(100, (memoriesCount / 50) * 100)
            },
            {
                id: 'quick_learner',
                name: 'Quick Learner',
                description: '5+ training examples',
                icon: '⚡',
                target: 5,
                current: trainingExamplesCount,
                completed: trainingExamplesCount >= 5,
                progress: Math.min(100, (trainingExamplesCount / 5) * 100)
            },
            {
                id: 'expert_trainer',
                name: 'Expert Trainer',
                description: '25+ style anchors',
                icon: '🔒',
                target: 25,
                current: styleAnchorsCount,
                completed: styleAnchorsCount >= 25,
                progress: Math.min(100, (styleAnchorsCount / 25) * 100)
            }
        ];
        const goalsResult = await (0, dbUtils_1.fastQuery)(`
      SELECT id, type, target, current, completed, "createdAt"
      FROM "learning_goals"
      WHERE "twinId" = $1
      ORDER BY "createdAt" DESC
    `, [id]);
        const goals = (goalsResult?.rows || []).map((goal) => ({
            id: goal.id,
            type: goal.type,
            target: goal.target,
            current: goal.current,
            completed: goal.completed,
            createdAt: goal.createdAt
        }));
        res.json({ success: true, milestones, goals });
    }
    catch (error) {
        logger_1.logger.error('Error loading milestones:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
};
exports.getMilestones = getMilestones;
const setLearningGoal = async (req, res) => {
    try {
        const { id } = req.params;
        const { type, target } = req.body;
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }
        await (0, twinUtils_1.verifyTwinOwnership)(id, userId);
        const goalId = idGenerator_1.generateId.goal();
        const utcTimestamp = new Date().toISOString();
        const goalResult = await (0, dbUtils_1.fastQuery)(`
      INSERT INTO "learning_goals" (id, "twinId", type, target, current, completed, "createdAt")
      VALUES ($1, $2, $3, $4, 0, false, $5::timestamptz)
      RETURNING *
    `, [goalId, id, type, target, utcTimestamp]);
        if (!goalResult || !goalResult.rows || goalResult.rows.length === 0) {
            return res.status(200).json({
                success: true,
                message: 'Learning goals feature not available yet',
                goal: null
            });
        }
        const goal = goalResult.rows[0];
        res.json({ success: true, goal });
    }
    catch (error) {
        logger_1.logger.error('Error setting goal:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
};
exports.setLearningGoal = setLearningGoal;
const getPerformanceMetrics = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }
        await (0, twinUtils_1.verifyTwinOwnership)(id, userId);
        const aiRunsResult = await (0, dbUtils_1.fastQuery)(`
      SELECT "responseTime", "createdAt"
      FROM "ai_runs"
      WHERE "twin_id" = $1
      ORDER BY "createdAt" DESC
      LIMIT 100
    `, [id]);
        const aiRuns = aiRunsResult?.rows || [];
        const avgResponseTime = aiRuns.length > 0 && aiRuns[0].responseTime
            ? aiRuns.reduce((sum, run) => sum + (parseInt(run.responseTime) || 0), 0) / aiRuns.length
            : 0;
        const correctionsResult = await (0, dbUtils_1.fastQuery)(`
      SELECT delta
      FROM "style_corrections"
      WHERE "twin_id" = $1
      ORDER BY ts DESC
      LIMIT 50
    `, [id]);
        const styleCorrections = correctionsResult?.rows || [];
        const accuracyScore = styleCorrections.length > 0
            ? (styleCorrections.filter((c) => (c.delta || 0) > 0).length / styleCorrections.length) * 100
            : 0;
        const learningRate = await (0, performanceService_1.calculateLearningRate)(id);
        const userSatisfaction = await (0, performanceService_1.calculateUserSatisfaction)(id);
        const metrics = {
            responseTime: Math.round(avgResponseTime),
            accuracyScore: Math.round(accuracyScore),
            learningRate: Math.round(learningRate),
            userSatisfaction: Math.round(userSatisfaction)
        };
        const recommendations = (0, performanceService_1.generateOptimizationRecommendations)(metrics, aiRuns.length, styleCorrections.length);
        res.json({ success: true, metrics, recommendations });
    }
    catch (error) {
        logger_1.logger.error('Error loading performance metrics:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
};
exports.getPerformanceMetrics = getPerformanceMetrics;
const optimizeMemories = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }
        await (0, twinUtils_1.verifyTwinOwnership)(id, userId);
        const [longTermMemories, styleAnchors] = await Promise.all([
            (0, dbUtils_1.fastQuery)(`
    SELECT key as id, value as text, "createdAt"
    FROM "MemoryLongTerm"
    WHERE "twinId" = $1
  `, [id]),
            (0, dbUtils_1.fastQuery)(`
    SELECT id, phrase as text, created_at as "createdAt"
    FROM "style_anchors"
    WHERE twin_id = $1 AND type = 'phrase'
  `, [id])
        ]);
        const memoriesResult = {
            rows: [
                ...(longTermMemories?.rows || []),
                ...(styleAnchors?.rows || [])
            ]
        };
        const memories = memoriesResult?.rows || [];
        const optimized = await (0, performanceService_1.optimizeMemoryChunks)(memories);
        res.json({ success: true, optimized: optimized.length });
    }
    catch (error) {
        logger_1.logger.error('Error optimizing memories:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
};
exports.optimizeMemories = optimizeMemories;
const analyzePerformance = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }
        await (0, twinUtils_1.verifyTwinOwnership)(id, userId);
        const analysis = await (0, performanceService_1.performPerformanceAnalysis)(id);
        res.json({ success: true, analysis });
    }
    catch (error) {
        logger_1.logger.error('Error analyzing performance:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
};
exports.analyzePerformance = analyzePerformance;
const exportAnalytics = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }
        await (0, twinUtils_1.verifyTwinOwnership)(id, userId);
        const analytics = await (0, performanceService_1.gatherAnalyticsData)(id);
        res.json({ success: true, analytics });
    }
    catch (error) {
        logger_1.logger.error('Error exporting analytics:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
};
exports.exportAnalytics = exportAnalytics;
const resetPerformance = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }
        await (0, twinUtils_1.verifyTwinOwnership)(id, userId);
        await (0, dbUtils_1.fastQuery)(`
      DELETE FROM "ai_runs" WHERE "twin_id" = $1
    `, [id]);
        await (0, dbUtils_1.fastQuery)(`
      DELETE FROM "style_corrections" WHERE "twin_id" = $1
    `, [id]);
        res.json({ success: true, message: 'Performance metrics reset successfully' });
    }
    catch (error) {
        logger_1.logger.error('Error resetting performance:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
};
exports.resetPerformance = resetPerformance;
//# sourceMappingURL=twinPerformanceController.js.map