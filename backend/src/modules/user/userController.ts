import { Response } from 'express';
import { AuthenticatedRequest } from '../../types/interfaces';
import { db } from '../../config/database';
import { logger } from '../../config/logger';
import { createError } from '../../utils/errors';
import { verifyPassword } from '../auth/authService';
import { userQueries } from '../../config/database';

/**
 * Export user data
 * GET /api/user/export-data
 */
export const exportUserData = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      throw createError.unauthorized();
    }

    const userId = req.user.id;

    // Gather all user data
    const userData = {
      exportDate: new Date().toISOString(),
      user: {},
      twins: [],
      chats: [],
      publicChats: [],
      likes: { given: [], received: [] },
      follows: { given: [], received: [] },
      events: [],
      referrals: { code: null, referrals: [] }
    };

    // 1. User profile data
    const userResult = await db.query(
      'SELECT id, email, handle, name, dob, phone, bio, "referralCode", "createdAt" FROM "User" WHERE id = $1',
      [userId]
    );
    if (userResult.rows[0]) {
      userData.user = userResult.rows[0];
    }

    // 2. Twin data
    const twinsResult = await db.query(
      `SELECT id, "styleVector", "sampleReply", "isPublic", "publicHandle", bio, 
              "profileImage", "verified", "likeCount", "followCount", "chatCount", "createdAt"
       FROM "Twin" WHERE "userId" = $1`,
      [userId]
    );
    userData.twins = twinsResult.rows;

    // 3. Private chats with messages
    const chatsResult = await db.query(
      `SELECT c.id, c."twinId", c."createdAt",
              (SELECT json_agg(
                json_build_object(
                  'id', m.id,
                  'sender', m.sender,
                  'content', m.content,
                  'approved', m.approved,
                  'createdAt', m."createdAt"
                ) ORDER BY m."createdAt"
              )
              FROM "Message" m WHERE m."chatId" = c.id) as messages
       FROM "Chat" c WHERE c."userId" = $1`,
      [userId]
    );
    userData.chats = chatsResult.rows;

    // 4. Public chats with messages
    const publicChatsResult = await db.query(
      `SELECT pc.id, pc."twinId", pc."visitorId", pc."messageCount", pc."createdAt", pc."lastActivity",
              (SELECT json_agg(
                json_build_object(
                  'id', pm.id,
                  'sender', pm.sender,
                  'content', pm.content,
                  'approved', pm.approved,
                  'createdAt', pm."createdAt"
                ) ORDER BY pm."createdAt"
              )
              FROM "PublicMessage" pm WHERE pm."chatId" = pc.id) as messages
       FROM "PublicChat" pc 
       WHERE pc."userId" = $1 OR pc."twinId" IN (SELECT id FROM "Twin" WHERE "userId" = $1)`,
      [userId]
    );
    userData.publicChats = publicChatsResult.rows;

    // 5. Likes given
    const likesGivenResult = await db.query(
      `SELECT tl.id, tl."twinId", tl."createdAt",
              t."publicHandle" as twinHandle
       FROM "TwinLike" tl
       JOIN "Twin" t ON tl."twinId" = t.id
       WHERE tl."userId" = $1`,
      [userId]
    );
    userData.likes.given = likesGivenResult.rows;

    // 6. Likes received (on user's twins)
    const likesReceivedResult = await db.query(
      `SELECT tl.id, tl."twinId", tl."userId", tl."createdAt",
              u.name as userName, u.handle as userHandle
       FROM "TwinLike" tl
       JOIN "Twin" t ON tl."twinId" = t.id
       JOIN "User" u ON tl."userId" = u.id
       WHERE t."userId" = $1`,
      [userId]
    );
    userData.likes.received = likesReceivedResult.rows;

    // 7. Follows given
    const followsGivenResult = await db.query(
      `SELECT tf.id, tf."twinId", tf."createdAt",
              t."publicHandle" as twinHandle
       FROM "TwinFollow" tf
       JOIN "Twin" t ON tf."twinId" = t.id
       WHERE tf."userId" = $1`,
      [userId]
    );
    userData.follows.given = followsGivenResult.rows;

    // 8. Follows received
    const followsReceivedResult = await db.query(
      `SELECT tf.id, tf."twinId", tf."userId", tf."createdAt",
              u.name as userName, u.handle as userHandle
       FROM "TwinFollow" tf
       JOIN "Twin" t ON tf."twinId" = t.id
       JOIN "User" u ON tf."userId" = u.id
       WHERE t."userId" = $1`,
      [userId]
    );
    userData.follows.received = followsReceivedResult.rows;

    // 9. Events/Activity log
    const eventsResult = await db.query(
      `SELECT id, type, meta, "createdAt"
       FROM "Event" WHERE "userId" = $1
       ORDER BY "createdAt" DESC
       LIMIT 1000`,
      [userId]
    );
    userData.events = eventsResult.rows;

    // 10. Referral data
    if (userData.user.referralCode) {
      const referralsResult = await db.query(
        `SELECT id, email, handle, name, "createdAt"
         FROM "User" WHERE "referralCode" = $1 AND id != $2`,
        [userData.user.referralCode, userId]
      );
      userData.referrals.referrals = referralsResult.rows;
    }

    // Set response headers for JSON download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="user-data-${userId}-${Date.now()}.json"`);
    
    res.json(userData);

  } catch (error) {
    logger.error('Export user data error:', error);
    if (error instanceof Error && error.message.includes('unauthorized')) {
      throw error;
    }
    throw createError.internal('Failed to export user data', error);
  }
};

/**
 * Delete user account
 * DELETE /api/user/account
 */
export const deleteAccount = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      throw createError.unauthorized();
    }

    const userId = req.user.id;
    const { password } = req.body;

    // Verify password if provided
    if (password) {
      const user = await userQueries.findByEmail(req.user.email);
      if (!user || !user.passwordHash) {
        throw createError.validation('Password verification failed');
      }

      const isValidPassword = await verifyPassword(password, user.passwordHash);
      if (!isValidPassword) {
        throw createError.validation('Incorrect password');
      }
    }

    // Delete user (CASCADE will handle all related data)
    await db.query('DELETE FROM "User" WHERE id = $1', [userId]);

    logger.info(`User account deleted: ${userId}`);

    // Clear session
    req.session?.destroy(() => {});

    res.json({
      success: true,
      message: 'Account deleted successfully'
    });

  } catch (error) {
    logger.error('Delete account error:', error);
    if (error instanceof Error && (error.message.includes('unauthorized') || error.message.includes('validation'))) {
      throw error;
    }
    throw createError.internal('Failed to delete account', error);
  }
};