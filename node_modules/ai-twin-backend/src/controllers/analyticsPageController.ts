import { Response } from 'express';
import { userQueries } from '../config/database';
import { logger } from '../config/logger';
import { AppError, createError, ErrorCodes } from '../utils/errors';

/**
 * Analytics dashboard page - User analytics
 */
export async function getAnalytics(req: any, res: Response) {
  try {
    if (!req.user) {
      return res.redirect('/auth');
    }
    
    const fullUser = await userQueries.findByEmail(req.user.email);
    if (!fullUser) {
      return res.redirect('/auth');
    }
    
    const user = {
      id: fullUser.id,
      email: fullUser.email,
      handle: fullUser.handle,
      name: fullUser.name,
      profileImage: fullUser.profileImage,
    };
    
    res.render('analytics', {
      title: 'Analytics Dashboard - AI Twin',
      user: user,
      csrfToken: res.locals['csrfToken']
    });
  } catch (error) {
    logger.error('Analytics page error:', {
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
    
    const appError = createError.internal('Failed to load analytics', error);
    return res.status(appError.statusCode).render('error', {
      title: 'Error',
      message: appError.message,
      errorCode: appError.errorCode,
      user: req.user || null
    });
  }
}

/**
 * Admin Analytics dashboard page
 */
export async function getAdminAnalytics(req: any, res: Response) {
  try {
    const adminEmails = ['admin@aitwin.com', 'i@gmail.com'];
    if (!req.user || !req.user.email || !adminEmails.includes(req.user.email)) {
      return res.status(403).render('403', { 
        title: 'Access Denied',
        message: 'Admin access required'
      });
    }

    const fullUser = await userQueries.findByEmail(req.user.email);
    if (!fullUser) {
      return res.redirect('/auth');
    }

    res.render('admin-analytics', {
      title: 'Admin Analytics Dashboard - AI Twin',
      user: {
        id: fullUser.id,
        email: fullUser.email,
        handle: fullUser.handle,
        name: fullUser.name,
        profileImage: fullUser.profileImage
      },
      csrfToken: res.locals['csrfToken']
    });
  } catch (error) {
    logger.error('Admin analytics page error:', {
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
    
    const appError = createError.internal('Failed to load admin analytics', error);
    return res.status(appError.statusCode).render('error', {
      title: 'Error',
      message: appError.message,
      errorCode: appError.errorCode,
      user: req.user || null
    });
  }
}

/**
 * Admin Analytics detailed page
 */
export async function getAdminAnalyticsPage(req: any, res: Response) {
  try {
    const adminEmails = ['admin@aitwin.com', 'i@gmail.com'];
    if (!req.user || !req.user.email || !adminEmails.includes(req.user.email)) {
      return res.status(403).render('403', { 
        title: 'Access Denied',
        message: 'Admin access required'
      });
    }

    const { type } = req.params;
    const validTypes = ['users', 'twins', 'chats', 'messages'];
    
    if (!validTypes.includes(type)) {
      return res.status(404).render('404', {
        title: 'Page Not Found',
        message: 'Invalid page type'
      });
    }

    const fullUser = await userQueries.findByEmail(req.user.email);
    if (!fullUser) {
      return res.redirect('/auth');
    }

    res.render(`admin-analytics-${type}`, {
      title: `Admin Analytics - ${type.charAt(0).toUpperCase() + type.slice(1)} - AI Twin`,
      user: {
        id: fullUser.id,
        email: fullUser.email,
        handle: fullUser.handle,
        name: fullUser.name,
        profileImage: fullUser.profileImage
      },
      pageType: type,
      csrfToken: res.locals['csrfToken']
    });
  } catch (error) {
    logger.error('Admin analytics page error:', {
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
    
    const appError = createError.internal('Failed to load admin analytics page', error);
    return res.status(appError.statusCode).render('error', {
      title: 'Error',
      message: appError.message,
      errorCode: appError.errorCode,
      user: req.user || null
    });
  }
}

