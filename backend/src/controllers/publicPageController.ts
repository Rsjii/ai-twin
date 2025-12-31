import { Response } from 'express';
import { db, userQueries } from '../config/database';
import { logger } from '../config/logger';
import { AppError, createError, ErrorCodes } from '../utils/errors';
import { handleControllerError } from '../utils/errorHandler';
import { tokenizeId } from '../utils/idTokenization';

/**
 * Landing page - Public home page (MVP version)
 */
export async function getLanding(req: any, res: Response) {
  try {
    // If user is logged in, redirect to dashboard
    if (req.user) {
      return res.redirect('/dashboard');
    }

    // ✅ Fetch 3-4 public twins for social proof
    let publicTwins = [];
    try {
      const twinsResult = await db.query(`
        SELECT 
          t.id,
          t."publicHandle",
          t.bio,
          t."profileImage",
          t."sampleReply",
          u.handle as "userHandle",
          u.name as "userName",
          t."likeCount",
          t."chatCount"
        FROM "Twin" t
        JOIN "User" u ON t."userId" = u.id
        WHERE t."isPublic" = true
          AND (t."blockNonLoggedUsers" = false OR t."blockNonLoggedUsers" IS NULL)
        ORDER BY t."chatCount" DESC, t."likeCount" DESC, t."createdAt" DESC
        LIMIT 4
      `);
      publicTwins = twinsResult.rows || [];
    } catch (dbError) {
      // If query fails, continue without twins (graceful degradation)
      logger.warn('Failed to fetch public twins for landing page:', dbError);
    }

    res.render('landing_mvp', {
      title: 'TwinOS - Create Your Digital Twin',
      user: req.user || null,
      csrfToken: res.locals['csrfToken'] || '',
      publicTwins: publicTwins || [] // ✅ Pass public twins to view
    }, (err: any, html: any) => {
      if (err) {
        logger.error('Template render error:', {
          error: err.message,
          stack: err.stack,
          name: err.name
        });
        return handleControllerError(err, 'Failed to render landing page');
      }
      // If no error and html is provided, send it (callback mode)
      if (html && !res.headersSent) {
        res.send(html);
      }
    });
  } catch (error) {
    logger.error('Landing page error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      errorName: error instanceof Error ? error.name : 'Unknown',
      stack: error instanceof Error ? error.stack : undefined,
      path: req.path,
      fullError: String(error)
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
         t.id,
         t."isPublic",
         t.bio,
         t."profileImage",
         t.verified,
         t."likeCount",
         t."followCount",
         (SELECT COUNT(*) 
          FROM "PublicMessage" pm
          JOIN "PublicChat" pc ON pm."chatId" = pc.id
          WHERE pc."twinId" = t.id
            AND pm.sender = 'human'
            AND (pc."userId" IS NULL OR pc."userId" <> t."userId")
         ) as "chatCount",
         t."sampleReply",
         t."createdAt",
         t."allowShares",
         t."allowLikes",
         t."allowFollows",
         t."requireLogin",
         t."blockNonLoggedUsers",
         t."showChatHistory"
       FROM "Twin" t
       WHERE t."userId" = $1
       LIMIT 1`,
      [user.id]
    );

    const twinRow = twinResult.rows[0] || null;
    const hasTwin = !!twinRow;

    // === Privacy checks ===

    // If no twin → always show basic user profile with hasNoTwin = true
    if (!hasTwin) {
      return res.render('public-profile', {
        title: `@${user.handle} - TwinOS`,
        user: req.user || null,
        twin: null,
        userInfo: {
          handle: user.handle,
          name: user.name || user.handle,
          profileImage: user.profileImage,
          bio: null, // ✅ Twin-centric: User bio not used
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

// ✅ NOTE:
// - requireLogin should ONLY affect chat, not profile visibility.
// - Logged‑out users can still view this profile; they just cannot chat
//   (public chat page + /api/public-chat/start enforce login for chatting).

// ✅ NEW: If twin blocks non-logged viewers, hide profile completely for guests
if (!viewerId && twin.blockNonLoggedUsers) {
  throw createError.notFound('This profile does not exist', ErrorCodes.NOT_FOUND);
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
      throw createError.notFound('This profile does not exist', ErrorCodes.NOT_FOUND);
    }

    // Private twin: if not owner and !isPublic → show basic user only (same as no twin)
    // ✅ FIX: Don't reveal that user made it public/private - show as if no twin exists
    const isPublic = !!twin.isPublic;
    const showTwinDetails = isOwner || isPublic;

    // If twin is private and viewer is not owner, show as if no twin exists
    if (!isPublic && !isOwner) {
      return res.render('public-profile', {
        title: `@${user.handle} - TwinOS`,
        user: req.user || null,
        twin: null,
        userInfo: {
          handle: user.handle,
          name: user.name || user.handle,
          profileImage: user.profileImage,
          bio: user.bio,
          createdAt: user.createdAt,
          isOwner: false // ✅ Don't reveal ownership to non-owners
        },
        hasNoTwin: true, // ✅ Show as if no twin exists
        hasTwin: false,
        isPrivate: false, // ✅ Don't reveal privacy status
        twinPublicId: null,
        viewer: req.user ? { id: req.user.id, handle: req.user.handle } : null,
        csrfToken: res.locals['csrfToken']
      });
    }

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

    // ✅ Log profile view event (only for public twins, not for owner viewing own profile)
    if (showTwinDetails && !isOwner && user.id) {
      try {
        const { EventLogger } = await import('../services/eventLogger');
        const { EVENT_TYPES } = await import('../config/constants');
        await EventLogger.log(user.id, EVENT_TYPES.PROFILE_VIEWED, {
          publicTwinId: twinPublicId,
          source: 'public_profile',
          viewerId: viewerId ? tokenizeId(viewerId, 'user') : null
        });
      } catch (eventError) {
        // Don't fail the request if event logging fails
        logger.warn('[getPublicProfile] Failed to log profile view:', eventError);
      }
    }

    return res.render('public-profile', {
      title: `@${user.handle} - TwinOS`,
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
        bio: null, // ✅ Twin-centric: User bio not used
        createdAt: user.createdAt,
        isOwner
      },
      hasNoTwin: false,
      hasTwin: true,
      isPrivate: false, // ✅ Only show public twins here
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
    title: 'TwinOS - Create Your Digital Twin',
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
        bio: null, // ✅ Twin-centric: User bio not used (use twin.bio instead)
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