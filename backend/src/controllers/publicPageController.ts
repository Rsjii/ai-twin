import { Response } from 'express';
import { db, userQueries } from '../config/database';
import { logger } from '../config/logger';
import { AppError, createError } from '../utils/errors';
import { handleControllerError } from '../utils/errorHandler';
import { tokenizeId } from '../utils/idTokenization';

/**
 * Landing page - Public home page
 */
export function getLanding(req: any, res: Response) {
  try {
    // If user is logged in, redirect to dashboard
    if (req.user) {
      return res.redirect('/dashboard');
    }

    res.render('landing', {
      title: 'AI Twin - Create Your Digital Twin',
      user: req.user || null,
      csrfToken: res.locals['csrfToken'] || ''  // ✅ FIX: Ensure csrfToken is always a string
    });
  } catch (error) {
    logger.error('Landing page error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      path: req.path
    });
    handleControllerError(error, 'Failed to load landing page');
  }
}

/**
 * Public Profile page - View public twin profile
 */
export async function getPublicProfile(req: any, res: Response) {
  try {
    const { handle } = req.params;
    const viewerId = req.user?.id || null;

    if (!handle || handle.trim() === '') {
      throw createError.notFound('Invalid profile handle');
    }

    // 1) Find user by handle (canonical)
    const userResult = await db.query(
      `SELECT id, handle, name, "profileImage", bio, "createdAt"
       FROM "User"
       WHERE handle = $1`,
      [handle]
    );

    if (userResult.rows.length === 0) {
      throw createError.notFound('This profile does not exist');
    }

    const user = userResult.rows[0];
    const isOwner = viewerId && viewerId === user.id;

    // 2) Find twin (if any) by userId
    const twinResult = await db.query(
      `SELECT 
         id,
         "isPublic",
         bio,
         "profileImage",
         verified,
         "likeCount",
         "followCount",
         "chatCount",
         "sampleReply",
         "createdAt",
         "allowShares",
         "allowLikes",
         "allowFollows",
         "requireLogin",
         "blockNonLoggedUsers",
         "showChatHistory"
       FROM "Twin"
       WHERE "userId" = $1
       LIMIT 1`,
      [user.id]
    );

    const twinRow = twinResult.rows[0] || null;
    const hasTwin = !!twinRow;

    // === Privacy checks ===

    // If no twin → always show basic user profile with hasNoTwin = true
    if (!hasTwin) {
      return res.render('public-profile', {
        title: `@${user.handle} - AI Twin`,
        user: req.user || null,
        twin: null,
        userInfo: {
          handle: user.handle,
          name: user.name || user.handle,
          profileImage: user.profileImage,
          bio: user.bio,
          createdAt: user.createdAt,
          isOwner
        },
        hasNoTwin: true,
        hasTwin: false,
        isPrivate: false,
        twinPublicId: null,
        viewer: req.user ? { id: req.user.id, handle: req.user.handle } : null,
        csrfToken: res.locals['csrfToken']
      });
    }

    // Twin exists
    const twin = twinRow;

    // requireLogin: if not logged in and requireLogin true → 401 page
    if (!viewerId && twin.requireLogin) {
      return res.status(401).render('error', {
        title: 'Login Required',
        message: 'This profile requires you to be logged in to view',
        user: null,
        csrfToken: res.locals['csrfToken'] || ''
      });
    }

    // Blocked user check (uses Twin.id)
    let isBlocked = false;
    if (viewerId) {
      const blockedCheck = await db.query(
        `SELECT id FROM "TwinBlockedUsers"
         WHERE "twinId" = $1 AND "userId" = $2`,
        [twin.id, viewerId]
      );
      isBlocked = blockedCheck.rows.length > 0;
    }

    if (isBlocked) {
      return res.status(404).render('error', {
        title: 'Profile Not Available',
        message: 'This profile is not available',
        user: req.user || null,
        csrfToken: res.locals['csrfToken'] || ''
      });
    }

    // Private twin: if not owner and !isPublic → show basic user only
    const isPublic = !!twin.isPublic;
    const showTwinDetails = isOwner || isPublic;

    // Fetch viewer like/follow if we are showing twin section
    let hasLiked = false;
    let hasFollowed = false;
    if (viewerId && showTwinDetails) {
      const [likeRes, followRes] = await Promise.all([
        db.query(
          'SELECT id FROM "TwinLike" WHERE "twinId" = $1 AND "userId" = $2',
          [twin.id, viewerId]
        ),
        db.query(
          'SELECT id FROM "TwinFollow" WHERE "twinId" = $1 AND "userId" = $2',
          [twin.id, viewerId]
        )
      ]);
      hasLiked = likeRes.rows.length > 0;
      hasFollowed = followRes.rows.length > 0;
    }

    const twinPublicId = tokenizeId(twin.id, 'twin');

    return res.render('public-profile', {
      title: `@${user.handle} - AI Twin`,
      user: req.user || null,
      twin: showTwinDetails
        ? {
            id: twin.id,
            publicId: twinPublicId,
            publicHandle: user.handle, // ✅ single username
            bio: twin.bio,
            profileImage: twin.profileImage,
            verified: twin.verified,
            likeCount: twin.likeCount,
            followCount: twin.followCount,
            chatCount: twin.chatCount,
            sampleReply: twin.sampleReply,
            createdAt: twin.createdAt,
            allowShares: twin.allowShares ?? true,
            allowLikes: twin.allowLikes ?? true,
            allowFollows: twin.allowFollows ?? true,
            requireLogin: twin.requireLogin ?? false,
            userHandle: user.handle,
            userName: user.name || user.handle,
            isOwner,
            isOwnTwin: isOwner,
            likesDisabled: !(twin.allowLikes ?? true),
            followsDisabled: !(twin.allowFollows ?? true),
            sharesDisabled: !(twin.allowShares ?? true),
            hasLiked,
            hasFollowed,
            hasTwin: true
          }
        : null,
      userInfo: {
        handle: user.handle,
        name: user.name || user.handle,
        profileImage: user.profileImage,
        bio: user.bio,
        createdAt: user.createdAt,
        isOwner
      },
      hasNoTwin: false,
      hasTwin: true,
      isPrivate: !isPublic && !isOwner,
      twinPublicId: showTwinDetails ? twinPublicId : null,
      viewer: req.user ? { id: req.user.id, handle: req.user.handle } : null,
      csrfToken: res.locals['csrfToken']
    });
  } catch (error) {
    logger.error('Public profile error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      handle: req.params.handle,
      path: req.path
    });
    
    handleControllerError(error, 'Failed to load public profile');
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
           AND NOT EXISTS (
        SELECT 1 FROM "TwinBlockedUsers" tbu
        WHERE tbu."twinId" = t.id AND tbu."userId" = $2
      )
        ORDER BY t."createdAt" DESC
      `;
      twinsParams = [user.id, userId];
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
    
    handleControllerError(error, 'Failed to load user profile');
  }
}


// Add this new function

/**
 * View My Profile - User can view their own profile
 */
export async function getMyProfile(req: any, res: Response) {
  if (!req.user) {
    return res.redirect('/auth');
  }

  // Canonical self profile is /@user.handle
  const handle = req.user.handle;
  if (!handle) {
    // Safe fallback: fetch from DB
    const user = await userQueries.findById(req.user.id);
    if (!user || !user.handle) {
      return res.redirect('/dashboard');
    }
    return res.redirect(`/@${user.handle}`);
  }

  return res.redirect(`/@${handle}`);
}