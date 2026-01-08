import { Response } from 'express';
import { AuthenticatedRequest } from '../../types/interfaces';
import { db } from '../../config/database';
import { logger } from '../../config/logger';
import { createError, ErrorCodes, AppError } from '../../utils/errors';
import { verifyPassword } from '../auth/authService';
import { userQueries } from '../../config/database';
import { isProd } from '../../config/env';
import { EventLogger } from '../../services/eventLogger';
import { EVENT_TYPES } from '../../config/constants';

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

    // New structured format
    const userData = {
      exportInfo: {
        exportDate: new Date().toISOString(),
        formatVersion: "2.0",
        userId: userId
      },
      
      // 1. Profile Information
      profile: {
        basicInfo: {},
        accountInfo: {}
      },
      
      // 2. Twins
      twins: [],
      
      // 3. Activity Summary
      activitySummary: {
        totalChats: 0,
        totalPublicChats: 0,
        totalLikesGiven: 0,
        totalLikesReceived: 0,
        totalFollowsGiven: 0,
        totalFollowsReceived: 0
      },
      
      // 4. Recent Activity (last 30 days)
      recentActivity: {
        chats: [],
        publicChats: [],
        likes: { given: [], received: [] },
        follows: { given: [], received: [] }
      },
      
      // 5. Preferences (if any)
      preferences: {}
    };

    // 1. User profile data (only essential)
    const userResult = await db.query(
      'SELECT email, handle, name, bio, "createdAt" FROM "User" WHERE id = $1',
      [userId]
    );
    if (userResult.rows[0]) {
      userData.profile.basicInfo = {
        email: userResult.rows[0].email,
        handle: userResult.rows[0].handle,
        name: userResult.rows[0].name,
        bio: userResult.rows[0].bio
      };
      userData.profile.accountInfo = {
        createdAt: userResult.rows[0].createdAt,
        referralCode: userResult.rows[0].referralCode || null
      };
    }

    // 2. Twin data (remove sensitive/internal data)
    const twinsResult = await db.query(
      `SELECT id, "isPublic", "publicHandle", bio, 
              "profileImage", "verified", "likeCount", "followCount", "chatCount", "createdAt"
       FROM "Twin" WHERE "userId" = $1`,
      [userId]
    );
    userData.twins = twinsResult.rows.map(twin => ({
      id: twin.id,
      publicHandle: twin.publicHandle,
      isPublic: twin.isPublic,
      bio: twin.bio,
      profileImage: twin.profileImage,
      verified: twin.verified,
      stats: {
        likes: twin.likeCount || 0,
        followers: twin.followCount || 0,
        chats: twin.chatCount || 0
      },
      createdAt: twin.createdAt
      // Removed: styleVector, sampleReply (internal data)
    }));

    // 3. Activity Summary
    const [chatsCount, publicChatsCount, likesGivenCount, likesReceivedCount, 
           followsGivenCount, followsReceivedCount] = await Promise.all([
      db.query('SELECT COUNT(*) as count FROM "Chat" WHERE "userId" = $1 AND "messageCount" > 0', [userId]),
      db.query('SELECT COUNT(*) as count FROM "PublicChat" WHERE "userId" = $1 AND "messageCount" > 0', [userId]),
      db.query('SELECT COUNT(*) as count FROM "TwinLike" WHERE "userId" = $1', [userId]),
      db.query(`SELECT COUNT(*) as count FROM "TwinLike" tl 
                JOIN "Twin" t ON tl."twinId" = t.id WHERE t."userId" = $1`, [userId]),
      db.query('SELECT COUNT(*) as count FROM "TwinFollow" WHERE "userId" = $1', [userId]),
      db.query(`SELECT COUNT(*) as count FROM "TwinFollow" tf 
                JOIN "Twin" t ON tf."twinId" = t.id WHERE t."userId" = $1`, [userId])
    ]);
    
    userData.activitySummary = {
      totalChats: parseInt(chatsCount.rows[0]?.count || '0', 10),
      totalPublicChats: parseInt(publicChatsCount.rows[0]?.count || '0', 10),
      totalLikesGiven: parseInt(likesGivenCount.rows[0]?.count || '0', 10),
      totalLikesReceived: parseInt(likesReceivedCount.rows[0]?.count || '0', 10),
      totalFollowsGiven: parseInt(followsGivenCount.rows[0]?.count || '0', 10),
      totalFollowsReceived: parseInt(followsReceivedCount.rows[0]?.count || '0', 10)
    };

    // 4. Recent Activity (last 30 days only)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    // Recent chats (last 10) - only with messages
    const recentChatsResult = await db.query(
      `SELECT c.id, c."createdAt", 
              (SELECT COUNT(*) FROM "Message" m WHERE m."chatId" = c.id) as messageCount
       FROM "Chat" c WHERE c."userId" = $1 AND c."messageCount" > 0
       ORDER BY c."createdAt" DESC LIMIT 10`,
      [userId]
    );
    userData.recentActivity.chats = recentChatsResult.rows;
    
    // Recent public chats (last 10) - only with messages
    const recentPublicChatsResult = await db.query(
      `SELECT pc.id, pc."createdAt", pc."messageCount"
       FROM "PublicChat" pc WHERE pc."userId" = $1 AND pc."messageCount" > 0
       ORDER BY pc."createdAt" DESC LIMIT 10`,
      [userId]
    );
    userData.recentActivity.publicChats = recentPublicChatsResult.rows;
    
    // Recent likes given (last 20)
    const recentLikesGivenResult = await db.query(
      `SELECT tl.id, tl."twinId", tl."createdAt", t."publicHandle" as twinHandle
       FROM "TwinLike" tl
       JOIN "Twin" t ON tl."twinId" = t.id
       WHERE tl."userId" = $1
       ORDER BY tl."createdAt" DESC LIMIT 20`,
      [userId]
    );
    userData.recentActivity.likes.given = recentLikesGivenResult.rows;
    
    // Recent likes received (last 20)
    const recentLikesReceivedResult = await db.query(
      `SELECT tl.id, tl."twinId", tl."userId", tl."createdAt",
              u.handle as userHandle, u.name as userName
       FROM "TwinLike" tl
       JOIN "Twin" t ON tl."twinId" = t.id
       JOIN "User" u ON tl."userId" = u.id
       WHERE t."userId" = $1
       ORDER BY tl."createdAt" DESC LIMIT 20`,
      [userId]
    );
    userData.recentActivity.likes.received = recentLikesReceivedResult.rows;
    
    // Recent follows given (last 20)
    const recentFollowsGivenResult = await db.query(
      `SELECT tf.id, tf."twinId", tf."createdAt", t."publicHandle" as twinHandle
       FROM "TwinFollow" tf
       JOIN "Twin" t ON tf."twinId" = t.id
       WHERE tf."userId" = $1
       ORDER BY tf."createdAt" DESC LIMIT 20`,
      [userId]
    );
    userData.recentActivity.follows.given = recentFollowsGivenResult.rows;
    
    // Recent follows received (last 20)
    const recentFollowsReceivedResult = await db.query(
      `SELECT tf.id, tf."twinId", tf."userId", tf."createdAt",
              u.handle as userHandle, u.name as userName
       FROM "TwinFollow" tf
       JOIN "Twin" t ON tf."twinId" = t.id
       JOIN "User" u ON tf."userId" = u.id
       WHERE t."userId" = $1
       ORDER BY tf."createdAt" DESC LIMIT 20`,
      [userId]
    );
    userData.recentActivity.follows.received = recentFollowsReceivedResult.rows;

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

    // Always load user to see if they have a password
    const user = await userQueries.findByEmail(req.user.email);
    
    if (!user) {
      throw createError.notFound('User not found', ErrorCodes.USER_NOT_FOUND);
    }

    if (user.passwordHash) {
      // Email/password account → require password
      if (!password || typeof password !== 'string' || password.trim() === '') {
        return res.status(400).json({
          success: false,
          error: 'Password is required to delete your account',
          errorCode: ErrorCodes.VALIDATION_ERROR
        });
      }

      const isValidPassword = await verifyPassword(password, user.passwordHash);
      if (!isValidPassword) {
        return res.status(400).json({
          success: false,
          error: 'Incorrect password. Please enter your correct password to confirm account deletion.',
          errorCode: ErrorCodes.VALIDATION_ERROR
        });
      }
    }
    // If user.passwordHash is null (pure OTP / SSO account), allow delete without password

    // Delete user (CASCADE will handle all related data)
    await db.query('DELETE FROM "User" WHERE id = $1', [userId]);    

    // ✅ Log account deletion event
    await EventLogger.logUserEvent(userId, EVENT_TYPES.ACCOUNT_DELETED, {
      email: user.email,
      handle: user.handle || null,
      deletionMethod: user.passwordHash ? 'password_verified' : 'otp_only',
    }).catch(() => {}); // Silent fail - don't break deletion if logging fails

    logger.info(`User account deleted: ${userId}`);

    // Clear JWT cookie (same options as logout)
    res.clearCookie('jwtToken', {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'lax' : 'strict',
      path: '/',
    });

    // Also clear session
    req.session?.destroy(() => {});

    // Respond with redirect hint
    res.json({
      success: true,
      message: 'Account deleted successfully',
      redirect: '/auth',
    });    

  } catch (error: any) {
    logger.error('Delete account error:', error);
    
    // Handle AppError instances directly
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        error: error.message,
        errorCode: error.errorCode || ErrorCodes.INTERNAL_ERROR
      });
    }
    
    // Handle other errors
    if (error instanceof Error) {
      // Check if it's a validation or auth error by message
      if (error.message.includes('unauthorized') || error.message.includes('validation') || error.message.includes('not found')) {
        const statusCode = error.message.includes('unauthorized') ? 401 : 
                          error.message.includes('not found') ? 404 : 400;
        return res.status(statusCode).json({
          success: false,
          error: error.message,
          errorCode: statusCode === 401 ? ErrorCodes.UNAUTHORIZED : 
                    statusCode === 404 ? ErrorCodes.NOT_FOUND : 
                    ErrorCodes.VALIDATION_ERROR
        });
      }
    }
    
    // Fallback to internal error
    return res.status(500).json({
      success: false,
      error: 'Failed to delete account. Please try again.',
      errorCode: ErrorCodes.INTERNAL_ERROR
    });
  }
};