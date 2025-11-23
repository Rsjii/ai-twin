import { Response } from 'express';
import { db, twinQueries } from '../config/database';
import { logger } from '../config/logger';
import { AppError, createError } from '../utils/errors';
import { handleControllerError } from '../utils/errorHandler';

/**
 * Twin Public Chat History Page - View all public chats with twin
 */
export async function getTwinPublicChatHistoryPage(req: any, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.redirect('/auth');
    }

    const { id: twinId } = req.params;

    // Fetch user's twin
    const userTwins = await twinQueries.findByUserId(userId);
    const twin = userTwins.find(t => t.id === twinId) || null;

    if (!twin) {
      throw createError.notFound('Twin not found or access denied');
    }

    // Fetch full user data
    const fullUser = await db.query('SELECT id, email, handle, name, "profileImage" FROM "User" WHERE id = $1', [userId]);
    const user = fullUser.rows[0] || null;

    res.render('twin-public-chat-history', {
      title: 'Public Chat History - My Twin',
      user: user,
      twin: twin,
      twinId: twinId,
      hasTwins: true,
      csrfToken: res.locals['csrfToken']
    });
  } catch (error) {
    logger.error('Twin public chat history page error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.id,
      path: req.path
    });
    
    handleControllerError(error, 'Failed to load public chat history page');
  }
}

export async function getViewPublicChatHistoryPage(req: any, res: Response) {
  try {
    const { chatId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.redirect('/auth');
    }

    // Verify access
    const chatResult = await db.query(`
      SELECT pc."twinId", t."userId" as twin_owner_id
      FROM "PublicChat" pc
      LEFT JOIN "Twin" t ON pc."twinId" = t.id
      WHERE pc.id = $1
    `, [chatId]);

    if (chatResult.rows.length === 0 || chatResult.rows[0].twin_owner_id !== userId) {
      throw createError.notFound('Chat not found or access denied');
    }

    res.render('view-public-chat-history', {
      title: 'View Chat History',
      user: req.user,
      chatId: chatId,
      csrfToken: res.locals['csrfToken']
    });
  } catch (error) {
    logger.error('View chat history page error:', error);
    handleControllerError(error, 'Failed to load chat history');
  }
}