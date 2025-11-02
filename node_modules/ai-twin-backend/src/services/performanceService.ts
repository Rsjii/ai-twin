import { db } from '../config/database';

/**
 * Calculate learning rate based on recent style corrections
 */
export async function calculateLearningRate(twinId: string): Promise<number> {
  try {
    // Fast query helper to avoid retry delays
    const client = await db.getClient();
    try {
      const result = await client.query(`
        SELECT delta
        FROM "style_corrections"
        WHERE "twin_id" = $1
        ORDER BY ts DESC
        LIMIT 20
      `, [twinId]);
      
      if (!result || !result.rows || result.rows.length < 5) return 0;
      
      // Positive delta indicates improvement (learning)
      const recentCorrections = result.rows;
      const positiveRate = recentCorrections.filter((c: any) => (c.delta || 0) > 0).length / recentCorrections.length;
      return positiveRate * 100;
    } finally {
      client.release();
    }
  } catch (error: any) {
    // Missing table/column errors - return 0 immediately
    if (error?.code === '42P01' || error?.code === '42703') {
      return 0;
    }
    return 0;
  }
}

/**
 * Calculate user satisfaction based on feedback
 */
export async function calculateUserSatisfaction(twinId: string): Promise<number> {
  try {
    // Fast query helper - ChatFeedback table has chatId, need to join with Chat to get twinId
    const client = await db.getClient();
    try {
      const result = await client.query(`
        SELECT cf.rating
        FROM "ChatFeedback" cf
        JOIN "Chat" c ON cf."chatId" = c.id
        WHERE c."twinId" = $1
        ORDER BY cf."createdAt" DESC
        LIMIT 50
      `, [twinId]);
      
      if (!result || !result.rows || result.rows.length === 0) return 0;
      
      const feedbacks = result.rows;
      const satisfactionRate = feedbacks.filter((f: any) => {
        const rating = parseInt(f.rating) || 0;
        return rating >= 4;
      }).length / feedbacks.length;
      return satisfactionRate * 100;
    } finally {
      client.release();
    }
  } catch (error: any) {
    // Missing table/column errors - return 0 immediately
    if (error?.code === '42P01' || error?.code === '42703') {
      return 0;
    }
    return 0;
  }
}

/**
 * Generate optimization recommendations based on metrics
 */
export function generateOptimizationRecommendations(
  metrics: any, 
  aiRunsCount: number, 
  correctionsCount: number
): any[] {
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

/**
 * Optimize memory chunks by removing duplicates
 */
export async function optimizeMemoryChunks(memories: any[]): Promise<any[]> {
  // Simple optimization: remove exact duplicates
  const uniqueMemories = memories.filter((memory, index, self) => 
    index === self.findIndex(m => m.text === memory.text)
  );
  
  return uniqueMemories;
}

/**
 * Perform comprehensive performance analysis
 */
export async function performPerformanceAnalysis(twinId: string): Promise<any> {
  try {
    // Perform comprehensive performance analysis using raw SQL
    const aiRunsResult = await db.query(`
      SELECT COUNT(*) as count FROM "ai_runs" WHERE "twin_id" = $1
    `, [twinId]);
    
    const memoriesResult = await db.query(`
      SELECT COUNT(*) as count FROM "mem_chunks" WHERE twin_id = $1
    `, [twinId]);
    
    const anchorsResult = await db.query(`
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
  } catch (error) {
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

/**
 * Gather all analytics data for a twin
 */
export async function gatherAnalyticsData(twinId: string): Promise<any> {
  try {
    // Gather comprehensive analytics data using raw SQL
    const performanceResult = await db.query(`
      SELECT * FROM "ai_runs" WHERE "twin_id" = $1 ORDER BY ts DESC
    `, [twinId]);
    
    const memoriesResult = await db.query(`
      SELECT * FROM "mem_chunks" WHERE twin_id = $1 ORDER BY ts DESC
    `, [twinId]);
    
    const anchorsResult = await db.query(`
      SELECT * FROM "style_anchors" WHERE twin_id = $1 ORDER BY createdAt DESC
    `, [twinId]);
    
    const correctionsResult = await db.query(`
      SELECT * FROM "style_corrections" WHERE "twin_id" = $1 ORDER BY ts DESC
    `, [twinId]);
    
    // ChatFeedback doesn't have twinId directly, need to join with Chat
    const feedbackResult = await db.query(`
      SELECT cf.*
      FROM "ChatFeedback" cf
      JOIN "Chat" c ON cf."chatId" = c.id
      WHERE c."twinId" = $1
      ORDER BY cf."createdAt" DESC
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
  } catch (error) {
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

