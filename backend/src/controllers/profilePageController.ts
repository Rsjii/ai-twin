import { Response } from 'express';
import { userQueries, twinQueries, db } from '../config/database';
import { logger } from '../config/logger';
import { AppError, createError } from '../utils/errors';
import { handleControllerError } from '../utils/errorHandler';

/**
 * Profile page - User profile settings with tabs
 */
export async function getProfile(req: any, res: Response) {
  try {
    if (!req.user) {
      return res.redirect('/auth');
    }

    const user = await userQueries.findByEmail(req.user.email);
    if (!user) {
      return res.redirect('/auth');
    }

    // ✅ Query Twin directly (single twin per user)
    const twinRes = await db.query(
      `SELECT 
         id,
         "userId",
         "styleVector",
         "sampleReply",
         "personaData",
         "systemPrompt",
         "createdAt",
         "isPublic",
         "publicHandle",
         bio,
         "profileImage",
         "likeCount",
         "followCount",
         "chatCount",
         verified,
         "showChatHistory",
         "requireLogin",
         "blockNonLoggedUsers",
         "allowLikes",
         "allowFollows",
         "allowShares"
       FROM "Twin"
       WHERE "userId" = $1
       LIMIT 1`,
      [user.id]
    );

    let twin: any = null;
    let hasTwins = false;

    if (twinRes.rows.length > 0) {
      const row = twinRes.rows[0];
      hasTwins = true;
      twin = {
        ...row,
        // expose counts & flags with defaults
        likeCount: row.likeCount || 0,
        followCount: row.followCount || 0,
        chatCount: row.chatCount || 0,
        verified: row.verified || false
      };
    }

    const activeTab = req.query.tab || 'profile';

    const userWithDefaults = {
      ...user,
      dob: user.dob || null,
      phone: user?.phone || null,
      bio: user?.bio || null,
      // ✅ Critical for UI: password/Google auth flags
      hasPassword: !!user.passwordHash,
      hasGoogle: !!user.googleId,
    };
    
    res.render('profile', {
      title: 'Profile - Selflyx',
      user: userWithDefaults,
      twin: twin,
      twinId: twin?.id || null,
      hasTwins: hasTwins,
      activeTab: activeTab,
      csrfToken: res.locals['csrfToken'],
    });
  } catch (error) {
    logger.error('Profile page error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.id,
      path: req.path
    });
    
    handleControllerError(error, 'Failed to load profile');
  }
}

/**
 * Change Password page (now redirects to profile settings tab)
 */
export async function getChangePassword(_req: any, res: Response) {
  // Redirect to profile page with settings tab
  return res.redirect('/profile?tab=settings');
}