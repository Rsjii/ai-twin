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

  // ✅ Ultra-detailed page log for debugging public-chat/history issues
  try {
    logger.info('[PAGE_PUBLIC_CHAT_HISTORY]', {
      path: req.path,
      userFromReq: req.user
        ? { id: req.user.id, email: req.user.email, handle: req.user.handle }
        : null,
      userFromLocals: user
        ? { id: user.id, email: user.email, handle: user.handle }
        : null,
    });
  } catch (logError) {
    logger.warn('[PAGE_PUBLIC_CHAT_HISTORY] Failed to log context:', logError);
  }

  console.log('[PAGE_PUBLIC_CHAT_HISTORY] Render data:', {
    user: user ? { id: user.id, email: user.email } : null,
    userFromReq: req.user ? { id: req.user.id, email: req.user.email } : null,
    userFromLocals: user ? { id: user.id, email: user.email } : null,
    path: req.path,
  });

  res.render('public-chat-history', {
    title: 'Your Chat History - AI Twin',
    user,
    csrfToken: res.locals['csrfToken'] || ''
  });
}