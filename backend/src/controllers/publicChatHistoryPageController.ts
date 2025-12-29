import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { userQueries } from '../config/database';
import { logger } from '../config/logger';

/**
 * Public Chat History Page
 * Shows all twins user has chatted with
 */
export async function getPublicChatHistoryPage(req: AuthenticatedRequest, res: Response) {
  // ✅ Use global locals filled by middleware (consistent with header/footer)
  const user = res.locals.user || null;



  res.render('public-chat-history', {
    title: 'Your Chat History - AI Twin',
    user,
    csrfToken: res.locals['csrfToken'] || ''
  });
}