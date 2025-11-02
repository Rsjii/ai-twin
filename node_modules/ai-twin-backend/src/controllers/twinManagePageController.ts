import { Response } from 'express';
import { db, twinQueries } from '../config/database';

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
        console.error('Query error (non-retry):', queryText.substring(0, 50), error?.message);
        return { rows: [{ count: '0' }] };
      }
    };
    
    // Fetch twin analytics - fast queries without retry delays
    const analyticsQueries = [
      // Total chats
      fastQuery(`
        SELECT COUNT(*) as count 
        FROM "PublicChat" 
        WHERE "twinId" = $1
      `, [twinId]),
      
      // Total views
      fastQuery(`
        SELECT COUNT(*) as count 
        FROM "PublicTwinView" 
        WHERE "twinId" = $1
      `, [twinId]),
      
      // Total likes
      fastQuery(`
        SELECT COUNT(*) as count 
        FROM "PublicTwinLike" 
        WHERE "twinId" = $1
      `, [twinId]),
      
      // Total followers
      fastQuery(`
        SELECT COUNT(*) as count 
        FROM "PublicTwinFollow" 
        WHERE "twinId" = $1
      `, [twinId]),
      
      // Memory chunks count
      fastQuery(`
        SELECT COUNT(*) as count 
        FROM "mem_chunks" 
        WHERE twin_id = $1
      `, [twinId]),
      
      // Style corrections count
      fastQuery(`
        SELECT COUNT(*) as count 
        FROM "StyleCorrection" 
        WHERE "twinId" = $1
      `, [twinId]),
      
      // AI runs count
      fastQuery(`
        SELECT COUNT(*) as count 
        FROM "AIRun" 
        WHERE "twinId" = $1
      `, [twinId]),
      
      // Learning goals count
      fastQuery(`
        SELECT COUNT(*) as count 
        FROM "LearningGoal" 
        WHERE "twinId" = $1
      `, [twinId])
    ];

    const [
      chatsResult,
      viewsResult,
      likesResult,
      followersResult,
      memoryResult,
      correctionsResult,
      aiRunsResult,
      goalsResult
    ] = await Promise.all(analyticsQueries);

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
      console.error('Error fetching recent chats:', error);
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
      console.error('Error fetching public twin:', error);
      publicTwin = null;
    }

    // Parse counts safely
    const stats = {
      totalChats: parseInt(chatsResult?.rows?.[0]?.count || '0', 10),
      totalViews: parseInt(viewsResult?.rows?.[0]?.count || '0', 10),
      totalLikes: parseInt(likesResult?.rows?.[0]?.count || '0', 10),
      totalFollowers: parseInt(followersResult?.rows?.[0]?.count || '0', 10),
      memoryChunks: parseInt(memoryResult?.rows?.[0]?.count || '0', 10),
      styleCorrections: parseInt(correctionsResult?.rows?.[0]?.count || '0', 10),
      aiRuns: parseInt(aiRunsResult?.rows?.[0]?.count || '0', 10),
      learningGoals: parseInt(goalsResult?.rows?.[0]?.count || '0', 10)
    };

    res.render('twin-manage', {
      title: 'My Twin - Manage',
      user: req.user,
      twin: twin,
      twinId: twinId,
      stats: stats,
      publicTwin: publicTwin,
      recentChats: recentChats,
      hasTwins: true,
      csrfToken: res.locals['csrfToken']
    });
  } catch (error) {
    console.error('Twin manage page error:', error);
    // Try to render error page, if that fails send JSON
    try {
      res.status(500).render('error', {
        message: 'Failed to load twin management page',
        user: req.user || null
      });
    } catch (renderError) {
      console.error('Error rendering error page:', renderError);
      res.status(500).json({
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}