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
    user: req.user,
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
      SELECT t.*, u.id as userId, u.handle as userHandle, u.name as userName
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
    
    // Check if viewer is the owner
    const isOwner = req.user && req.user.id === twin.userId;
    
    // Render public profile page
    res.render('public-profile', {
      title: `@${handle} - AI Twin`,
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
        userHandle: twin.userHandle,
        userName: twin.userName,
        isOwner: isOwner // ADD THIS
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

