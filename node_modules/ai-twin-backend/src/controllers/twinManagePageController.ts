import { Response } from 'express';
import { db, twinQueries } from '../config/database';
import { logger } from '../config/logger';
import { AppError, createError } from '../utils/errors';

/**
 * Twin Management Page - Complete twin dashboard
 */
export async function getTwinManage(req: any, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.redirect('/auth');
    }

    // Fetch user's twin (only one per user)
    const userTwins = await twinQueries.findByUserId(userId);
    const twin = userTwins.length > 0 ? userTwins[0] : null;

    if (!twin) {
      // No twin exists, redirect to onboarding
      return res.redirect('/onboarding');
    }

    const twinId = twin.id;

    // Fast helper function - directly queries pool without retry delays for missing tables
    const fastQuery = async (queryText: string, params: any[]): Promise<{ rows: any[] }> => {
      try {
        // Use pool directly to avoid retry delays
        const client = await db.getClient();
        try {
          const result = await client.query(queryText, params);
          return result || { rows: [] };
        } finally {
          client.release(); // Always release the client
        }
      } catch (error: any) {
        // Check if it's a missing table error (42P01)
        if (error?.code === '42P01') {
          // Table doesn't exist - return empty immediately, no retries
          return { rows: [{ count: '0' }] };
        }
        // For other errors, log and return empty
        logger.warn('Query error (non-retry):', {
          query: queryText.substring(0, 50),
          error: error?.message
        });
        return { rows: [{ count: '0' }] };
      }
    };
    
    // Fetch twin analytics - optimized single query instead of 8 separate queries
    const analyticsResult = await fastQuery(`
      SELECT 
        (SELECT COUNT(*) FROM "PublicChat" WHERE "twinId" = $1) as chats,
        (SELECT COUNT(*) FROM "PublicTwinView" WHERE "twinId" = $1) as views,
        (SELECT COUNT(*) FROM "PublicTwinLike" WHERE "twinId" = $1) as likes,
        (SELECT COUNT(*) FROM "PublicTwinFollow" WHERE "twinId" = $1) as followers,
        (SELECT COUNT(*) FROM "MemoryLongTerm" WHERE "twinId" = $1) + 
        (SELECT COUNT(*) FROM "style_anchors" WHERE twin_id = $1) as memories,        
        (SELECT COUNT(*) FROM "StyleCorrection" WHERE "twinId" = $1) as corrections,
        (SELECT COUNT(*) FROM "AIRun" WHERE "twinId" = $1) as aiRuns,
        (SELECT COUNT(*) FROM "LearningGoal" WHERE "twinId" = $1) as goals
    `, [twinId]);

    // Fetch recent activity (last 5 chats) - fast query
    let recentChats: any[] = [];
    try {
      const recentChatsResult = await fastQuery(`
        SELECT 
          pc.id,
          pc.title,
          pc."createdAt",
          COUNT(pm.id) as message_count
        FROM "PublicChat" pc
        LEFT JOIN "PublicMessage" pm ON pc.id = pm."chatId"
        WHERE pc."twinId" = $1
        GROUP BY pc.id, pc.title, pc."createdAt"
        ORDER BY pc."createdAt" DESC
        LIMIT 5
      `, [twinId]);
      recentChats = recentChatsResult.rows || [];
    } catch (error) {
      logger.warn('Error fetching recent chats:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        twinId: twinId
      });
      recentChats = [];
    }

    // Fetch public status - fast query
    let publicTwin = null;
    try {
      const publicTwinResult = await fastQuery(`
        SELECT 
          id,
          handle,
          is_public,
          created_at
        FROM "PublicTwin" 
        WHERE twin_id = $1
      `, [twinId]);
      publicTwin = publicTwinResult.rows.length > 0 ? publicTwinResult.rows[0] : null;
    } catch (error) {
      logger.warn('Error fetching public twin:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        twinId: twinId
      });
      publicTwin = null;
    }

    // Parse counts safely from optimized single query result
    const row = analyticsResult?.rows?.[0] || {};
    const stats = {
      totalChats: parseInt(row.chats || '0', 10),
      totalViews: parseInt(row.views || '0', 10),
      totalLikes: parseInt(row.likes || '0', 10),
      totalFollowers: parseInt(row.followers || '0', 10),
      memoryChunks: parseInt(row.memories || '0', 10),
      styleCorrections: parseInt(row.corrections || '0', 10),
      aiRuns: parseInt(row.aiRuns || '0', 10),
      learningGoals: parseInt(row.goals || '0', 10)
    };

    res.render('twin-manage', {
      title: 'My Twin - Manage',
      user: req.user || null,
      twin: twin,
      twinId: twinId,
      stats: stats,
      publicTwin: publicTwin,
      recentChats: recentChats,
      hasTwins: true,
      csrfToken: res.locals['csrfToken']
    });
  } catch (error) {
    logger.error('Twin manage page error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.id,
      path: req.path
    });
    
    if (error instanceof AppError) {
      return res.status(error.statusCode).render('error', {
        title: 'Error',
        message: error.message,
        errorCode: error.errorCode,
        user: req.user || null
      });
    }
    
    const appError = createError.internal('Failed to load twin management page', error);
    return res.status(appError.statusCode).render('error', {
      title: 'Error',
      message: appError.message,
      errorCode: appError.errorCode,
      user: req.user || null
    });
  }
}