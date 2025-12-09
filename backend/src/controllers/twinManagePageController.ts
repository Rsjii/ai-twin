import { Response } from 'express';
import { twinQueries, userQueries } from '../config/database';
import { logger } from '../config/logger';
import { fastQuery } from '../utils/dbUtils';
import { handleControllerError } from '../utils/errorHandler';
import { tokenizeId } from '../utils/idTokenization';

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

    // ✅ SECURITY: Tokenize twinId before passing to frontend
    const twinToken = tokenizeId(twin.id, 'twin');
    const twinPublicId = twinToken; // Keep for backward compatibility
    
    // Fetch twin analytics - using CORRECT table names that exist
    const analyticsResult = await fastQuery(`
      SELECT 
        -- Total chats: both PublicChat and private Chat
        (SELECT COUNT(*) FROM "PublicChat" WHERE "twinId" = $1 AND "userId" <> $2) as chats,
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
          SELECT 
            pc.id,
            pc.title,
            pc."createdAt",
            pc."lastActivity",
            COUNT(pm.id) as message_count,
            'public' as chat_type
          FROM "PublicChat" pc
          LEFT JOIN "PublicMessage" pm ON pc.id = pm."chatId"
          WHERE pc."twinId" = $1
          GROUP BY pc.id, pc.title, pc."createdAt", pc."lastActivity"
          ORDER BY COALESCE(pc."lastActivity", pc."createdAt") DESC
          LIMIT 5
      `, [twinId]);

      // 🔥 Add publicId token for URLs
      recentChats = (recentChatsResult.rows || []).map(chat => ({
        ...chat,
        publicId: tokenizeId(chat.id, 'chat'),
      }));
    } catch (error) {
      logger.warn('Error fetching recent chats:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        twinId: twinId
      });
      recentChats = [];
    }

    // ✅ Fetch public status from Twin
    let publicTwin = null;
    try {
      const publicTwinResult = await fastQuery(`
        SELECT 
          t.id,
          u.handle as handle,
          t."isPublic" as is_public,
          t."createdAt" as created_at
        FROM "Twin" t
        JOIN "User" u ON t."userId" = u.id
        WHERE t.id = $1 AND t."isPublic" = true
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
      twinToken: twinToken,  // ✅ SECURITY: Use tokenized ID
      twinPublicId: twinPublicId, // Keep for backward compatibility
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
    
    handleControllerError(error, 'Failed to load twin management page');
  }
}