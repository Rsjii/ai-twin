import { Response } from 'express';
import { userQueries, twinQueries } from '../config/database';
import { logger } from '../config/logger';
import { AppError, createError, ErrorCodes } from '../utils/errors';

/**
 * Profile page - User profile settings with tabs
 */
export async function getProfile(req: any, res: Response) {
  try {
    if (!req.user) {
      return res.redirect('/auth');
    }

    const user = await userQueries.findByEmail(req.user.email);
    if (!user) {
      return res.redirect('/auth');
    }

    const userTwins = await twinQueries.findByUserId(user.id);
    const twin = userTwins.length > 0 ? userTwins[0] : null;
    const hasTwins = !!twin;
    const activeTab = req.query.tab || 'profile';

    const userWithDefaults = {
      ...user,
      dob: user.dob || null,
      phone: user?.phone || null,
      bio: user?.bio || null
    };
    
    res.render('profile', {
      title: 'Profile - AI Twin',
      user: userWithDefaults,
      twin: twin,
      twinId: twin?.id || null,
      hasTwins: hasTwins,
      activeTab: activeTab,
      csrfToken: res.locals['csrfToken'],
    });
  } catch (error) {
    logger.error('Profile page error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.id,
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
    
    const appError = createError.internal('Failed to load profile', error);
    return res.status(appError.statusCode).render('error', {
      title: 'Error',
      message: appError.message,
      errorCode: appError.errorCode,
      user: req.user || null
    });
  }
}

/**
 * Change Password page (now redirects to profile settings tab)
 */
export async function getChangePassword(_req: any, res: Response) {
  // Redirect to profile page with settings tab
  return res.redirect('/profile?tab=settings');
}