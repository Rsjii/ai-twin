"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateLearningRate = calculateLearningRate;
exports.calculateUserSatisfaction = calculateUserSatisfaction;
exports.generateOptimizationRecommendations = generateOptimizationRecommendations;
exports.optimizeMemoryChunks = optimizeMemoryChunks;
exports.performPerformanceAnalysis = performPerformanceAnalysis;
exports.gatherAnalyticsData = gatherAnalyticsData;
const constants_1 = require("../config/constants");
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
        LIMIT ${constants_1.QUERY_LIMITS.RECENT_ACTIVITY}
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
        LIMIT ${constants_1.QUERY_LIMITS.CHAT_MESSAGES}
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
      SELECT 
        (SELECT COUNT(*) FROM "MemoryLongTerm" WHERE "twinId" = $1) +
        (SELECT COUNT(*) FROM "style_anchors" WHERE twin_id = $1) as count
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
       SELECT id, twin_id, mode, tokens_in, tokens_out, critic_score, regen, latency_ms, ts FROM "ai_runs" WHERE "twin_id" = $1 ORDER BY ts DESC LIMIT ${constants_1.QUERY_DEFAULTS.PERFORMANCE_SAMPLES}      
    `, [twinId]);
        const [longTermMemories, styleAnchors] = await Promise.all([
            database_1.db.query(`
    SELECT key as id, value as text, category, "createdAt" as ts
    FROM "MemoryLongTerm"
    WHERE "twinId" = $1
    ORDER BY "updatedAt" DESC
    LIMIT ${constants_1.QUERY_LIMITS_EXTENDED.MEMORY_CHUNKS_LARGE}
  `, [twinId]),
            database_1.db.query(`
    SELECT id, phrase as text, 'voice' as category, created_at as ts
    FROM "style_anchors"
    WHERE twin_id = $1 AND type = 'phrase'
    ORDER BY created_at DESC
    LIMIT ${constants_1.QUERY_LIMITS_EXTENDED.MEMORY_CHUNKS_LARGE}
  `, [twinId])
        ]);
        const memoriesResult = {
            rows: [
                ...longTermMemories.rows,
                ...styleAnchors.rows
            ].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime()).slice(0, 1000)
        };
        const anchorsResult = await database_1.db.query(`
   SELECT id, twin_id, user_utterance, ideal_reply, type, created_at FROM "style_anchors" WHERE twin_id = $1 ORDER BY created_at DESC LIMIT ${constants_1.QUERY_DEFAULTS.PERFORMANCE_SAMPLES}  
`, [twinId]);
        const correctionsResult = await database_1.db.query(`
      SELECT id, twin_id, knob, delta, source, ts FROM "style_corrections" WHERE "twin_id" = $1 ORDER BY ts DESC LIMIT ${constants_1.QUERY_LIMITS_EXTENDED.CORRECTIONS_LIMIT}
    `, [twinId]);
        const feedbackResult = await database_1.db.query(`
      SELECT cf.id, cf."chatId", cf."responseId", cf."userId", cf.rating, cf.suggestion, cf."tonePreference", cf."createdAt"
      FROM "ChatFeedback" cf
      JOIN "Chat" c ON cf."chatId" = c.id
      WHERE c."twinId" = $1
      ORDER BY cf."createdAt" DESC
      LIMIT ${constants_1.QUERY_LIMITS_EXTENDED.FEEDBACK_LIMIT}
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