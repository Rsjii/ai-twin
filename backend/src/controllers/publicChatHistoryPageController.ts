import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';

/**
 * Public Chat History Page
 * Shows all twins user has chatted with
 */
export function getPublicChatHistoryPage(req: AuthenticatedRequest, res: Response) {
  res.render('public-chat-history', {
    title: 'Your Chat History - AI Twin',
    user: req.user,
    csrfToken: res.locals['csrfToken'] || ''
  });
}