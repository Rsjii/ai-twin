import { Response } from 'express';
import { db } from '../config/database';
import { logger } from '../config/logger';
import { AppError, createError } from '../utils/errors';

/**
 * Landing page - Public home page
 */
export function getLanding(req: any, res: Response) {
  // If user is logged in, redirect to dashboard
  if (req.user) {
    return res.redirect('/dashboard');
  }

  res.render('landing', {
    title: 'AI Twin - Create Your Digital Twin',
    user: req.user || null,  // Always pass, even if null
    csrfToken: res.locals['csrfToken']
  });
}

/**
 * Public Profile page - View public twin profile
 */
export async function getPublicProfile(req: any, res: Response) {
  try {
    const { handle } = req.params;
    const userId = req.user?.id || null;
    
    // Build query conditionally to avoid PostgreSQL type inference issue
    let query: string;
    let params: any[];
    
    if (userId) {
      // Logged in user - can see all twins (blockNonLoggedUsers doesn't apply)
      query = `
        SELECT 
          t.id, t."userId", t."publicHandle", t.bio, t."profileImage", t.verified, 
          t."likeCount", t."followCount", t."chatCount", t."sampleReply", t."createdAt",
          t."allowShares", t."requireLogin",
          u.id as "userId", u.handle as "userHandle", u.name as "userName"
        FROM "Twin" t
        JOIN "User" u ON t."userId" = u.id
        WHERE t."publicHandle" = $1 
          AND t."isPublic" = true
      `;
      params = [handle];
    } else {
      // Non-logged user - hide twins where blockNonLoggedUsers = true
      query = `
        SELECT 
          t.id, t."userId", t."publicHandle", t.bio, t."profileImage", t.verified, 
          t."likeCount", t."followCount", t."chatCount", t."sampleReply", t."createdAt",
          t."allowShares", t."requireLogin",
          u.id as "userId", u.handle as "userHandle", u.name as "userName"
        FROM "Twin" t
        JOIN "User" u ON t."userId" = u.id
        WHERE t."publicHandle" = $1 
          AND t."isPublic" = true
          AND (t."blockNonLoggedUsers" = false OR t."blockNonLoggedUsers" IS NULL)
      `;
      params = [handle];
    }
    
    const publicTwin = await db.query(query, params);

    if (publicTwin.rows.length === 0) {
      throw createError.notFound('This twin profile is not public or does not exist');
    }

    const twin = publicTwin.rows[0];

    // ✅ Check if viewer is blocked (only if logged in)
    if (userId) {
      const blockedCheck = await db.query(`
        SELECT id FROM "TwinBlockedUsers"
        WHERE "twinId" = $1 AND "userId" = $2
      `, [twin.id, userId]);
      
      if (blockedCheck.rows.length > 0) {
        throw createError.notFound('This profile is not available');
      }
    }
    
    // Check if viewer is the owner
    const isOwner = userId && userId === twin.userId;
    
    // Ensure userName and userHandle are available
    const creatorName = twin.userName || twin.userHandle || 'Unknown';
    
    // Render public profile page
    res.render('public-profile', {
      title: `@${handle} - AI Twin`,
      user: req.user || null,
      twin: {
        id: twin.id,
        publicHandle: twin.publicHandle,
        bio: twin.bio,
        profileImage: twin.profileImage,
        verified: twin.verified,
        likeCount: twin.likeCount,
        followCount: twin.followCount,
        chatCount: twin.chatCount,
        sampleReply: twin.sampleReply,
        createdAt: twin.createdAt,
        allowShares: twin.allowShares ?? true,
        requireLogin: twin.requireLogin ?? false,
        userHandle: twin.userHandle || 'Unknown',
        userName: twin.userName || twin.userHandle || 'Unknown',
        isOwner: isOwner
      },      
      viewer: req.user ? {
        id: req.user.id,
        handle: req.user.handle
      } : null,
      csrfToken: res.locals['csrfToken']
    });

  } catch (error) {
    logger.error('Public profile error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      handle: req.params.handle,
      path: req.path
    });
    
    if (error instanceof AppError) {
      throw error;
    }
    
    throw createError.internal('Failed to load public profile', error);
  }
}

/**
 * Public Profile alternative route
 */
export function getPublicProfileAlt(req: any, res: Response) {
  res.render('profile_public', {
    title: `Profile - ${req.params.handle}`,
    user: req.user || null,  // Always pass, even if null
    handle: req.params.handle,
    token: req.query['t'],
    csrfToken: res.locals['csrfToken'],
  });
}

/**
 * Simple test page (no middleware)
 */
export function getSimple(req: any, res: Response) {
  res.render('landing', {
    title: 'AI Twin - Create Your Digital Twin',
    user: null,
    csrfToken: 'test-token',
  });
}

/**
 * User Profile page - View user's basic info + their twins
 */
export async function getUserProfile(req: any, res: Response) {
  try {
    const { handle } = req.params;
    const userId = req.user?.id || null;
    
    // Get user basic info
    const userResult = await db.query(`
      SELECT id, handle, name, "profileImage", bio, "createdAt"
      FROM "User"
      WHERE handle = $1
    `, [handle]);
    
    if (userResult.rows.length === 0) {
      throw createError.notFound('This user does not exist');
    }
    
    const user = userResult.rows[0];
    
    // Build query conditionally to avoid PostgreSQL type inference issue
    let twinsQuery: string;
    let twinsParams: any[];
    
    if (userId) {
      // Logged in user - can see all twins
      twinsQuery = `
        SELECT 
          t.id, t."publicHandle", t.bio, t."profileImage", t.verified, 
          t."likeCount", t."followCount", t."chatCount", t."sampleReply", t."createdAt",
          t."allowShares", t."requireLogin"
        FROM "Twin" t
        WHERE t."userId" = $1 
          AND t."isPublic" = true
        ORDER BY t."createdAt" DESC
      `;
      twinsParams = [user.id];
    } else {
      // Non-logged user - hide twins where blockNonLoggedUsers = true
      twinsQuery = `
        SELECT 
          t.id, t."publicHandle", t.bio, t."profileImage", t.verified, 
          t."likeCount", t."followCount", t."chatCount", t."sampleReply", t."createdAt",
          t."allowShares", t."requireLogin"
        FROM "Twin" t
        WHERE t."userId" = $1 
          AND t."isPublic" = true
          AND (t."blockNonLoggedUsers" = false OR t."blockNonLoggedUsers" IS NULL)
        ORDER BY t."createdAt" DESC
      `;
      twinsParams = [user.id];
    }
    
    const twinsResult = await db.query(twinsQuery, twinsParams);
    const twins = twinsResult.rows;
    
    // Check if viewer is the owner
    const isOwner = userId && userId === user.id;
    
    // Render user profile page
    res.render('user-profile', {
      title: `@${handle} - User Profile`,
      user: req.user || null,
      profileUser: {
        id: user.id,
        handle: user.handle,
        name: user.name || user.handle,
        profileImage: user.profileImage,
        bio: user.bio,
        createdAt: user.createdAt,
        isOwner: isOwner
      },
      twins: twins,
      hasTwins: twins.length > 0,
      viewer: req.user ? {
        id: req.user.id,
        handle: req.user.handle
      } : null,
      csrfToken: res.locals['csrfToken']
    });
    
  } catch (error) {
    logger.error('User profile error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      handle: req.params.handle,
      path: req.path
    });
    
    if (error instanceof AppError) {
      throw error;
    }
    
    throw createError.internal('Failed to load user profile', error);
  }
}
