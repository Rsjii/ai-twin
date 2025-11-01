import { Response } from 'express';
import { userQueries, twinQueries } from '../config/database';

/**
 * Dashboard page - Main user dashboard
 */
export async function getDashboard(req: any, res: Response) {
  // Check if user is authenticated via JWT
  if (!req.user) {
    return res.redirect('/auth');
  }
  
  // Fetch full user data from database
  const fullUser = await userQueries.findByEmail(req.user.email);
  if (!fullUser) {
    return res.redirect('/auth');
  }
  
  // Check if user has created any twins
  const userTwins = await twinQueries.findByUserId(fullUser.id);
  const hasTwins = userTwins.length > 0;
  
  // Set user data with all fields including profileImage
  const user = {
    id: fullUser.id,
    email: fullUser.email,
    handle: fullUser.handle,
    name: fullUser.name,
    profileImage: fullUser.profileImage,
  };
  
  res.render('dashboard', {
    title: 'Dashboard - AI Twin',
    user: user,
    hasTwins: hasTwins,
    twins: userTwins,
    csrfToken: res.locals['csrfToken']
  });
}

