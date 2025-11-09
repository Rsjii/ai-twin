"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateLearningRate = calculateLearningRate;
exports.calculateUserSatisfaction = calculateUserSatisfaction;
exports.generateOptimizationRecommendations = generateOptimizationRecommendations;
exports.optimizeMemoryChunks = optimizeMemoryChunks;
exports.performPerformanceAnalysis = performPerformanceAnalysis;
exports.gatherAnalyticsData = gatherAnalyticsData;
const database_1 = require("../config/database");
async function calculateLearningRate(twinId) {
    try {
        const client = await database_1.db.getClient();
        try {
            const result = await client.query(`
        SELECT delta
        FROM "style_corrections"
        WHERE "twin_id" = $1
        ORDER BY ts DESC
        LIMIT 20
      `, [twinId]);
            if (!result || !result.rows || result.rows.length < 5)
                return 0;
            const recentCorrections = result.rows;
            const positiveRate = recentCorrections.filter((c) => (c.delta || 0) > 0).length / recentCorrections.length;
            return positiveRate * 100;
        }
        finally {
            client.release();
        }
    }
    catch (error) {
        if (error?.code === '42P01' || error?.code === '42703') {
            return 0;
        }
        return 0;
    }
}
async function calculateUserSatisfaction(twinId) {
    try {
        const client = await database_1.db.getClient();
        try {
            const result = await client.query(`
        SELECT cf.rating
        FROM "ChatFeedback" cf
        JOIN "Chat" c ON cf."chatId" = c.id
        WHERE c."twinId" = $1
        ORDER BY cf."createdAt" DESC
        LIMIT 50
      `, [twinId]);
            if (!result || !result.rows || result.rows.length === 0)
                return 0;
            const feedbacks = result.rows;
            const satisfactionRate = feedbacks.filter((f) => {
                const rating = parseInt(f.rating) || 0;
                return rating >= 4;
            }).length / feedbacks.length;
            return satisfactionRate * 100;
        }
        finally {
            client.release();
        }
    }
    catch (error) {
        if (error?.code === '42P01' || error?.code === '42703') {
            return 0;
        }
        return 0;
    }
}
function generateOptimizationRecommendations(metrics, aiRunsCount, correctionsCount) {
    const recommendations = [];
    if (metrics.responseTime > 2000) {
        recommendations.push({
            type: 'warning',
            icon: '⚠️',
            title: 'Response Time Optimization',
            description: 'Consider optimizing memory chunks to improve response speed'
        });
    }
    if (metrics.accuracyScore < 70) {
        recommendations.push({
            type: 'tip',
            icon: '💡',
            title: 'Style Enhancement',
            description: 'Add more style anchors for better consistency'
        });
    }
    if (aiRunsCount < 10) {
        recommendations.push({
            type: 'tip',
            icon: '📈',
            title: 'More Training Data',
            description: 'Increase interactions to improve learning accuracy'
        });
    }
    if (correctionsCount < 5) {
        recommendations.push({
            type: 'tip',
            icon: '🎯',
            title: 'Add Style Corrections',
            description: 'Provide feedback on responses to help your twin learn faster'
        });
    }
    return recommendations;
}
async function optimizeMemoryChunks(memories) {
    const uniqueMemories = memories.filter((memory, index, self) => index === self.findIndex(m => m.text === memory.text));
    return uniqueMemories;
}
async function performPerformanceAnalysis(twinId) {
    try {
        const aiRunsResult = await database_1.db.query(`
      SELECT COUNT(*) as count FROM "ai_runs" WHERE "twin_id" = $1
    `, [twinId]);
        const memoriesResult = await database_1.db.query(`
      SELECT COUNT(*) as count FROM "mem_chunks" WHERE twin_id = $1
    `, [twinId]);
        const anchorsResult = await database_1.db.query(`
      SELECT COUNT(*) as count FROM "style_anchors" WHERE twin_id = $1
    `, [twinId]);
        const analysis = {
            totalInteractions: parseInt(aiRunsResult?.rows[0]?.count || '0'),
            totalMemories: parseInt(memoriesResult?.rows[0]?.count || '0'),
            totalStyleAnchors: parseInt(anchorsResult?.rows[0]?.count || '0'),
            averageResponseTime: 0,
            accuracyTrend: 'stable',
            recommendations: []
        };
        return analysis;
    }
    catch (error) {
        return {
            totalInteractions: 0,
            totalMemories: 0,
            totalStyleAnchors: 0,
            averageResponseTime: 0,
            accuracyTrend: 'stable',
            recommendations: []
        };
    }
}
async function gatherAnalyticsData(twinId) {
    try {
        const performanceResult = await database_1.db.query(`
      SELECT * FROM "ai_runs" WHERE "twin_id" = $1 ORDER BY ts DESC LIMIT 1000
    `, [twinId]);
        const memoriesResult = await database_1.db.query(`
      SELECT * FROM "mem_chunks" WHERE twin_id = $1 ORDER BY ts DESC LIMIT 1000
    `, [twinId]);
        const anchorsResult = await database_1.db.query(`
      SELECT * FROM "style_anchors" WHERE twin_id = $1 ORDER BY createdAt DESC LIMIT 1000
    `, [twinId]);
        const correctionsResult = await database_1.db.query(`
      SELECT * FROM "style_corrections" WHERE "twin_id" = $1 ORDER BY ts DESC LIMIT 1000
    `, [twinId]);
        const feedbackResult = await database_1.db.query(`
      SELECT cf.*
      FROM "ChatFeedback" cf
      JOIN "Chat" c ON cf."chatId" = c.id
      WHERE c."twinId" = $1
      ORDER BY cf."createdAt" DESC
      LIMIT 1000
    `, [twinId]);
        const analytics = {
            twinId,
            generatedAt: new Date().toISOString(),
            performance: performanceResult?.rows || [],
            memories: memoriesResult?.rows || [],
            styleAnchors: anchorsResult?.rows || [],
            corrections: correctionsResult?.rows || [],
            feedback: feedbackResult?.rows || []
        };
        return analytics;
    }
    catch (error) {
        return {
            twinId,
            generatedAt: new Date().toISOString(),
            performance: [],
            memories: [],
            styleAnchors: [],
            corrections: [],
            feedback: []
        };
    }
}
//# sourceMappingURL=performanceService.js.map