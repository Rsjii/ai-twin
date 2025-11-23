import { Response } from 'express';
import { userQueries, twinQueries } from '../config/database';
import { logger } from '../config/logger';
/**
 * Discover page
 */
export async function getDiscover(req: any, res: Response) {
  try {
    // ✅ Use global locals filled by middleware (consistent with header/footer)
    const user = res.locals.user || null;
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
            }
          : null,
        hasTwins,
        twinId,
      });
    } catch (logError) {
      logger.warn('[PAGE_DISCOVER] Failed to log context:', logError);
    }

    console.log('[PAGE_DISCOVER] Render data:', {
      user: user ? { id: user.id, email: user.email, handle: user.handle } : null,
      hasTwins,
      twinId,
      userFromReq: req.user ? { id: req.user.id, email: req.user.email } : null,
      userFromLocals: user ? { id: user.id, email: user.email } : null,
      jwtCookiePresent: !!(req as any).cookies?.['jwtToken'],
      cookies: Object.keys((req as any).cookies || {}),
    });

    res.render('discover', {
      title: 'Discover AI Twins - Twinverse',
      user,                 // ✅ always consistent with header
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
  // ✅ Use global locals filled by middleware (consistent with header/footer)
  const user = res.locals.user || null;
  const twinId = req.query.twinId || res.locals.twinId || 'default';

  console.log('[PAGE_MEMORY_MANAGEMENT] Render data:', {
    user: user ? { id: user.id, email: user.email } : null,
    twinId,
    queryTwinId: req.query.twinId,
    localsTwinId: res.locals.twinId,
  });

  res.render('memory-management', { 
    title: 'Memory Management - AI Twin',
    user,
    twinId,
    csrfToken: res.locals['csrfToken']
  });
}

