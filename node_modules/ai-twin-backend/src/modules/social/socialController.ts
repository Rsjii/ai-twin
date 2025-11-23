import { Request, Response } from 'express';
import { db, twinLikeQueries, twinFollowQueries } from '../../config/database';
import { logger } from '../../config/logger';
import { EventLogger } from '../../services/eventLogger';
import { z } from 'zod';

// Validation schemas
const likeTwinSchema = z.object({
  twinId: z.string().min(1, 'Twin ID is required')
});

const followTwinSchema = z.object({
  twinId: z.string().min(1, 'Twin ID is required')
});

// Like a twin
export const likeTwin = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { twinId } = likeTwinSchema.parse(req.body);

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
    await EventLogger.logUserEvent(req.user.id, 'twin_liked', {
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

    const { twinId } = likeTwinSchema.parse(req.body);

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
    await EventLogger.logUserEvent(req.user.id, 'twin_unliked', {
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

    const { twinId } = followTwinSchema.parse(req.body);

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
    await EventLogger.logUserEvent(req.user.id, 'twin_followed', {
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

    const { twinId } = followTwinSchema.parse(req.body);

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
    await EventLogger.logUserEvent(req.user.id, 'twin_unfollowed', {
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
    const { twinId } = req.params;

    if (!twinId) {
      return res.status(400).json({ error: 'Twin ID is required' });
    }

    // Get twin stats
    const twinResult = await db.query(`
      SELECT "likeCount", "followCount", "chatCount", "isPublic"
      FROM "Twin"
      WHERE id = $1
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
      SELECT t.id, t."publicHandle", t."bio", t."profileImage", t."likeCount", t."followCount", t."chatCount",
             u.handle as userHandle, u.name as userName
      FROM "TwinLike" tl
      JOIN "Twin" t ON tl."twinId" = t.id
      JOIN "User" u ON t."userId" = u.id
      WHERE tl."userId" = $1 AND t."isPublic" = true
      ORDER BY tl."createdAt" DESC
    `, [req.user.id]);

    res.json({
      success: true,
      twins: likedTwins.rows
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
      SELECT t.id, t."publicHandle", t."bio", t."profileImage", t."likeCount", t."followCount", t."chatCount",
             u.handle as userHandle, u.name as userName
      FROM "TwinFollow" tf
      JOIN "Twin" t ON tf."twinId" = t.id
      JOIN "User" u ON t."userId" = u.id
      WHERE tf."userId" = $1 AND t."isPublic" = true
      ORDER BY tf."createdAt" DESC
    `, [req.user.id]);

    res.json({
      success: true,
      twins: followedTwins.rows
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

    const { twinId } = likeTwinSchema.parse(req.body);

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
      await EventLogger.logUserEvent(req.user.id, 'twin_unliked', { twinId });
    } else {
      // Like
      await twinLikeQueries.create(twinId, req.user.id);
      action = 'liked';
      message = 'Twin liked successfully';
      
      // Log event
      await EventLogger.logUserEvent(req.user.id, 'twin_liked', { twinId });
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

    const { twinId } = followTwinSchema.parse(req.body);

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
      await EventLogger.logUserEvent(req.user.id, 'twin_unfollowed', { twinId });
    } else {
      // Follow
      await twinFollowQueries.create(twinId, req.user.id);
      action = 'followed';
      message = 'Twin followed successfully';
      
      // Log event
      await EventLogger.logUserEvent(req.user.id, 'twin_followed', { twinId });
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
    const { twinId } = req.params;

    // Verify twin exists and is public
    const twinResult = await db.query(
      'SELECT id, "isPublic" FROM "Twin" WHERE id = $1',
      [twinId]
    );

    if (twinResult.rows.length === 0) {
      return res.status(404).json({ error: 'Twin not found' });
    }

    // Get users who liked this twin
    const likersResult = await db.query(
      `SELECT 
        u.id,
        u.name,
        u.handle,
        u.email,
        tl."createdAt" as likedAt
       FROM "TwinLike" tl
       JOIN "User" u ON tl."userId" = u.id
       WHERE tl."twinId" = $1
       ORDER BY tl."createdAt" DESC
       LIMIT 100`,
      [twinId]
    );

    res.json({
      success: true,
      likers: likersResult.rows.map(row => ({
        id: row.id,
        name: row.name,
        handle: row.handle,
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
    const { twinId } = req.params;

    // Verify twin exists
    const twinResult = await db.query(
      'SELECT id, "isPublic" FROM "Twin" WHERE id = $1',
      [twinId]
    );

    if (twinResult.rows.length === 0) {
      return res.status(404).json({ error: 'Twin not found' });
    }

    // Get users who followed this twin
    const followersResult = await db.query(
      `SELECT 
        u.id,
        u.name,
        u.handle,
        tf."createdAt" as followedAt
       FROM "TwinFollow" tf
       JOIN "User" u ON tf."userId" = u.id
       WHERE tf."twinId" = $1
       ORDER BY tf."createdAt" DESC
       LIMIT 100`,
      [twinId]
    );

    res.json({
      success: true,
      followers: followersResult.rows.map(row => ({
        id: row.id,
        name: row.name,
        handle: row.handle,
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
    const { twinId } = req.params;
    
    // Verify twin exists and user owns it
    const twinResult = await db.query(
      'SELECT id, "userId" FROM "Twin" WHERE id = $1',
      [twinId]
    );
    
    if (twinResult.rows.length === 0) {
      return res.status(404).json({ error: 'Twin not found' });
    }
    
    // Get users who have chatted with this twin
    const chattersResult = await db.query(
      `SELECT DISTINCT
        u.id,
        u.name,
        u.handle,
        u."profileImage",
        MAX(c."createdAt") as "lastChatAt",
        COUNT(DISTINCT c.id) as "chatCount"
       FROM "Chat" c
       JOIN "User" u ON c."userId" = u.id
       WHERE c."twinId" = $1
       GROUP BY u.id, u.name, u.handle, u."profileImage"
       ORDER BY "lastChatAt" DESC
       LIMIT 100`,
      [twinId]
    );
    
    res.json({
      success: true,
      chatters: chattersResult.rows.map(row => ({
        id: row.id,
        name: row.name,
        handle: row.handle,
        profileImage: row.profileImage,
        lastChatAt: row.lastChatAt,
        chatCount: parseInt(row.chatCount) || 0
      }))
    });
  } catch (error) {
    logger.error('Get twin chatters error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};