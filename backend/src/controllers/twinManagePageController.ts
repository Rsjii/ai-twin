import { Response } from 'express';
import { db, twinQueries, userQueries } from '../config/database';
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
    
    // Fetch twin analytics - using CORRECT table names that exist
    const analyticsResult = await fastQuery(`
      SELECT 
        -- Total chats: both PublicChat and private Chat
        (SELECT COUNT(*) FROM "PublicChat" WHERE "twinId" = $1) + 
        (SELECT COUNT(*) FROM "Chat" WHERE "twinId" = $1 AND "userId" = $2) as chats,
        -- Views: not tracked, return 0
        0 as views,
        -- Likes: from TwinLike table (used everywhere in codebase)
        (SELECT COUNT(*) FROM "TwinLike" WHERE "twinId" = $1) as likes,
        -- Follows: from TwinFollow table (used everywhere in codebase)
        (SELECT COUNT(*) FROM "TwinFollow" WHERE "twinId" = $1) as followers,
        -- Memory chunks: from MemoryLongTerm and style_anchors
        (SELECT COUNT(*) FROM "MemoryLongTerm" WHERE "twinId" = $1) + 
        (SELECT COUNT(*) FROM "style_anchors" WHERE twin_id = $1) as memories,        
        -- Style corrections: from style_corrections table (lowercase, snake_case - used in database.ts, performanceService.ts, etc.)
        (SELECT COUNT(*) FROM "style_corrections" WHERE twin_id = $1) as corrections,
        -- AI runs: from ai_runs table (lowercase, snake_case - used in database.ts, performanceService.ts, etc.)
        (SELECT COUNT(*) FROM "ai_runs" WHERE twin_id = $1) as aiRuns,
        -- Learning goals: table doesn't exist, return 0
        0 as goals
    `, [twinId, userId]);

    // Fetch recent activity (last 5 chats) - include both PublicChat and private Chat
    let recentChats: any[] = [];
    try {
      const recentChatsResult = await fastQuery(`
        (
          SELECT 
            pc.id,
            pc.title,
            pc."createdAt",
            COUNT(pm.id) as message_count,
            'public' as chat_type
          FROM "PublicChat" pc
          LEFT JOIN "PublicMessage" pm ON pc.id = pm."chatId"
          WHERE pc."twinId" = $1
          GROUP BY pc.id, pc.title, pc."createdAt"
        )
        UNION ALL
        (
          SELECT 
            c.id,
            NULL as title,
            c."createdAt",
            COUNT(m.id) as message_count,
            'private' as chat_type
          FROM "Chat" c
          LEFT JOIN "Message" m ON c.id = m."chatId"
          WHERE c."twinId" = $1 AND c."userId" = $2
          GROUP BY c.id, c."createdAt"
        )
        ORDER BY "createdAt" DESC
        LIMIT 5
      `, [twinId, userId]);
      recentChats = recentChatsResult.rows || [];
    } catch (error) {
      logger.warn('Error fetching recent chats:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        twinId: twinId
      });
      recentChats = [];
    }

    // Fetch public status - query from Twin table (used everywhere, no separate PublicTwin table)
    let publicTwin = null;
    try {
      const publicTwinResult = await fastQuery(`
        SELECT 
          id,
          "publicHandle" as handle,
          "isPublic" as is_public,
          "createdAt" as created_at
        FROM "Twin" 
        WHERE id = $1 AND "isPublic" = true
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

    // Fetch full user data from database (like getDiscover)
    let user = null;
    if (req.user) {
      const fullUser = await userQueries.findByEmail(req.user.email);
      if (fullUser) {
        user = {
          id: fullUser.id,
          email: fullUser.email,
          handle: fullUser.handle,
          name: fullUser.name,
          profileImage: fullUser.profileImage,
        };
      }
    }

    res.render('twin-manage', {
      title: 'My Twin - Manage',
      user: user,
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
      return res.status(error.statusCode).render('404', {
        title: 'Error',
        message: error.message,
        csrfToken: res.locals['csrfToken'],
        user: req.user || null
      });
    }
    
    const appError = createError.internal('Failed to load twin management page', error);
    return res.status(appError.statusCode).render('404', {
      title: 'Error',
      message: appError.message,
      csrfToken: res.locals['csrfToken'],
      user: req.user || null
    });
  }
}