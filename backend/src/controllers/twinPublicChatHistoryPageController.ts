import { Response } from 'express';
import { db, twinQueries } from '../config/database';
import { logger } from '../config/logger';
import { createError, ErrorCodes } from '../utils/errors';
import { handleControllerError } from '../utils/errorHandler';
import { detokenizeId, tokenizeId } from '../utils/idTokenization';

/**
 * Twin Public Chat History Page - View all public chats with twin
 */
export async function getTwinPublicChatHistoryPage(req: any, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.redirect('/auth');
    }

    // Single twin per user – latest/first twin
    const userTwins = await twinQueries.findByUserId(userId);
    const twin = userTwins[0] || null;

    if (!twin) {
      throw createError.notFound('Twin not found or access denied', ErrorCodes.TWIN_NOT_FOUND);
    }

    const twinId = twin.id;
    const twinPublicId = tokenizeId(twinId, 'twin');

    // Fetch full user data
    const fullUser = await db.query(
      'SELECT id, email, handle, name, "profileImage" FROM "User" WHERE id = $1',
      [userId],
    );
    const user = fullUser.rows[0] || null;

    res.render('twin-public-chat-history', {
      title: 'Public Chat History - My Twin',
      user,
      twin,
      twinId,
      twinPublicId,
      hasTwins: true,
      csrfToken: res.locals['csrfToken'],
    });
  } catch (error) {
    logger.error('Twin public chat history page error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.id,
      path: req.path,
    });

    handleControllerError(error, 'Failed to load public chat history page');
  }
}

export async function getViewPublicChatHistoryPage(req: any, res: Response) {
  try {
    const { chatToken } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.redirect('/auth');
    }

    // 🔥 detokenize chat token → real PublicChat.id
    const decoded = detokenizeId(chatToken, {
      userId,
      endpoint: 'getViewPublicChatHistoryPage',
    });
    if (!decoded || decoded.type !== 'chat') {
      throw createError.notFound('Chat not found or access denied');
    }
    const chatId = decoded.id;

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
      chatId: chatId,          // raw DB id; view page APIs can use this
      csrfToken: res.locals['csrfToken']
    });
  } catch (error) {
    logger.error('View chat history page error:', error);
    handleControllerError(error, 'Failed to load chat history');
  }
}