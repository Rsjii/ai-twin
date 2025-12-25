// backend/src/controllers/dashboardPageController.ts

import { Response } from 'express';
import { userQueries, twinQueries } from '../config/database';
import { db } from '../config/database';
import { logger } from '../config/logger';
import { handleControllerError } from '../utils/errorHandler';
import { normalizeTimestamp } from '../utils/timestampUtils';
import { tokenizeId } from '../utils/idTokenization';
import { isProd } from '../config/env';

/**
 * Dashboard page - Main user dashboard
 */
export async function getDashboard(req: any, res: Response) {
  try {
    // Check if user is authenticated via JWT
    if (!req.user) {
      return res.redirect('/auth');
    }

     // Set no-cache headers to prevent browser from caching protected pages
     res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    
    // Fetch full user data from database
    const fullUser = await userQueries.findByEmail(req.user.email);
    if (!fullUser) {
      logger.error('Dashboard: User not found in database', { email: req.user.email });
    
      // Clear JWT + session to break the loop
      res.clearCookie('jwtToken', {
        httpOnly: true,
        secure: isProd,
        sameSite: isProd ? 'lax' : 'strict',
        path: '/',
      });
      if (req.session) {
        req.session.destroy(() => {});
      }
    
      return res.redirect('/auth');
    }
    
    // ✅ Profile exists via User.handle - no TwinProfile needed
    // Check if user has created any twins
    const userTwins = await twinQueries.findByUserId(fullUser.id);
    const hasTwins = userTwins.length > 0;
    
    // Get single twin (first twin) - since only one twin per user allowed
    const twin = hasTwins ? userTwins[0] : null;

    //Phase 3: Tokenize twinId
    const twinPublicId = twin && twin.id ? tokenizeId(twin.id, 'twin') : null;
    
    // Get twinId safely
    const twinId = twin && twin.id ? twin.id : null;
    
    // Fetch user analytics stats
    let stats = {
      totalChats: 0,
      totalViews: 0,
      totalLikes: 0,
      totalFollowers: 0
    };
    
    try {
      // Compute owner publicId for self-view exclusion
      const ownerPublicId = tokenizeId(fullUser.id, 'user');

      const [eventsResult, twinStatsResult] = await Promise.all([
        // Total Views (lifetime impressions): count all profile_viewed events, excluding self-views
        db.query(
          `
          SELECT COUNT(*) as count
          FROM "Event"
          WHERE "userId" = $1
            AND type = 'profile_viewed'
            AND (
              meta->>'viewerId' IS NULL
              OR meta->>'viewerId' != $2
            )
          `,
          [fullUser.id, ownerPublicId]
        ),        
        // Twin stats (if twin exists)
        twin ? db.query(`
          SELECT 
            "likeCount", 
            "followCount", 
            (SELECT COUNT(*) FROM "PublicChat" WHERE "twinId" = $1 AND "userId" <> $2 AND "messageCount" > 0) as "chatCount"
          FROM "Twin"
          WHERE id = $1
        `, [twin.id, fullUser.id]) : Promise.resolve({ rows: [] })        
      ]);
      
      // Default
      stats.totalChats = 0;
      
      if (eventsResult && eventsResult.rows && eventsResult.rows[0]) {
        stats.totalViews = parseInt(eventsResult.rows[0].count || '0', 10);
      }
      
      if (twin && twinStatsResult && twinStatsResult.rows && twinStatsResult.rows.length > 0) {
        const twinData = twinStatsResult.rows[0];
        stats.totalChats = twinData.chatCount || 0;      // ✅ only chats involving your twin
        stats.totalLikes = twinData.likeCount || 0;
        stats.totalFollowers = twinData.followCount || 0;
      }
    } catch (error) {
      logger.warn('Error fetching stats:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: fullUser.id
      });
    }
    
    // Fetch recent activity (last 5 chats)
    let recentActivity: any[] = [];
    try {
      const recentChatsResult = await db.query(`
        SELECT c.id, c.title, c."createdAt", c."updatedAt"
        FROM "Chat" c
        WHERE c."userId" = $1 AND c."messageCount" > 0
        ORDER BY c."updatedAt" DESC
        LIMIT 5
      `, [fullUser.id]);
      
      if (recentChatsResult && recentChatsResult.rows) {
        recentActivity = recentChatsResult.rows.map(chat => ({
          id: chat.id,
          publicId: tokenizeId(chat.id, 'chat'),
          title: chat.title || 'Untitled Chat',
          createdAt: normalizeTimestamp(chat.createdAt),
          updatedAt: normalizeTimestamp(chat.updatedAt)
        }));
      }
    } catch (error) {
      logger.warn('Error fetching recent activity:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: fullUser.id
      });
    }
    
    // Set user data with all fields including profileImage
    const user = {
      id: fullUser.id,
      email: fullUser.email,
      handle: fullUser.handle,
      name: fullUser.name,
      profileImage: fullUser.profileImage,
    };
    
    res.render('dashboard', {
      title: 'Dashboard - AI Twin',
      user: user,
      pathname: '/dashboard',
      hasTwins: hasTwins,
      twin: twin, // Single twin instead of array
      twinId: twinId, // Use safe twinId variable
      twinPublicId: twinPublicId,
      stats: stats, // Analytics stats
      recentActivity: recentActivity, // Recent chats
      csrfToken: res.locals['csrfToken']
    });
  } catch (error) {
    logger.error('Dashboard page error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.id,
      path: req.path
    });
    
    handleControllerError(error, 'Failed to load dashboard');
  }
}