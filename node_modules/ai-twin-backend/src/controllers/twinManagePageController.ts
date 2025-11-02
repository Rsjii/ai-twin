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

    // Helper function to safely execute queries
    const safeQuery = async (queryText: string, params: any[]): Promise<{ rows: any[] }> => {
      try {
        const result = await db.query(queryText, params);
        return result || { rows: [] };
      } catch (error) {
        console.error('Query error:', queryText, error);
        return { rows: [] };
      }
    };

    // Fetch twin analytics - with error handling for each query
    const analyticsQueries = [
      // Total chats (from PublicChat if exists, else from Chat)
      safeQuery(`
        SELECT COUNT(*) as count 
        FROM "PublicChat" 
        WHERE "twinId" = $1
      `, [twinId]).catch(() => ({ rows: [{ count: '0' }] })),
      
      // Total views
      safeQuery(`
        SELECT COUNT(*) as count 
        FROM "PublicTwinView" 
        WHERE "twinId" = $1
      `, [twinId]).catch(() => ({ rows: [{ count: '0' }] })),
      
      // Total likes
      safeQuery(`
        SELECT COUNT(*) as count 
        FROM "PublicTwinLike" 
        WHERE "twinId" = $1
      `, [twinId]).catch(() => ({ rows: [{ count: '0' }] })),
      
      // Total followers
      safeQuery(`
        SELECT COUNT(*) as count 
        FROM "PublicTwinFollow" 
        WHERE "twinId" = $1
      `, [twinId]).catch(() => ({ rows: [{ count: '0' }] })),
      
      // Memory chunks count
      safeQuery(`
        SELECT COUNT(*) as count 
        FROM "mem_chunks" 
        WHERE twin_id = $1
      `, [twinId]).catch(() => ({ rows: [{ count: '0' }] })),
      
      // Style corrections count
      safeQuery(`
        SELECT COUNT(*) as count 
        FROM "StyleCorrection" 
        WHERE "twinId" = $1
      `, [twinId]).catch(() => ({ rows: [{ count: '0' }] })),
      
      // AI runs count
      safeQuery(`
        SELECT COUNT(*) as count 
        FROM "AIRun" 
        WHERE "twinId" = $1
      `, [twinId]).catch(() => ({ rows: [{ count: '0' }] })),
      
      // Learning goals count
      safeQuery(`
        SELECT COUNT(*) as count 
        FROM "LearningGoal" 
        WHERE "twinId" = $1
      `, [twinId]).catch(() => ({ rows: [{ count: '0' }] }))
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

    // Fetch recent activity (last 5 chats) - with error handling
    let recentChats: any[] = [];
    try {
      const recentChatsResult = await safeQuery(`
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

    // Fetch public status - with error handling
    let publicTwin = null;
    try {
      const publicTwinResult = await safeQuery(`
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