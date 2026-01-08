import { Request, Response } from 'express';
import { db, twinLikeQueries, twinFollowQueries } from '../../config/database';
import { logger } from '../../config/logger';
import { EventLogger } from '../../services/eventLogger';
import { z } from 'zod';
import { detokenizeId, tokenizeId } from '../../utils/idTokenization';
import { createError, ErrorCodes } from '../../utils/errors';
import { EVENT_TYPES } from '../../config/constants';

// Validation schemas
const likeTwinSchema = z.object({
  twinToken: z.string().min(1, 'Twin token is required')
});

const followTwinSchema = z.object({
  twinToken: z.string().min(1, 'Twin token is required')
});

// Like a twin
export const likeTwin = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { twinToken } = likeTwinSchema.parse(req.body);

    // ✅ PHASE 2: Detokenize twinToken to get actual twinId
    const decoded = detokenizeId(twinToken);
    if (!decoded || decoded.type !== 'twin') {
      throw createError.validation('Invalid twin token', ErrorCodes.INVALID_INPUT);
    }
    const twinId = decoded.id;

    // Check if twin exists and is public
    const twinResult = await db.query(`
      SELECT id, "isPublic", "likeCount", "allowLikes"
      FROM "Twin"
      WHERE id = $1 AND "isPublic" = true
    `, [twinId]);

    if (twinResult.rows.length === 0) {
      return res.status(404).json({ error: 'Public twin not found' });
    }

    const twin = twinResult.rows[0];

    // ✅ PHASE 4: Check if user is trying to like their own twin
    const twinOwnerCheck = await db.query(`
      SELECT "userId" FROM "Twin" WHERE id = $1
    `, [twinId]);
    
    if (twinOwnerCheck.rows.length > 0 && twinOwnerCheck.rows[0].userId === req.user.id) {
      return res.status(403).json({
        error: 'You cannot like your own twin',
        errorCode: 'OWN_TWIN_INTERACTION'
      });
    }

     // ✅ Check if user is blocked
     const blockedCheck = await db.query(`
      SELECT id FROM "TwinBlockedUsers"
      WHERE "twinId" = $1 AND "userId" = $2
    `, [twinId, req.user.id]);
    
    if (blockedCheck.rows.length > 0) {
      return res.status(403).json({
        error: 'You are blocked from interacting with this twin',
        errorCode: 'USER_BLOCKED'
      });
    }

    // ✅ PHASE 2: Check if likes are allowed    
    if (twin.allowLikes === false) {
      return res.status(403).json({ 
        error: 'Likes are disabled for this twin',
        errorCode: 'LIKES_DISABLED'
      });
    }

    // Check if user already liked this twin
    const existingLike = await twinLikeQueries.findByTwinAndUser(twinId, req.user.id);

    if (existingLike) {
      return res.status(400).json({ error: 'You have already liked this twin' });
    }

    // Like the twin
    await twinLikeQueries.create(twinId, req.user.id);

    // Get updated like count
    const updatedTwin = await db.query(`
      SELECT "likeCount" FROM "Twin" WHERE id = $1
    `, [twinId]);

    // Log event
    await EventLogger.logUserEvent(req.user.id, EVENT_TYPES.TWIN_LIKED, {
      twinId,
      newLikeCount: updatedTwin.rows[0].likeCount
    });

    res.json({
      success: true,
      message: 'Twin liked successfully',
      likeCount: updatedTwin.rows[0].likeCount
    });

  } catch (error) {
    logger.error('Like twin error:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Invalid input', 
        details: error.errors 
      });
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Unlike a twin
export const unlikeTwin = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { twinToken } = likeTwinSchema.parse(req.body);

    // ✅ PHASE 2: Detokenize twinToken to get actual twinId
    const decoded = detokenizeId(twinToken);
    if (!decoded || decoded.type !== 'twin') {
      throw createError.validation('Invalid twin token', ErrorCodes.INVALID_INPUT);
    }
    const twinId = decoded.id;

    // ✅ PHASE 2: Check if twin exists and likes are allowed (for consistency)
    const twinResult = await db.query(`
      SELECT id, "isPublic", "allowLikes"
      FROM "Twin"
      WHERE id = $1 AND "isPublic" = true
    `, [twinId]);

    if (twinResult.rows.length === 0) {
      return res.status(404).json({ error: 'Public twin not found' });
    }

    const twin = twinResult.rows[0];

    // ✅ PHASE 2: Check if likes are allowed
    if (twin.allowLikes === false) {
      return res.status(403).json({ 
        error: 'Likes are disabled for this twin',
        errorCode: 'LIKES_DISABLED'
      });
    }

    // Check if user has liked this twin
    const existingLike = await twinLikeQueries.findByTwinAndUser(twinId, req.user.id);

    if (!existingLike) {
      return res.status(400).json({ error: 'You have not liked this twin' });
    }

    // Unlike the twin
    await twinLikeQueries.remove(twinId, req.user.id);

    // Get updated like count
    const updatedTwin = await db.query(`
      SELECT "likeCount" FROM "Twin" WHERE id = $1
    `, [twinId]);

    // Log event
    await EventLogger.logUserEvent(req.user.id, EVENT_TYPES.TWIN_UNLIKED, {
      twinId,
      newLikeCount: updatedTwin.rows[0].likeCount
    });

    res.json({
      success: true,
      message: 'Twin unliked successfully',
      likeCount: updatedTwin.rows[0].likeCount
    });

  } catch (error) {
    logger.error('Unlike twin error:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Invalid input', 
        details: error.errors 
      });
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Follow a twin
export const followTwin = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { twinToken } = followTwinSchema.parse(req.body);

    // ✅ PHASE 2: Detokenize twinToken to get actual twinId
    const decoded = detokenizeId(twinToken);
    if (!decoded || decoded.type !== 'twin') {
      throw createError.validation('Invalid twin token', ErrorCodes.INVALID_INPUT);
    }
    const twinId = decoded.id;

    // Check if twin exists and is public
    const twinResult = await db.query(`
      SELECT id, "isPublic", "followCount", "allowFollows"
      FROM "Twin"
      WHERE id = $1 AND "isPublic" = true
    `, [twinId]);

    if (twinResult.rows.length === 0) {
      return res.status(404).json({ error: 'Public twin not found' });
    }

    const twin = twinResult.rows[0];

    // ✅ PHASE 4: Check if user is trying to follow their own twin
    const twinOwnerCheck = await db.query(`
      SELECT "userId" FROM "Twin" WHERE id = $1
    `, [twinId]);
    
    if (twinOwnerCheck.rows.length > 0 && twinOwnerCheck.rows[0].userId === req.user.id) {
      return res.status(403).json({
        error: 'You cannot follow your own twin',
        errorCode: 'OWN_TWIN_INTERACTION'
      });
    }

    // ✅ Check if user is blocked
    const blockedCheck = await db.query(`
      SELECT id FROM "TwinBlockedUsers"
      WHERE "twinId" = $1 AND "userId" = $2
    `, [twinId, req.user.id]);
    
    if (blockedCheck.rows.length > 0) {
      return res.status(403).json({
        error: 'You are blocked from interacting with this twin',
        errorCode: 'USER_BLOCKED'
      });
    }

    // ✅ PHASE 2: Check if follows are allowed    
    if (twin.allowFollows === false) {
      return res.status(403).json({ 
        error: 'Follows are disabled for this twin',
        errorCode: 'FOLLOWS_DISABLED'
      });
    }

    // Check if user already follows this twin
    const existingFollow = await twinFollowQueries.findByTwinAndUser(twinId, req.user.id);

    if (existingFollow) {
      return res.status(400).json({ error: 'You are already following this twin' });
    }

    // Follow the twin
    await twinFollowQueries.create(twinId, req.user.id);

    // Get updated follow count
    const updatedTwin = await db.query(`
      SELECT "followCount" FROM "Twin" WHERE id = $1
    `, [twinId]);

    // Log event
    await EventLogger.logUserEvent(req.user.id, EVENT_TYPES.TWIN_FOLLOWED, {
      twinId,
      newFollowCount: updatedTwin.rows[0].followCount
    });

    res.json({
      success: true,
      message: 'Twin followed successfully',
      followCount: updatedTwin.rows[0].followCount
    });

  } catch (error) {
    logger.error('Follow twin error:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Invalid input', 
        details: error.errors 
      });
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Unfollow a twin
export const unfollowTwin = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { twinToken } = followTwinSchema.parse(req.body);

    // ✅ PHASE 2: Detokenize twinToken to get actual twinId
    const decoded = detokenizeId(twinToken);
    if (!decoded || decoded.type !== 'twin') {
      throw createError.validation('Invalid twin token', ErrorCodes.INVALID_INPUT);
    }
    const twinId = decoded.id;

    // ✅ PHASE 2: Check if twin exists and follows are allowed (for consistency)
    const twinResult = await db.query(`
      SELECT id, "isPublic", "allowFollows"
      FROM "Twin"
      WHERE id = $1 AND "isPublic" = true
    `, [twinId]);

    if (twinResult.rows.length === 0) {
      return res.status(404).json({ error: 'Public twin not found' });
    }

    const twin = twinResult.rows[0];

    // ✅ PHASE 2: Check if follows are allowed
    if (twin.allowFollows === false) {
      return res.status(403).json({ 
        error: 'Follows are disabled for this twin',
        errorCode: 'FOLLOWS_DISABLED'
      });
    }

    // Check if user follows this twin
    const existingFollow = await twinFollowQueries.findByTwinAndUser(twinId, req.user.id);

    if (!existingFollow) {
      return res.status(400).json({ error: 'You are not following this twin' });
    }

    // Unfollow the twin
    await twinFollowQueries.remove(twinId, req.user.id);

    // Get updated follow count
    const updatedTwin = await db.query(`
      SELECT "followCount" FROM "Twin" WHERE id = $1
    `, [twinId]);

    // Log event
    await EventLogger.logUserEvent(req.user.id, EVENT_TYPES.TWIN_UNFOLLOWED, {
      twinId,
      newFollowCount: updatedTwin.rows[0].followCount
    });

    res.json({
      success: true,
      message: 'Twin unfollowed successfully',
      followCount: updatedTwin.rows[0].followCount
    });

  } catch (error) {
    logger.error('Unfollow twin error:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Invalid input', 
        details: error.errors 
      });
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get twin engagement stats
export const getTwinStats = async (req: Request, res: Response) => {
  try {
    const { twinToken } = req.params;

    // ✅ PHASE 2: Detokenize twinToken to get actual twinId
    const decoded = detokenizeId(twinToken);
    if (!decoded || decoded.type !== 'twin') {
      throw createError.validation('Invalid twin token', ErrorCodes.INVALID_INPUT);
    }
    const twinId = decoded.id;

    // Get twin stats with visible counts (exclude blocked users + users who blocked owner)
    const twinResult = await db.query(`
      SELECT
        t."isPublic",
        (SELECT COUNT(*)
         FROM "TwinLike" tl
         WHERE tl."twinId" = t.id
           AND NOT EXISTS (
             SELECT 1 FROM "TwinBlockedUsers" tbu_self
             WHERE tbu_self."twinId" = t.id AND tbu_self."userId" = tl."userId"
           )
           AND NOT EXISTS (
             SELECT 1
             FROM "Twin" t2
             JOIN "TwinBlockedUsers" tbu ON tbu."twinId" = t2.id
             WHERE t2."userId" = tl."userId" AND tbu."userId" = t."userId"
           )
        ) as "likeCount",
        (SELECT COUNT(*)
         FROM "TwinFollow" tf
         WHERE tf."twinId" = t.id
           AND NOT EXISTS (
             SELECT 1 FROM "TwinBlockedUsers" tbu_self
             WHERE tbu_self."twinId" = t.id AND tbu_self."userId" = tf."userId"
           )
           AND NOT EXISTS (
             SELECT 1
             FROM "Twin" t2
             JOIN "TwinBlockedUsers" tbu ON tbu."twinId" = t2.id
             WHERE t2."userId" = tf."userId" AND tbu."userId" = t."userId"
           )
        ) as "followCount",
        (SELECT COUNT(*)
         FROM "PublicMessage" pm
         JOIN "PublicChat" pc ON pm."chatId" = pc.id
         WHERE pc."twinId" = t.id
           AND pm.sender = 'human'
           AND (pc."userId" IS NULL OR pc."userId" <> t."userId")
           AND (
             pc."userId" IS NULL
             OR (
               NOT EXISTS (
                 SELECT 1 FROM "TwinBlockedUsers" tbu_self
                 WHERE tbu_self."twinId" = t.id AND tbu_self."userId" = pc."userId"
               )
               AND NOT EXISTS (
                 SELECT 1
                 FROM "Twin" t2
                 JOIN "TwinBlockedUsers" tbu ON tbu."twinId" = t2.id
                 WHERE t2."userId" = pc."userId" AND tbu."userId" = t."userId"
               )
             )
           )
        ) as "chatCount"
      FROM "Twin" t
      WHERE t.id = $1
    `, [twinId]);

    if (twinResult.rows.length === 0) {
      return res.status(404).json({ error: 'Twin not found' });
    }

    const twin = twinResult.rows[0];

    // Get user's interaction status (if authenticated)
    let userInteraction = null;
    if (req.user) {
      const [likeStatus, followStatus] = await Promise.all([
        twinLikeQueries.findByTwinAndUser(twinId, req.user.id),
        twinFollowQueries.findByTwinAndUser(twinId, req.user.id)
      ]);

      userInteraction = {
        hasLiked: !!likeStatus,
        hasFollowed: !!followStatus
      };
    }

    res.json({
      success: true,
      stats: {
        likeCount: twin.likeCount,
        followCount: twin.followCount,
        chatCount: twin.chatCount,
        isPublic: twin.isPublic
      },
      userInteraction
    });

  } catch (error) {
    logger.error('Get twin stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get user's liked twins
export const getUserLikedTwins = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const likedTwins = await db.query(`
      SELECT 
        t.id, 
        t."publicHandle", 
        t."bio", 
        t."profileImage",
        u.handle as userHandle, 
        u.name as userName,
        (SELECT COUNT(*)
         FROM "TwinLike" tl2
         WHERE tl2."twinId" = t.id
           AND NOT EXISTS (
             SELECT 1 FROM "TwinBlockedUsers" tbu_self
             WHERE tbu_self."twinId" = t.id AND tbu_self."userId" = tl2."userId"
           )
           AND NOT EXISTS (
             SELECT 1
             FROM "Twin" t2
             JOIN "TwinBlockedUsers" tbu ON tbu."twinId" = t2.id
             WHERE t2."userId" = tl2."userId" AND tbu."userId" = t."userId"
           )
        ) as "likeCount",
        (SELECT COUNT(*)
         FROM "TwinFollow" tf
         WHERE tf."twinId" = t.id
           AND NOT EXISTS (
             SELECT 1 FROM "TwinBlockedUsers" tbu_self
             WHERE tbu_self."twinId" = t.id AND tbu_self."userId" = tf."userId"
           )
           AND NOT EXISTS (
             SELECT 1
             FROM "Twin" t2
             JOIN "TwinBlockedUsers" tbu ON tbu."twinId" = t2.id
             WHERE t2."userId" = tf."userId" AND tbu."userId" = t."userId"
           )
        ) as "followCount",
        (SELECT COUNT(*)
         FROM "PublicMessage" pm
         JOIN "PublicChat" pc ON pm."chatId" = pc.id
         WHERE pc."twinId" = t.id
           AND pm.sender = 'human'
           AND (pc."userId" IS NULL OR pc."userId" <> t."userId")
           AND (
             pc."userId" IS NULL
             OR (
               NOT EXISTS (
                 SELECT 1 FROM "TwinBlockedUsers" tbu_self
                 WHERE tbu_self."twinId" = t.id AND tbu_self."userId" = pc."userId"
               )
               AND NOT EXISTS (
                 SELECT 1
                 FROM "Twin" t2
                 JOIN "TwinBlockedUsers" tbu ON tbu."twinId" = t2.id
                 WHERE t2."userId" = pc."userId" AND tbu."userId" = t."userId"
               )
             )
           )
        ) as "chatCount"
      FROM "TwinLike" tl
      JOIN "Twin" t ON tl."twinId" = t.id
      JOIN "User" u ON t."userId" = u.id
      WHERE tl."userId" = $1 
        AND t."isPublic" = true
        AND NOT EXISTS (
          SELECT 1 FROM "TwinBlockedUsers" tbu
          WHERE tbu."twinId" = t.id AND tbu."userId" = $1
        )
        AND NOT EXISTS (
          SELECT 1
          FROM "TwinBlockedUsers" tbu2
          JOIN "Twin" t_self ON t_self.id = tbu2."twinId"
          WHERE t_self."userId" = $1
            AND tbu2."userId" = t."userId"
        )
      ORDER BY tl."createdAt" DESC
    `, [req.user.id]);

    res.json({
      success: true,
      twins: likedTwins.rows.map(twin => ({
        publicId: tokenizeId(twin.id, 'twin'),
        publicHandle: twin.publicHandle,
        bio: twin.bio,
        profileImage: twin.profileImage,
        likeCount: twin.likeCount,
        followCount: twin.followCount,
        chatCount: twin.chatCount,
        userHandle: twin.userHandle,
        userName: twin.userName
      }))
    });    

  } catch (error) {
    logger.error('Get user liked twins error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get user's followed twins
export const getUserFollowedTwins = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const followedTwins = await db.query(`
      SELECT 
        t.id, 
        t."publicHandle", 
        t."bio", 
        t."profileImage",
        u.handle as userHandle, 
        u.name as userName,
        (SELECT COUNT(*)
         FROM "TwinLike" tl
         WHERE tl."twinId" = t.id
           AND NOT EXISTS (
             SELECT 1 FROM "TwinBlockedUsers" tbu_self
             WHERE tbu_self."twinId" = t.id AND tbu_self."userId" = tl."userId"
           )
           AND NOT EXISTS (
             SELECT 1
             FROM "Twin" t2
             JOIN "TwinBlockedUsers" tbu ON tbu."twinId" = t2.id
             WHERE t2."userId" = tl."userId" AND tbu."userId" = t."userId"
           )
        ) as "likeCount",
        (SELECT COUNT(*)
         FROM "TwinFollow" tf2
         WHERE tf2."twinId" = t.id
           AND NOT EXISTS (
             SELECT 1 FROM "TwinBlockedUsers" tbu_self
             WHERE tbu_self."twinId" = t.id AND tbu_self."userId" = tf2."userId"
           )
           AND NOT EXISTS (
             SELECT 1
             FROM "Twin" t2
             JOIN "TwinBlockedUsers" tbu ON tbu."twinId" = t2.id
             WHERE t2."userId" = tf2."userId" AND tbu."userId" = t."userId"
           )
        ) as "followCount",
        (SELECT COUNT(*)
         FROM "PublicMessage" pm
         JOIN "PublicChat" pc ON pm."chatId" = pc.id
         WHERE pc."twinId" = t.id
           AND pm.sender = 'human'
           AND (pc."userId" IS NULL OR pc."userId" <> t."userId")
           AND (
             pc."userId" IS NULL
             OR (
               NOT EXISTS (
                 SELECT 1 FROM "TwinBlockedUsers" tbu_self
                 WHERE tbu_self."twinId" = t.id AND tbu_self."userId" = pc."userId"
               )
               AND NOT EXISTS (
                 SELECT 1
                 FROM "Twin" t2
                 JOIN "TwinBlockedUsers" tbu ON tbu."twinId" = t2.id
                 WHERE t2."userId" = pc."userId" AND tbu."userId" = t."userId"
               )
             )
           )
        ) as "chatCount"
      FROM "TwinFollow" tf
      JOIN "Twin" t ON tf."twinId" = t.id
      JOIN "User" u ON t."userId" = u.id
      WHERE tf."userId" = $1 
        AND t."isPublic" = true
        AND NOT EXISTS (
          SELECT 1 FROM "TwinBlockedUsers" tbu
          WHERE tbu."twinId" = t.id AND tbu."userId" = $1
        )
        AND NOT EXISTS (
          SELECT 1
          FROM "TwinBlockedUsers" tbu2
          JOIN "Twin" t_self ON t_self.id = tbu2."twinId"
          WHERE t_self."userId" = $1
            AND tbu2."userId" = t."userId"
        )
      ORDER BY tf."createdAt" DESC
    `, [req.user.id]);

    res.json({
      success: true,
      twins: followedTwins.rows.map(twin => ({
        publicId: tokenizeId(twin.id, 'twin'),
        publicHandle: twin.publicHandle,
        bio: twin.bio,
        profileImage: twin.profileImage,
        likeCount: twin.likeCount,
        followCount: twin.followCount,
        chatCount: twin.chatCount,
        userHandle: twin.userHandle,
        userName: twin.userName
      }))
    });    

  } catch (error) {
    logger.error('Get user followed twins error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Toggle like (like if not liked, unlike if liked)
export const toggleLike = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { twinToken } = likeTwinSchema.parse(req.body);

    // ✅ PHASE 2: Detokenize twinToken to get actual twinId
    const decoded = detokenizeId(twinToken);
    if (!decoded || decoded.type !== 'twin') {
      throw createError.validation('Invalid twin token', ErrorCodes.INVALID_INPUT);
    }
    const twinId = decoded.id;

    // Check if twin exists and is public
    const twinResult = await db.query(`
      SELECT id, "isPublic", "allowLikes"
      FROM "Twin"
      WHERE id = $1 AND "isPublic" = true
    `, [twinId]);

    if (twinResult.rows.length === 0) {
      return res.status(404).json({ error: 'Public twin not found' });
    }

    const twin = twinResult.rows[0];

    // ✅ PHASE 4: Check if user is trying to like their own twin
    const twinOwnerCheck = await db.query(`
      SELECT "userId" FROM "Twin" WHERE id = $1
    `, [twinId]);
    
    if (twinOwnerCheck.rows.length > 0 && twinOwnerCheck.rows[0].userId === req.user.id) {
      return res.status(403).json({
        error: 'You cannot like your own twin',
        errorCode: 'OWN_TWIN_INTERACTION'
      });
    }

    // ✅ PHASE 2: Check if likes are allowed    
    if (twin.allowLikes === false) {
      return res.status(403).json({ 
        error: 'Likes are disabled for this twin',
        errorCode: 'LIKES_DISABLED'
      });
    }

    // Check if user already liked this twin
    const existingLike = await twinLikeQueries.findByTwinAndUser(twinId, req.user.id);

    let action, message, likeCount;

    if (existingLike) {
      // Unlike
      await twinLikeQueries.remove(twinId, req.user.id);
      action = 'unliked';
      message = 'Twin unliked successfully';
      
      // Log event
      await EventLogger.logUserEvent(req.user.id, EVENT_TYPES.TWIN_UNLIKED, { twinId });
    } else {
      // Like
      await twinLikeQueries.create(twinId, req.user.id);
      action = 'liked';
      message = 'Twin liked successfully';
      
      // Log event
      await EventLogger.logUserEvent(req.user.id, EVENT_TYPES.TWIN_LIKED, { twinId });
    }

    // Get updated like count
    const updatedTwin = await db.query(`
      SELECT "likeCount" FROM "Twin" WHERE id = $1
    `, [twinId]);

    likeCount = updatedTwin.rows[0].likeCount;

    res.json({
      success: true,
      action,
      message,
      likeCount
    });

  } catch (error) {
    logger.error('Toggle like error:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Invalid input', 
        details: error.errors 
      });
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Toggle follow (follow if not following, unfollow if following)
export const toggleFollow = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { twinToken } = followTwinSchema.parse(req.body);

    // ✅ PHASE 2: Detokenize twinToken to get actual twinId
    const decoded = detokenizeId(twinToken);
    if (!decoded || decoded.type !== 'twin') {
      throw createError.validation('Invalid twin token', ErrorCodes.INVALID_INPUT);
    }
    const twinId = decoded.id;

    // Check if twin exists and is public
    const twinResult = await db.query(`
      SELECT id, "isPublic", "allowFollows"
      FROM "Twin"
      WHERE id = $1 AND "isPublic" = true
    `, [twinId]);

    if (twinResult.rows.length === 0) {
      return res.status(404).json({ error: 'Public twin not found' });
    }

    const twin = twinResult.rows[0];

    // ✅ PHASE 4: Check if user is trying to follow their own twin
    const twinOwnerCheck = await db.query(`
      SELECT "userId" FROM "Twin" WHERE id = $1
    `, [twinId]);
    
    if (twinOwnerCheck.rows.length > 0 && twinOwnerCheck.rows[0].userId === req.user.id) {
      return res.status(403).json({
        error: 'You cannot follow your own twin',
        errorCode: 'OWN_TWIN_INTERACTION'
      });
    }

    // ✅ PHASE 2: Check if follows are allowed    
    if (twin.allowFollows === false) {
      return res.status(403).json({ 
        error: 'Follows are disabled for this twin',
        errorCode: 'FOLLOWS_DISABLED'
      });
    }

    // Check if user already follows this twin
    const existingFollow = await twinFollowQueries.findByTwinAndUser(twinId, req.user.id);

    let action, message, followCount;

    if (existingFollow) {
      // Unfollow
      await twinFollowQueries.remove(twinId, req.user.id);
      action = 'unfollowed';
      message = 'Twin unfollowed successfully';
      
      // Log event
      await EventLogger.logUserEvent(req.user.id, EVENT_TYPES.TWIN_UNFOLLOWED, { twinId });
    } else {
      // Follow
      await twinFollowQueries.create(twinId, req.user.id);
      action = 'followed';
      message = 'Twin followed successfully';
      
      // Log event
      await EventLogger.logUserEvent(req.user.id, EVENT_TYPES.TWIN_FOLLOWED, { twinId });
    }

    // Get updated follow count
    const updatedTwin = await db.query(`
      SELECT "followCount" FROM "Twin" WHERE id = $1
    `, [twinId]);

    followCount = updatedTwin.rows[0].followCount;

    res.json({
      success: true,
      action,
      message,
      followCount
    });

  } catch (error) {
    logger.error('Toggle follow error:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Invalid input', 
        details: error.errors 
      });
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Get users who liked a specific twin
 * GET /api/social/twin/:twinId/likers
 */
export const getTwinLikers = async (req: Request, res: Response) => {
  try {
    const { twinToken } = req.params;

    // ✅ PHASE 2: Detokenize twinToken to get actual twinId
    const decoded = detokenizeId(twinToken);
    if (!decoded || decoded.type !== 'twin') {
      throw createError.validation('Invalid twin token', ErrorCodes.INVALID_INPUT);
    }
    const twinId = decoded.id;

    // Verify twin exists and is public
    const twinResult = await db.query(
      'SELECT id, "isPublic" FROM "Twin" WHERE id = $1',
      [twinId]
    );

    if (twinResult.rows.length === 0) {
      return res.status(404).json({ error: 'Twin not found' });
    }

    // Get users who liked this twin (exclude blocked users)
    const likersResult = await db.query(
      `SELECT 
        u.id,
        u.name,
        u.handle,
        u."profileImage",
        u.email,
        tl."createdAt" as likedAt
       FROM "TwinLike" tl
       JOIN "User" u ON tl."userId" = u.id
       JOIN "Twin" t ON tl."twinId" = t.id
       WHERE tl."twinId" = $1
         AND NOT EXISTS (
           SELECT 1 FROM "TwinBlockedUsers" tbu_self
           WHERE tbu_self."twinId" = tl."twinId" AND tbu_self."userId" = tl."userId"
         )
         AND NOT EXISTS (
           SELECT 1
           FROM "Twin" t2
           JOIN "TwinBlockedUsers" tbu ON tbu."twinId" = t2.id
           WHERE t2."userId" = tl."userId" AND tbu."userId" = t."userId"
         )
       ORDER BY tl."createdAt" DESC
       LIMIT 100`,
      [twinId]
    );

    res.json({
      success: true,
      likers: likersResult.rows.map(row => ({
        publicId: tokenizeId(row.id, 'user'),
        name: row.name,
        handle: row.handle,
        profileImage: row.profileImage,
        likedAt: row.likedAt
        // Don't expose email for privacy
      }))
    });

  } catch (error) {
    logger.error('Get twin likers error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Get users who followed a specific twin
 * GET /api/social/twin/:twinId/followers
 */
export const getTwinFollowers = async (req: Request, res: Response) => {
  try {
    const { twinToken } = req.params;

    // ✅ PHASE 2: Detokenize twinToken to get actual twinId
    const decoded = detokenizeId(twinToken);
    if (!decoded || decoded.type !== 'twin') {
      throw createError.validation('Invalid twin token', ErrorCodes.INVALID_INPUT);
    }
    const twinId = decoded.id;

    // Verify twin exists
    const twinResult = await db.query(
      'SELECT id, "isPublic" FROM "Twin" WHERE id = $1',
      [twinId]
    );

    if (twinResult.rows.length === 0) {
      return res.status(404).json({ error: 'Twin not found' });
    }

    // Get users who followed this twin (exclude blocked users)
    const followersResult = await db.query(
      `SELECT 
        u.id,
        u.name,
        u.handle,
        u."profileImage",
        tf."createdAt" as followedAt
       FROM "TwinFollow" tf
       JOIN "User" u ON tf."userId" = u.id
       JOIN "Twin" t ON tf."twinId" = t.id
       WHERE tf."twinId" = $1
         AND NOT EXISTS (
           SELECT 1 FROM "TwinBlockedUsers" tbu_self
           WHERE tbu_self."twinId" = tf."twinId" AND tbu_self."userId" = tf."userId"
         )
         AND NOT EXISTS (
           SELECT 1
           FROM "Twin" t2
           JOIN "TwinBlockedUsers" tbu ON tbu."twinId" = t2.id
           WHERE t2."userId" = tf."userId" AND tbu."userId" = t."userId"
         )
       ORDER BY tf."createdAt" DESC
       LIMIT 100`,
      [twinId]
    );

    res.json({
      success: true,
      followers: followersResult.rows.map(row => ({
        publicId: tokenizeId(row.id, 'user'),
        name: row.name,
        handle: row.handle,
        profileImage: row.profileImage,
        followedAt: row.followedAt
      }))
    });

  } catch (error) {
    logger.error('Get twin followers error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Get users who chatted with a specific twin
 * GET /api/social/twin/:twinId/chatters
 */
export const getTwinChatters = async (req: Request, res: Response) => {
  try {
    const { twinToken } = req.params;
    
    // ✅ PHASE 2: Detokenize twinToken to get actual twinId
    const decoded = detokenizeId(twinToken);
    if (!decoded || decoded.type !== 'twin') {
      throw createError.validation('Invalid twin token', ErrorCodes.INVALID_INPUT);
    }
    const twinId = decoded.id;

    // Verify twin exists and user owns it
    const twinResult = await db.query(
      'SELECT id, "userId" FROM "Twin" WHERE id = $1',
      [twinId]
    );
    
    if (twinResult.rows.length === 0) {
      return res.status(404).json({ error: 'Twin not found' });
    }

    const twinOwnerId = twinResult.rows[0].userId;
    
    // Get logged-in users who chatted (with message counts) - exclude blocked users
    const loggedInUsersResult = await db.query(
      `SELECT DISTINCT
          u.id,
          u.name,
          u.handle,
          u."profileImage",
          MAX(c."createdAt") as "lastChatAt",
          MIN(c."createdAt") as "firstChatAt",
          COUNT(DISTINCT c.id) as "chatCount",
          COUNT(DISTINCT m.id) as "messageCount"
       FROM "PublicChat" c
       JOIN "User" u ON c."userId" = u.id
       LEFT JOIN "PublicMessage" m ON c.id = m."chatId" AND m.sender = 'human'
       WHERE c."twinId" = $1
         AND c."userId" IS NOT NULL
         AND c."userId" <> $2
         AND EXISTS (
           SELECT 1 FROM "PublicMessage" pm 
           WHERE pm."chatId" = c.id 
           AND pm.sender = 'human'
         )
         AND NOT EXISTS (
           SELECT 1 FROM "TwinBlockedUsers" tbu_self
           WHERE tbu_self."twinId" = $1 AND tbu_self."userId" = c."userId"
         )
         AND NOT EXISTS (
           SELECT 1
           FROM "Twin" t2
           JOIN "TwinBlockedUsers" tbu ON tbu."twinId" = t2.id
           WHERE t2."userId" = c."userId" AND tbu."userId" = $2
         )
       GROUP BY u.id, u.name, u.handle, u."profileImage"
       ORDER BY "lastChatAt" DESC
       LIMIT 100`,
      [twinId, twinOwnerId]
    );
    
    // Get anonymous users (grouped)
    const anonymousResult = await db.query(
      `SELECT 
          COUNT(DISTINCT c.id) as "chatCount",
          COUNT(DISTINCT m.id) as "messageCount",
          MIN(c."createdAt") as "firstChatAt",
          MAX(c."createdAt") as "lastChatAt"
       FROM "PublicChat" c
       LEFT JOIN "PublicMessage" m ON c.id = m."chatId" AND m.sender = 'human'
       WHERE c."twinId" = $1
         AND c."userId" IS NULL
         AND EXISTS (
           SELECT 1 FROM "PublicMessage" pm 
           WHERE pm."chatId" = c.id 
           AND pm.sender = 'human'
         )`,
      [twinId]
    );
    
    const loggedInUsers = loggedInUsersResult.rows.map(row => ({
      publicId: tokenizeId(row.id, 'user'),
      name: row.name,
      handle: row.handle,
      profileImage: row.profileImage,
      lastChatAt: row.lastChatAt,
      firstChatAt: row.firstChatAt,
      chatCount: parseInt(row.chatCount) || 0,
      messageCount: parseInt(row.messageCount) || 0
    }));
    
    // Add anonymous entry if exists
    const anonymousData = anonymousResult.rows[0];
    const anonymousEntry = anonymousData && (parseInt(anonymousData.messageCount) > 0) ? {
      publicId: null,
      name: 'Anonymous Users',
      handle: 'anonymous',
      profileImage: null,
      lastChatAt: anonymousData.lastChatAt,
      firstChatAt: anonymousData.firstChatAt,
      chatCount: parseInt(anonymousData.chatCount) || 0,
      messageCount: parseInt(anonymousData.messageCount) || 0,
      isAnonymous: true
    } : null;
    
    const chatters = anonymousEntry 
      ? [...loggedInUsers, anonymousEntry]
      : loggedInUsers;
    
    res.json({
      success: true,
      chatters: chatters
    });
  } catch (error) {
    logger.error('Get twin chatters error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};