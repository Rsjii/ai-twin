import { Response } from 'express';
import { userQueries, twinQueries } from '../config/database';
import { logger } from '../config/logger';
/**
 * Discover page
 */
export async function getDiscover(req: any, res: Response) {
  try {
    // Check if user is authenticated (optional - discover is public)
    let user = null;
    let hasTwins = false;
    let twinId = null;
    
    if (req.user) {
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
    
    res.render('discover', {
      title: 'Discover AI Twins - Twinverse',
      user: user || null,
      hasTwins: hasTwins,
      twinId: twinId,
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
export function getOnboarding(req: any, res: Response) {
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

