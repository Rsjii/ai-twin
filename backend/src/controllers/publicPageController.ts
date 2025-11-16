import { Response } from 'express';
import { db } from '../config/database';
import { logger } from '../config/logger';
import { AppError, createError, ErrorCodes } from '../utils/errors';

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
    
    // Get public twin profile
    const publicTwin = await db.query(`
      SELECT 
        t.id, t."userId", t."publicHandle", t.bio, t."profileImage", t.verified, 
        t."likeCount", t."followCount", t."chatCount", t."sampleReply", t."createdAt",
        t."allowShares", t."requireLogin",
        u.id as "userId", u.handle as "userHandle", u.name as "userName"
      FROM "Twin" t
      JOIN "User" u ON t."userId" = u.id
      WHERE t."publicHandle" = $1 AND t."isPublic" = true
    `, [handle]);    

    if (publicTwin.rows.length === 0) {
      return res.status(404).render('404', { 
        title: 'Twin Not Found',
        message: 'This twin profile is not public or does not exist'
      });
    }

    const twin = publicTwin.rows[0];

    // ✅ Check if viewer is blocked (only if logged in)
    if (req.user) {
      const blockedCheck = await db.query(`
        SELECT id FROM "TwinBlockedUsers"
        WHERE "twinId" = $1 AND "userId" = $2
      `, [twin.id, req.user.id]);
      
      if (blockedCheck.rows.length > 0) {
        return res.status(404).render('404', {
          title: 'Profile Not Available',
          message: 'This profile is not available'
        });
      }
    }
    
    // Check if viewer is the owner
    const isOwner = req.user && req.user.id === twin.userId;
    
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
        allowShares: twin.allowShares ?? true, // ✅ PHASE 2: Check if shares are allowed
        requireLogin: twin.requireLogin ?? false, // ✅ PHASE 2: Check if require login
        userHandle: twin.userHandle || 'Unknown',
        userName: twin.userName || twin.userHandle || 'Unknown',
        isOwner: isOwner
      },      
      viewer: req.user ? {
        id: req.user.id,
        handle: req.user.handle
      } : null // ADD THIS
    });

  } catch (error) {
    logger.error('Public profile error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      handle: req.params.handle,
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
    
    const appError = createError.internal('Failed to load public profile', error);
    return res.status(appError.statusCode).render('error', {
      title: 'Error',
      message: appError.message,
      errorCode: appError.errorCode,
      user: req.user || null
    });
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
    
    // Get user basic info
    const userResult = await db.query(`
      SELECT id, handle, name, "profileImage", bio, "createdAt"
      FROM "User"
      WHERE handle = $1
    `, [handle]);
    
    if (userResult.rows.length === 0) {
      return res.status(404).render('404', { 
        title: 'User Not Found',
        message: 'This user does not exist'
      });
    }
    
    const user = userResult.rows[0];
    
    // Get user's public twins
    const twinsResult = await db.query(`
      SELECT 
        t.id, t."publicHandle", t.bio, t."profileImage", t.verified, 
        t."likeCount", t."followCount", t."chatCount", t."sampleReply", t."createdAt",
        t."allowShares", t."requireLogin"
      FROM "Twin" t
      WHERE t."userId" = $1 AND t."isPublic" = true
      ORDER BY t."createdAt" DESC
    `, [user.id]);
    
    const twins = twinsResult.rows;
    
    // Check if viewer is the owner
    const isOwner = req.user && req.user.id === user.id;
    
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
      } : null
    });
    
  } catch (error) {
    logger.error('User profile error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      handle: req.params.handle,
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
    
    const appError = createError.internal('Failed to load user profile', error);
    return res.status(appError.statusCode).render('error', {
      title: 'Error',
      message: appError.message,
      errorCode: appError.errorCode,
      user: req.user || null
    });
  }
}
