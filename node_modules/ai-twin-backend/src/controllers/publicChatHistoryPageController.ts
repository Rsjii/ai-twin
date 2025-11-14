import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { userQueries } from '../config/database';

/**
 * Public Chat History Page
 * Shows all twins user has chatted with
 */
export async function getPublicChatHistoryPage(req: AuthenticatedRequest, res: Response) {
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
  
  res.render('public-chat-history', {
    title: 'Your Chat History - AI Twin',
    user: user,
    csrfToken: res.locals['csrfToken'] || ''
  });
}