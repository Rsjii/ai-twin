import { Response } from 'express';
import { db } from '../../config/database';
import { logger } from '../../config/logger';
import {
  calculateLearningRate,
  calculateUserSatisfaction,
  generateOptimizationRecommendations,
  optimizeMemoryChunks,
  performPerformanceAnalysis,
  gatherAnalyticsData
} from '../../services/performanceService';

/**
 * Get training templates
 */

// Fast query helper - avoids retry delays for missing tables/columns
const fastQuery = async (queryText: string, params?: any[]): Promise<{ rows: any[] }> => {
  try {
    const client = await db.getClient();
    try {
      const result = await client.query(queryText, params || []);
      return result || { rows: [] };
    } finally {
      client.release();
    }
  } catch (error: any) {
    // Missing table/column errors - return empty immediately
    if (error?.code === '42P01' || error?.code === '42703') {
      return { rows: [] };
    }
    // Log other errors but return empty to prevent crashes
    logger.error('Fast query error:', error?.message);
    return { rows: [] };
  }
};

export const getTemplates = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    
    // Verify twin ownership using raw SQL
    const twinResult = await db.query(`
      SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2
    `, [id, userId]);
    
    if (!twinResult || twinResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Twin not found' });
    }
    
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
  } catch (error) {
    logger.error('Error loading templates:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

/**
 * Get learning milestones
 */
export const getMilestones = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    
    // Verify twin ownership using raw SQL
    const twinResult = await db.query(`
      SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2
    `, [id, userId]);
    
    if (!twinResult || twinResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Twin not found' });
    }
    
    // Get current counts using fast query (tables may not exist)
    const anchorsResult = await fastQuery(`
      SELECT COUNT(*) as count FROM "style_anchors" WHERE twin_id = $1
    `, [id]);
    
    const memoriesResult = await fastQuery(`
      SELECT COUNT(*) as count FROM "mem_chunks" WHERE twin_id = $1
    `, [id]);
    
    const trainingResult = await fastQuery(`
      SELECT COUNT(*) as count FROM "style_anchors" WHERE twin_id = $1 AND tags @> ARRAY['manual']::text[]
    `, [id]);
    
    const styleAnchorsCount = parseInt(anchorsResult?.rows?.[0]?.count || '0');
    const memoriesCount = parseInt(memoriesResult?.rows?.[0]?.count || '0');
    const trainingExamplesCount = parseInt(trainingResult?.rows?.[0]?.count || '0');
    
    // Define milestones
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
    
    // Get learning goals using fast query (table may not exist)
    const goalsResult = await fastQuery(`
      SELECT id, type, target, current, completed, "createdAt"
      FROM "learning_goals"
      WHERE "twinId" = $1
      ORDER BY "createdAt" DESC
    `, [id]);
    
    const goals = (goalsResult?.rows || []).map((goal: any) => ({
      id: goal.id,
      type: goal.type,
      target: goal.target,
      current: goal.current,
      completed: goal.completed,
      createdAt: goal.createdAt
    }));    
    
    res.json({ success: true, milestones, goals });
  } catch (error) {
    logger.error('Error loading milestones:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

/**
 * Set learning goal
 */
export const setLearningGoal = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { type, target } = req.body;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    
    // Verify twin ownership using raw SQL
    const twinResult = await db.query(`
      SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2
    `, [id, userId]);
    
    if (!twinResult || twinResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Twin not found' });
    }
    
    // Create learning goal using fast query (table may not exist)
    const goalId = `goal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const goalResult = await fastQuery(`
      INSERT INTO "learning_goals" (id, "twinId", type, target, current, completed, "createdAt")
      VALUES ($1, $2, $3, $4, 0, false, NOW())
      RETURNING *
    `, [goalId, id, type, target]);
    
    // Handle case where table doesn't exist
    if (!goalResult || !goalResult.rows || goalResult.rows.length === 0) {
      return res.status(200).json({ 
        success: true, 
        message: 'Learning goals feature not available yet',
        goal: null 
      });
    }
    
    const goal = goalResult.rows[0];
    res.json({ success: true, goal });
  } catch (error) {
    logger.error('Error setting goal:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

/**
 * Get performance metrics
 */
export const getPerformanceMetrics = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    
    // Verify twin ownership using raw SQL
    const twinResult = await db.query(`
      SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2
    `, [id, userId]);
    
    if (!twinResult || twinResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Twin not found' });
    }
    
    // Calculate performance metrics using fast query (column may not exist)
    const aiRunsResult = await fastQuery(`
      SELECT "responseTime", "createdAt"
      FROM "ai_runs"
      WHERE "twin_id" = $1
      ORDER BY "createdAt" DESC
      LIMIT 100
    `, [id]);
    
    // Handle case where responseTime column doesn't exist
    const aiRuns = aiRunsResult?.rows || [];
    const avgResponseTime = aiRuns.length > 0 && aiRuns[0].responseTime
      ? aiRuns.reduce((sum: number, run: any) => sum + (parseInt(run.responseTime) || 0), 0) / aiRuns.length 
      : 0;      
    
    // Get style corrections using fast query (use delta instead of feedback column)
    const correctionsResult = await fastQuery(`
      SELECT delta
      FROM "style_corrections"
      WHERE "twin_id" = $1
      ORDER BY ts DESC
      LIMIT 50
    `, [id]);
    
    // Handle case - calculate accuracy based on positive deltas (improvements)
    const styleCorrections = correctionsResult?.rows || [];
    const accuracyScore = styleCorrections.length > 0
      ? (styleCorrections.filter((c: any) => (c.delta || 0) > 0).length / styleCorrections.length) * 100
      : 0;
          
    const learningRate = await calculateLearningRate(id);
    const userSatisfaction = await calculateUserSatisfaction(id);
    
    const metrics = {
      responseTime: Math.round(avgResponseTime),
      accuracyScore: Math.round(accuracyScore),
      learningRate: Math.round(learningRate),
      userSatisfaction: Math.round(userSatisfaction)
    };
    
    // Generate optimization recommendations
    const recommendations = generateOptimizationRecommendations(metrics, aiRuns.length, styleCorrections.length);
    
    res.json({ success: true, metrics, recommendations });
  } catch (error) {
    logger.error('Error loading performance metrics:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

/**
 * Optimize memories
 */
export const optimizeMemories = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    
    // Verify twin ownership using raw SQL
    const twinResult = await db.query(`
      SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2
    `, [id, userId]);
    
    if (!twinResult || twinResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Twin not found' });
    }
    
    // Get all memories using fast query (table may not exist)
    const memoriesResult = await fastQuery(`
      SELECT id, text, "createdAt"
      FROM "mem_chunks"
      WHERE "twin_id" = $1
    `, [id]);
    
    const memories = memoriesResult?.rows || [];
    
    // Simple optimization: remove duplicates and consolidate similar memories
    const optimized = await optimizeMemoryChunks(memories);
    
    res.json({ success: true, optimized: optimized.length });
  } catch (error) {
    logger.error('Error optimizing memories:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

/**
 * Analyze performance
 */
export const analyzePerformance = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    
    // Verify twin ownership using raw SQL
    const twinResult = await db.query(`
      SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2
    `, [id, userId]);
    
    if (!twinResult || twinResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Twin not found' });
    }
    
    // Perform performance analysis
    const analysis = await performPerformanceAnalysis(id);
    
    res.json({ success: true, analysis });
  } catch (error) {
    logger.error('Error analyzing performance:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

/**
 * Export analytics
 */
export const exportAnalytics = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    
    // Verify twin ownership using raw SQL
    const twinResult = await db.query(`
      SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2
    `, [id, userId]);
    
    if (!twinResult || twinResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Twin not found' });
    }
    
    // Gather all analytics data
    const analytics = await gatherAnalyticsData(id);
    
    res.json({ success: true, analytics });
  } catch (error) {
    logger.error('Error exporting analytics:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

/**
 * Reset performance metrics
 */
export const resetPerformance = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    
    // Verify twin ownership using raw SQL
    const twinResult = await db.query(`
      SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2
    `, [id, userId]);
    
    if (!twinResult || twinResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Twin not found' });
    }
    
    // Reset performance metrics using fast query (tables may not exist)
    await fastQuery(`
      DELETE FROM "ai_runs" WHERE "twin_id" = $1
    `, [id]);
    
    await fastQuery(`
      DELETE FROM "style_corrections" WHERE "twin_id" = $1
    `, [id]);
    
    res.json({ success: true, message: 'Performance metrics reset successfully' });
  } catch (error) {
    logger.error('Error resetting performance:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

