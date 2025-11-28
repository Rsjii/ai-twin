import { Response } from 'express';
import { userQueries, twinQueries } from '../config/database';
import { logger } from '../config/logger';
import { FEATURE_FLAGS } from '../config/featureFlags';
/**
 * Discover page
 */
export async function getDiscover(req: any, res: Response) {
  try {
    // ✅ FIX ISSUE 1: Ensure user has profileImage
    let user = res.locals.user || null;
    
    // If user exists but doesn't have profileImage, fetch it
    if (user && req.user && !user.profileImage) {
      try {
        const fullUser = await userQueries.findByEmail(req.user.email);
        if (fullUser) {
          user = {
            ...user,
            profileImage: fullUser.profileImage || null,
            name: fullUser.name || user.name,
          };
          res.locals.user = user; // Update locals for header
        }
      } catch (error) {
        logger.warn('Failed to fetch user profileImage:', error);
      }
    }
    
    const hasTwins = typeof res.locals.hasTwins !== 'undefined' ? res.locals.hasTwins : false;
    const twinId = res.locals.twinId || null;

    // ✅ Ultra-detailed page log
    try {
      logger.info('[PAGE_DISCOVER]', {
        path: req.path,
        userFromReq: req.user
          ? {
              id: req.user.id,
              email: req.user.email,
              handle: req.user.handle,
            }
          : null,
        userFromLocals: user
          ? {
              id: user.id,
              email: user.email,
              handle: user.handle,
              hasProfileImage: !!user.profileImage,
            }
          : null,
        hasTwins,
        twinId,
      });
    } catch (logError) {
      logger.warn('[PAGE_DISCOVER] Failed to log context:', logError);
    }

    console.log('[PAGE_DISCOVER] Render data:', {
      user: user ? { id: user.id, email: user.email, handle: user.handle, hasProfileImage: !!user.profileImage } : null,
      hasTwins,
      twinId,
      userFromReq: req.user ? { id: req.user.id, email: req.user.email } : null,
      userFromLocals: user ? { id: user.id, email: user.email } : null,
      jwtCookiePresent: !!(req as any).cookies?.['jwtToken'],
      cookies: Object.keys((req as any).cookies || {}),
    });

    res.render('discover', {
      title: 'Discover AI Twins - Twinverse',
      user: user,                 // ✅ Now includes profileImage
      pathname: '/discover',
      hasTwins,
      twinId,
      csrfToken: res.locals['csrfToken']
    });
  } catch (error) {
    logger.error('Discover page error:', error);
    res.render('discover', {
      title: 'Discover AI Twins - Twinverse',
      user: null,
      hasTwins: false,
      twinId: null,
      csrfToken: res.locals['csrfToken']
    });
  }
}

/**
 * Onboarding page
 */
export async function getOnboarding(req: any, res: Response) {
  // Check if user already has a twin - redirect if exists
  if (req.user?.id) {
    const userTwins = await twinQueries.findByUserId(req.user.id);
    if (userTwins.length > 0) {
      // User already has twin, redirect to twin management
      return res.redirect('/twin/manage');
    }
  }
  
  res.render('onboarding', { 
    title: 'Create Your AI Twin - Enhanced Onboarding',
    user: req.user || null,
    csrfToken: res.locals['csrfToken']
  });
}

/**
 * Memory Management page
 */
export async function getMemoryManagement(req: any, res: Response) {
  if (!FEATURE_FLAGS.memoryUI) {
    return res.status(404).render('404', {
      title: 'Page Not Found',
      message: 'This feature is not available yet.'
    });
  }
    
  const user = res.locals.user || null;
  if (!user) {
    return res.redirect('/auth');
  }

  const { twinQueries } = await import('../config/database');
  const userTwins = await twinQueries.findByUserId(user.id);
  const twin = userTwins[0] || null;

  if (!twin) {
    return res.redirect('/twin/create');
  }

  const twinId = twin.id;

  console.log('[PAGE_MEMORY_MANAGEMENT] Render data:', {
    user: { id: user.id, email: user.email, hasProfileImage: !!user.profileImage },
    twinId,
  });

  res.render('memory-management', { 
    title: 'Memory Management - AI Twin',
    user,
    twinId,                            // used by JS for /api/twin/:id/long-term-memory
    csrfToken: res.locals['csrfToken'],
  });
}

