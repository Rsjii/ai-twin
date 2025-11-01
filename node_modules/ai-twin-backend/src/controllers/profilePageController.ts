import { Response } from 'express';
import { userQueries } from '../config/database';
import { logger } from '../config/logger';

/**
 * Profile page - User profile settings
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
      csrfToken: res.locals['csrfToken'],
    });
  } catch (error) {
    console.error('Profile page error:', error);
    logger.error('Profile page error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}

/**
 * Change Password page
 */
export async function getChangePassword(req: any, res: Response) {
  // Check if user is authenticated via JWT
  if (!req.user) {
    return res.redirect('/auth');
  }

  try {
    // Fetch complete user data from database
    const user = await userQueries.findByEmail(req.user.email);
    if (!user) {
      return res.redirect('/auth');
    }

    res.render('change-password', {
      title: 'Change Password - AI Twin',
      user: user,
      csrfToken: res.locals['csrfToken'],
    });
  } catch (error) {
    logger.error('Change password page error:', error);
    res.status(500).send('Internal server error');
  }
}

