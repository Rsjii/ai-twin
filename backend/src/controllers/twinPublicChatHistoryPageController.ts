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

    // 🔓 Detokenize chat token → real PublicChat.id
    const decoded = detokenizeId(chatToken, {
      userId,
      endpoint: 'getViewPublicChatHistoryPage',
    });

    if (!decoded || decoded.type !== 'chat') {
      throw createError.notFound('This chat does not exist', ErrorCodes.CHAT_NOT_FOUND);
    }

    const chatId = decoded.id;

 // ✅ Load chat with twin + participant user
 const chatResult = await db.query(
  `
  SELECT pc.id, pc."twinId", pc."userId"
  FROM "PublicChat" pc
  WHERE pc.id = $1
  `,
  [chatId],
);    

    if (chatResult.rows.length === 0) {
      throw createError.notFound('This chat does not exist', ErrorCodes.CHAT_NOT_FOUND);
    }

    const chatRow = chatResult.rows[0];

  // ✅ Ensure this chat actually belongs to the current user's twin
  const twinOwnerCheck = await db.query(
    `
    SELECT "userId"
    FROM "Twin"
    WHERE id = $1
    `,
    [chatRow.twinId],
  );

  if (
    twinOwnerCheck.rows.length === 0 ||
    twinOwnerCheck.rows[0].userId !== userId
  ) {
    // Not this owner's chat → act like it doesn't exist
    throw createError.notFound('This chat does not exist', ErrorCodes.CHAT_NOT_FOUND);
  }

  // ✅ Extra safety: if the participant has blocked this owner on ANY of their twins,
  // hide the view page as well (same semantics as getAllPublicChatsForTwin)
  if (chatRow.userId) {
    const blockedByParticipant = await db.query(
      `
      SELECT 1
      FROM "Twin" t2
      JOIN "TwinBlockedUsers" tbu ON tbu."twinId" = t2.id
      WHERE t2."userId" = $1
        AND tbu."userId" = $2
      LIMIT 1
      `,
      [chatRow.userId, userId],
    );

    if (blockedByParticipant.rows.length > 0) {
      throw createError.notFound('This chat does not exist', ErrorCodes.CHAT_NOT_FOUND);
    }
  }

    // ✅ Let the API (/api/public-chat/:chatId/view-history) enforce twin ownership
    res.render('view-public-chat-history', {
      title: 'View Chat History',
      user: req.user,
      chatId: chatId,          // raw DB id; view page APIs use this
      csrfToken: res.locals['csrfToken'],
    });
  } catch (error) {
    logger.error('View chat history page error:', error);
    handleControllerError(error, 'Failed to load chat history');
  }
}