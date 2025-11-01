import { Response } from 'express';
import { userQueries } from '../config/database';

/**
 * Analytics dashboard page - User analytics
 */
export async function getAnalytics(req: any, res: Response) {
  // Fetch full user data from database
  const fullUser = await userQueries.findByEmail(req.user.email);
  if (!fullUser) {
    return res.redirect('/auth');
  }
  
  // Set user data
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
}

/**
 * Admin Analytics dashboard page
 */
export async function getAdminAnalytics(req: any, res: Response) {
  // Check if user is admin
  const adminEmails = ['admin@aitwin.com', 'i@gmail.com'];
  if (!req.user || !req.user.email || !adminEmails.includes(req.user.email)) {
    return res.status(403).render('403', { 
      title: 'Access Denied',
      message: 'Admin access required'
    });
  }

  // Fetch full user data from database
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
}

/**
 * Admin Analytics detailed page
 */
export async function getAdminAnalyticsPage(req: any, res: Response) {
  // Check if user is admin
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

  // Fetch full user data from database
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
}

