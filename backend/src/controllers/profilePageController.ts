import { Response } from 'express';
import { userQueries, twinQueries } from '../config/database';
import { logger } from '../config/logger';

/**
 * Profile page - User profile settings with tabs
 */
export async function getProfile(req: any, res: Response) {
  console.log('Profile route accessed. User:', req.user);
  
  // Check if user is authenticated via JWT
  if (!req.user) {
    console.log('No user in JWT, redirecting to auth');
    return res.redirect('/auth');
  }

  try {
    console.log('Fetching user data for email:', req.user.email);
    // Fetch complete user data from database
    const user = await userQueries.findByEmail(req.user.email);
    console.log('User query result:', user);
    
    if (!user) {
      console.log('User not found in database, redirecting to auth');
      return res.redirect('/auth');
    }

    // Fetch twin data if exists (only one twin per user)
    const userTwins = await twinQueries.findByUserId(user.id);
    const twin = userTwins.length > 0 ? userTwins[0] : null;
    const hasTwins = !!twin;

    // Get active tab from query parameter (default to 'profile')
    const activeTab = req.query.tab || 'profile';

    console.log('User found, rendering profile page');
    // Ensure all profile fields exist with default values
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
      hasTwins: hasTwins,
      activeTab: activeTab, // 'profile', 'twin', or 'settings'
      csrfToken: res.locals['csrfToken'],
    });
  } catch (error) {
    console.error('Profile page error:', error);
    logger.error('Profile page error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}

/**
 * Change Password page (now redirects to profile settings tab)
 */
export async function getChangePassword(req: any, res: Response) {
  // Redirect to profile page with settings tab
  return res.redirect('/profile?tab=settings');
}