import { Request, Response } from 'express';
import { db } from '../../config/database';
import { logger } from '../../config/logger';
import { EventLogger } from '../../services/eventLogger';
import { z } from 'zod';

// Privacy settings interface
export interface TwinPrivacySettings {
  showChatHistory: boolean;
  requireLogin: boolean;
  blockNonLoggedUsers?: boolean;
  allowLikes: boolean;
  allowFollows: boolean;
  allowShares: boolean;
  blockSpecificUsers: string[];
}

// Validation schemas
const updatePrivacySettingsSchema = z.object({
  twinId: z.string().min(1, 'Twin ID is required'),
  settings: z.object({
    showChatHistory: z.boolean().optional(),
    requireLogin: z.boolean().optional(),
    blockNonLoggedUsers: z.boolean().optional(),
    allowLikes: z.boolean().optional(),
    allowFollows: z.boolean().optional(),
    allowShares: z.boolean().optional(),
    blockSpecificUsers: z.array(z.string()).optional(),
  })
});

const blockUserSchema = z.object({
  twinId: z.string().min(1, 'Twin ID is required'),
  userId: z.string().min(1, 'User ID is required').optional(),
  userHandle: z.string().min(1, 'User handle is required').optional()
}).refine(data => data.userId || data.userHandle, {
  message: 'Either userId or userHandle must be provided'
});

// Update privacy settings for a twin
export const updatePrivacySettings = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { twinId, settings } = updatePrivacySettingsSchema.parse(req.body);

    // Verify twin belongs to user
    const twinResult = await db.query(`
      SELECT id, "userId", "isPublic"
      FROM "Twin"
      WHERE id = $1 AND "userId" = $2
    `, [twinId, req.user.id]);

    if (twinResult.rows.length === 0) {
      return res.status(404).json({ error: 'Twin not found or not owned by user' });
    }

    // Update privacy settings in Twin table
    const updateFields = [];
    const updateValues = [];
    let paramIndex = 1;

    if (settings.showChatHistory !== undefined) {
      updateFields.push(`"showChatHistory" = $${paramIndex}`);
      updateValues.push(settings.showChatHistory);
      paramIndex++;
    }

    if (settings.requireLogin !== undefined) {
      updateFields.push(`"requireLogin" = $${paramIndex}`);
      updateValues.push(settings.requireLogin);
      paramIndex++;
    }

    // Update updatePrivacySettings function (add after line 73)
    if (settings.blockNonLoggedUsers !== undefined) {
      updateFields.push(`"blockNonLoggedUsers" = $${paramIndex}`);
      updateValues.push(settings.blockNonLoggedUsers);
      paramIndex++;
    }

    if (settings.allowLikes !== undefined) {
      updateFields.push(`"allowLikes" = $${paramIndex}`);
      updateValues.push(settings.allowLikes);
      paramIndex++;
    }

    if (settings.allowFollows !== undefined) {
      updateFields.push(`"allowFollows" = $${paramIndex}`);
      updateValues.push(settings.allowFollows);
      paramIndex++;
    }

    if (settings.allowShares !== undefined) {
      updateFields.push(`"allowShares" = $${paramIndex}`);
      updateValues.push(settings.allowShares);
      paramIndex++;
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No valid settings provided' });
    }

    // Add twinId and userId to values
    updateValues.push(twinId, req.user.id);

    const updateQuery = `
      UPDATE "Twin"
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex} AND "userId" = $${paramIndex + 1}
      RETURNING *
    `;

    const result = await db.query(updateQuery, updateValues);

    // Handle blocked users separately
    if (settings.blockSpecificUsers !== undefined) {
      // First, remove existing blocks
      await db.query(`
        DELETE FROM "TwinBlockedUsers"
        WHERE "twinId" = $1
      `, [twinId]);

      // Add new blocks
      if (settings.blockSpecificUsers.length > 0) {
        const blockValues = settings.blockSpecificUsers.map((userId, index) => 
          `($${index * 3 + 1}, $${index * 3 + 2}, $${index * 3 + 3})`
        ).join(', ');

        const blockQuery = `
          INSERT INTO "TwinBlockedUsers" ("id", "twinId", "userId", "createdAt")
          VALUES ${blockValues}
        `;

        const blockParams = settings.blockSpecificUsers.flatMap(userId => [
          `block_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          twinId,
          userId
        ]);

        await db.query(blockQuery, blockParams);
      }
    }

    // Log privacy settings update
    await EventLogger.logUserEvent(req.user.id, 'privacy_settings_updated', {
      twinId,
      settings: settings
    });

    res.json({
      success: true,
      message: 'Privacy settings updated successfully',
      twin: result.rows[0]
    });

  } catch (error) {
    logger.error('Update privacy settings error:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Invalid input', 
        details: error.errors 
      });
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get privacy settings for a twin
export const getPrivacySettings = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { twinId } = req.params;

    // Verify twin belongs to user
    const twinResult = await db.query(`
    SELECT id, "userId", "showChatHistory", "requireLogin", 
       "blockNonLoggedUsers", "allowLikes", "allowFollows", "allowShares"             
      FROM "Twin"
      WHERE id = $1 AND "userId" = $2
    `, [twinId, req.user.id]);

    if (twinResult.rows.length === 0) {
      return res.status(404).json({ error: 'Twin not found or not owned by user' });
    }

    // Get blocked users
    const blockedUsersResult = await db.query(`
      SELECT u.id, u.handle, u.name
      FROM "TwinBlockedUsers" tbu
      JOIN "User" u ON tbu."userId" = u.id
      WHERE tbu."twinId" = $1
    `, [twinId]);

    const twin = twinResult.rows[0];
    const blockedUsers = blockedUsersResult.rows;

    res.json({
      success: true,
      settings: {
        showChatHistory: twin.showChatHistory ?? true,
        requireLogin: twin.requireLogin ?? false,
        blockNonLoggedUsers: twin.blockNonLoggedUsers ?? false,
        allowLikes: twin.allowLikes ?? true,
        allowFollows: twin.allowFollows ?? true,
        allowShares: twin.allowShares ?? true,
        blockedUsers: blockedUsers
      }
    });    

  } catch (error) {
    logger.error('Get privacy settings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Block a user from interacting with a twin
export const blockUser = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { twinId, userId, userHandle } = blockUserSchema.parse(req.body);

    // ✅ PHASE 2: Convert userHandle to userId if provided
    let targetUserId = userId;

    if(userHandle && !userId) {
      const userResult = await db.query(`
        SELECT id FROM "User"
        WHERE handle = $1 or email = $1
      `, [userHandle]);

      if(userResult.rows.length === 0) {
        return res.status(404).json({ 
          error: 'User not found',
          errorCode: 'USER_NOT_FOUND',
          details: `No user found with handle or email: ${userHandle}`
        });
      }
      targetUserId = userResult.rows[0].id;
    }

    if(!targetUserId) {
      return res.status(400).json({ 
        error: 'User ID is required',
        errorCode: 'MISSING_USER_ID',
        details: 'Either userId or userHandle must be provided'
      });
    }

    // Verify twin belongs to user
    const twinResult = await db.query(`
      SELECT id, "userId"
      FROM "Twin"
      WHERE id = $1 AND "userId" = $2
    `, [twinId, req.user.id]);

    if (twinResult.rows.length === 0) {
      return res.status(404).json({ error: 'Twin not found or not owned by user' });
    }

    // Check if user is already blocked
    const existingBlock = await db.query(`
      SELECT id FROM "TwinBlockedUsers"
      WHERE "twinId" = $1 AND "userId" = $2
    `, [twinId, targetUserId]);

    if (existingBlock.rows.length > 0) {
      return res.status(400).json({ error: 'User is already blocked' });
    }

    // Block the user
    await db.query(`
      INSERT INTO "TwinBlockedUsers" ("id", "twinId", "userId", "createdAt")
      VALUES ($1, $2, $3, NOW())
    `, [
      `block_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      twinId,
      targetUserId
    ]);

    // Log block event
    await EventLogger.logUserEvent(req.user.id, 'user_blocked', {
      twinId,
      blockedUserId: targetUserId
    });

    res.json({
      success: true,
      message: 'User blocked successfully'
    });

  } catch (error) {
    logger.error('Block user error:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Invalid input', 
        details: error.errors 
      });
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Unblock a user
export const unblockUser = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { twinId, userId } = blockUserSchema.parse(req.body);

    // Verify twin belongs to user
    const twinResult = await db.query(`
      SELECT id, "userId"
      FROM "Twin"
      WHERE id = $1 AND "userId" = $2
    `, [twinId, req.user.id]);

    if (twinResult.rows.length === 0) {
      return res.status(404).json({ error: 'Twin not found or not owned by user' });
    }

    // Remove block
    const result = await db.query(`
      DELETE FROM "TwinBlockedUsers"
      WHERE "twinId" = $1 AND "userId" = $2
    `, [twinId, userId]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'User is not blocked' });
    }

    // Log unblock event
    await EventLogger.logUserEvent(req.user.id, 'user_unblocked', {
      twinId,
      unblockedUserId: userId
    });

    res.json({
      success: true,
      message: 'User unblocked successfully'
    });

  } catch (error) {
    logger.error('Unblock user error:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Invalid input', 
        details: error.errors 
      });
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Check if a user is blocked from a twin
export const isUserBlocked = async (req: Request, res: Response) => {
  try {
    const { twinId, userId } = req.params;

    const result = await db.query(`
      SELECT id FROM "TwinBlockedUsers"
      WHERE "twinId" = $1 AND "userId" = $2
    `, [twinId, userId]);

    res.json({
      success: true,
      isBlocked: result.rows.length > 0
    });

  } catch (error) {
    logger.error('Check user blocked error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get privacy analytics for a twin
export const getPrivacyAnalytics = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { twinId } = req.params;

    // Verify twin belongs to user
    const twinResult = await db.query(`
      SELECT id, "userId"
      FROM "Twin"
      WHERE id = $1 AND "userId" = $2
    `, [twinId, req.user.id]);

    if (twinResult.rows.length === 0) {
      return res.status(404).json({ error: 'Twin not found or not owned by user' });
    }

    // Get privacy-related analytics
    const analytics = await db.query(`
      SELECT 
        COUNT(CASE WHEN type = 'public_chat_started' THEN 1 END) as total_public_chats,
        COUNT(CASE WHEN type = 'twin_liked' THEN 1 END) as total_likes,
        COUNT(CASE WHEN type = 'twin_followed' THEN 1 END) as total_follows,
        COUNT(CASE WHEN type = 'twin_shared' THEN 1 END) as total_shares,
        COUNT(CASE WHEN type = 'user_blocked' THEN 1 END) as total_blocks,
        COUNT(CASE WHEN type = 'privacy_settings_updated' THEN 1 END) as settings_updates
      FROM "Event"
      WHERE meta->>'twinId' = $1
      AND "createdAt" >= NOW() - INTERVAL '30 days'
    `, [twinId]);

    const stats = analytics.rows[0];

    res.json({
      success: true,
      analytics: {
        totalPublicChats: parseInt(stats.total_public_chats) || 0,
        totalLikes: parseInt(stats.total_likes) || 0,
        totalFollows: parseInt(stats.total_follows) || 0,
        totalShares: parseInt(stats.total_shares) || 0,
        totalBlocks: parseInt(stats.total_blocks) || 0,
        settingsUpdates: parseInt(stats.settings_updates) || 0
      }
    });

  } catch (error) {
    logger.error('Get privacy analytics error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
