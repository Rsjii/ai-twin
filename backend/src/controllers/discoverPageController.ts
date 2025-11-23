import { Response } from 'express';
import { userQueries, twinQueries } from '../config/database';
import { logger } from '../config/logger';
/**
 * Discover page
 */
export async function getDiscover(req: any, res: Response) {
  try {
    // ✅ ADD: Debug logging for production
    if (process.env['NODE_ENV'] === 'production') {
      logger.info('Discover page - req.user:', req.user ? {
        id: req.user.id,
        email: req.user.email,
        hasEmail: !!req.user.email
      } : 'null');
    }
    
    // Check if user is authenticated (optional - discover is public)
    let user = null;
    let hasTwins = false;
    let twinId = null;
    
    if (req.user && req.user.email) { // ✅ ENSURE: Check email exists
      // Fetch full user data from database
      const fullUser = await userQueries.findByEmail(req.user.email);
      if (fullUser) {
        user = {
          id: fullUser.id,
          email: fullUser.email,
          handle: fullUser.handle,
          name: fullUser.name,
          profileImage: fullUser.profileImage,
        };
        
        // Check if user has twins
        const userTwins = await twinQueries.findByUserId(fullUser.id);
        hasTwins = userTwins.length > 0;
        const twin = hasTwins ? userTwins[0] : null;
        twinId = twin && twin.id ? twin.id : null;
      }
    }
    
    // ✅ ADD: Log what's being passed to template
    if (process.env['NODE_ENV'] === 'production') {
      logger.info('Discover page render data:', {
        hasUser: !!user,
        userEmail: user?.email,
        hasTwins: hasTwins
      });
    }
    
    res.render('discover', {
      title: 'Discover AI Twins - Twinverse',
      user: user || null,
      pathname: '/discover',
      hasTwins: hasTwins,
      twinId: twinId || null,
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
  // Fetch full user data from database (like getDiscover)
  let user = null;
  if (req.user) {
    const fullUser = await userQueries.findByEmail(req.user.email);
    if (fullUser) {
      user = {
        id: fullUser.id,
        email: fullUser.email,
        handle: fullUser.handle,
        name: fullUser.name,
        profileImage: fullUser.profileImage,
      };
    }
  }
  
  res.render('memory-management', { 
    title: 'Memory Management - AI Twin',
    user: user,
    twinId: req.query.twinId || 'default',
    csrfToken: res.locals['csrfToken']
  });
}

