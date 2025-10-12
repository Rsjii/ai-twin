import { Request, Response } from 'express';
import { db, publicTwinQueries } from '../../config/database';
import { logger } from '../../config/logger';
import { EventLogger } from '../../services/eventLogger';
import { z } from 'zod';

// Validation schemas
const makePublicSchema = z.object({
  publicHandle: z.string()
    .min(3, 'Handle must be at least 3 characters')
    .max(30, 'Handle must be less than 30 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Handle can only contain letters, numbers, hyphens, and underscores'),
  bio: z.string().max(500, 'Bio must be less than 500 characters').optional(),
  profileImage: z.string().url('Profile image must be a valid URL').optional()
});

const updateProfileSchema = z.object({
  bio: z.string().max(500, 'Bio must be less than 500 characters').optional(),
  profileImage: z.string().url('Profile image must be a valid URL').optional(),
  publicHandle: z.string()
    .min(3, 'Handle must be at least 3 characters')
    .max(30, 'Handle must be less than 30 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Handle can only contain letters, numbers, hyphens, and underscores')
    .optional()
});

// Make twin public
export const makeTwinPublic = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { publicHandle, bio, profileImage } = makePublicSchema.parse(req.body);

    // Get user's twin
    const twinResult = await db.query(`
      SELECT id, "isPublic", "publicHandle"
      FROM "Twin"
      WHERE "userId" = $1
      LIMIT 1
    `, [req.user.id]);

    if (twinResult.rows.length === 0) {
      return res.status(404).json({ error: 'No twin found. Create a twin first.' });
    }

    const twin = twinResult.rows[0];

    // Check if already public
    if (twin.isPublic) {
      return res.status(400).json({ error: 'Twin is already public' });
    }

    // Check if handle is already taken
    const existingHandle = await db.query(`
      SELECT id FROM "Twin" WHERE "publicHandle" = $1 AND id != $2
    `, [publicHandle, twin.id]);

    if (existingHandle.rows.length > 0) {
      return res.status(400).json({ error: 'This handle is already taken' });
    }

    // Make twin public
    const updatedTwin = await publicTwinQueries.makePublic(
      twin.id,
      publicHandle,
      bio,
      profileImage
    );

    // Log event
    await EventLogger.logUserEvent(req.user.id, 'twin_made_public', {
      twinId: twin.id,
      publicHandle,
      bio: bio?.length || 0
    });

    res.json({
      success: true,
      message: 'Twin is now public!',
      twin: {
        id: updatedTwin.id,
        publicHandle: updatedTwin.publicHandle,
        bio: updatedTwin.bio,
        profileImage: updatedTwin.profileImage,
        isPublic: updatedTwin.isPublic
      }
    });

  } catch (error) {
    logger.error('Make twin public error:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Invalid input', 
        details: error.errors 
      });
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Make twin private
export const makeTwinPrivate = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Get user's twin
    const twinResult = await db.query(`
      SELECT id, "isPublic"
      FROM "Twin"
      WHERE "userId" = $1
      LIMIT 1
    `, [req.user.id]);

    if (twinResult.rows.length === 0) {
      return res.status(404).json({ error: 'No twin found' });
    }

    const twin = twinResult.rows[0];

    if (!twin.isPublic) {
      return res.status(400).json({ error: 'Twin is already private' });
    }

    // Make twin private
    await publicTwinQueries.makePrivate(twin.id);

    // Log event
    await EventLogger.logUserEvent(req.user.id, 'twin_made_private', {
      twinId: twin.id
    });

    res.json({
      success: true,
      message: 'Twin is now private'
    });

  } catch (error) {
    logger.error('Make twin private error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Update twin profile
export const updateTwinProfile = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const updateData = updateProfileSchema.parse(req.body);

    // Get user's twin
    const twinResult = await db.query(`
      SELECT id, "isPublic", "publicHandle"
      FROM "Twin"
      WHERE "userId" = $1
      LIMIT 1
    `, [req.user.id]);

    if (twinResult.rows.length === 0) {
      return res.status(404).json({ error: 'No twin found' });
    }

    const twin = twinResult.rows[0];

    // If updating public handle, check if it's available
    if (updateData.publicHandle && updateData.publicHandle !== twin.publicHandle) {
      const existingHandle = await db.query(`
        SELECT id FROM "Twin" WHERE "publicHandle" = $1 AND id != $2
      `, [updateData.publicHandle, twin.id]);

      if (existingHandle.rows.length > 0) {
        return res.status(400).json({ error: 'This handle is already taken' });
      }
    }

    // Update profile
    const updatedTwin = await publicTwinQueries.updateProfile(
      twin.id,
      updateData.bio,
      updateData.profileImage,
      updateData.publicHandle
    );

    res.json({
      success: true,
      message: 'Profile updated successfully',
      twin: {
        id: updatedTwin.id,
        publicHandle: updatedTwin.publicHandle,
        bio: updatedTwin.bio,
        profileImage: updatedTwin.profileImage,
        isPublic: updatedTwin.isPublic
      }
    });

  } catch (error) {
    logger.error('Update twin profile error:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Invalid input', 
        details: error.errors 
      });
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get public twin profile by handle
export const getPublicTwinProfile = async (req: Request, res: Response) => {
  try {
    const { handle } = req.params;

    if (!handle) {
      return res.status(400).json({ error: 'Handle is required' });
    }

    const publicTwin = await publicTwinQueries.findByPublicHandle(handle);

    if (!publicTwin) {
      return res.status(404).json({ error: 'Public twin not found' });
    }

    // Return public data only (no sensitive information)
    res.json({
      success: true,
      twin: {
        id: publicTwin.id,
        publicHandle: publicTwin.publicHandle,
        bio: publicTwin.bio,
        profileImage: publicTwin.profileImage,
        verified: publicTwin.verified,
        likeCount: publicTwin.likeCount,
        followCount: publicTwin.followCount,
        chatCount: publicTwin.chatCount,
        sampleReply: publicTwin.sampleReply,
        createdAt: publicTwin.createdAt,
        userHandle: publicTwin.userHandle,
        userName: publicTwin.userName
      }
    });

  } catch (error) {
    logger.error('Get public twin profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get user's own twin profile (with all data)
export const getMyTwinProfile = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const twinResult = await db.query(`
      SELECT t.*, u.handle as userHandle, u.name as userName
      FROM "Twin" t
      JOIN "User" u ON t."userId" = u.id
      WHERE t."userId" = $1
      LIMIT 1
    `, [req.user.id]);

    if (twinResult.rows.length === 0) {
      return res.status(404).json({ error: 'No twin found' });
    }

    const twin = twinResult.rows[0];

    res.json({
      success: true,
      twin: {
        id: twin.id,
        isPublic: twin.isPublic,
        publicHandle: twin.publicHandle,
        bio: twin.bio,
        profileImage: twin.profileImage,
        verified: twin.verified,
        likeCount: twin.likeCount,
        followCount: twin.followCount,
        chatCount: twin.chatCount,
        styleVector: twin.styleVector,
        sampleReply: twin.sampleReply,
        createdAt: twin.createdAt,
        userHandle: twin.userHandle,
        userName: twin.userName
      }
    });

  } catch (error) {
    logger.error('Get my twin profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
