import { Response } from 'express';
import { userQueries, twinQueries } from '../config/database';
import { logger } from '../config/logger';
import { FEATURE_FLAGS } from '../config/featureFlags';
import { createError } from '../utils/errors';
import { tokenizeId } from '../utils/idTokenization';
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



    res.render('discover', {
      title: 'Discover Twins - Selflyx',
      user: user,                 // ✅ Now includes profileImage
      pathname: '/discover',
      hasTwins,
      twinId,
      csrfToken: res.locals['csrfToken']
    });
  } catch (error) {
    logger.error('Discover page error:', error);
    res.render('discover', {
      title: 'Discover Twins - Selflyx',
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
    title: 'Let\'s build your digital self - Enhanced Onboarding',
    user: res.locals.user || null,
    csrfToken: res.locals['csrfToken']
  });
}

/**
 * Memory Management page
 */
export async function getMemoryManagement(req: any, res: Response) {
  if (!FEATURE_FLAGS.memoryUI) {
    throw createError.notFound('This feature is not available yet');
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
  
  // ✅ SECURITY: Tokenize twinId before passing to frontend
  const twinToken = tokenizeId(twin.id, 'twin');


  res.render('memory-management', { 
    title: 'Memory Management - Selflyx',
    user,
    twinToken: twinToken,  // ✅ SECURITY: Use tokenized ID
    csrfToken: res.locals['csrfToken'],
  });
}

