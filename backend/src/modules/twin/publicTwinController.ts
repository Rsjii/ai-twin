import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth';
import { db, publicTwinQueries, userQueries } from '../../config/database';
import { logger } from '../../config/logger';
import { EventLogger } from '../../services/eventLogger';
import { z } from 'zod';
import { AppError, createError, ErrorCodes } from '../../utils/errors';
import { title } from 'process';

// Validation schemas
const makePublicSchema = z.object({
  twinId: z.string().min(1, 'Twin ID is required'),
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
export const makeTwinPublic = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw createError.unauthorized('Authentication required');
    }

    const { twinId, publicHandle, bio, profileImage } = makePublicSchema.parse(req.body);

    // Get user's twin
    const twinResult = await db.query(`
      SELECT id, "isPublic", "publicHandle"
      FROM "Twin"
      WHERE "userId" = $1 and id = $2
      LIMIT 1
    `, [req.user.id, twinId]);

    if (twinResult.rows.length === 0) {
      throw createError.notFound('No twin found. Create a twin first.', ErrorCodes.TWIN_NOT_FOUND);
    }

    const twin = twinResult.rows[0];

    // Check if already public
    if (twin.isPublic) {
      throw createError.conflict('Twin is already public');
    }

    // Check if handle is already taken
    const existingHandle = await db.query(`
      SELECT id FROM "Twin" WHERE "publicHandle" = $1 AND id != $2
    `, [publicHandle, twin.id]);

    if (existingHandle.rows.length > 0) {
      throw createError.conflict('This handle is already taken');
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
    if (error instanceof AppError) {
      throw error;
    }
    throw createError.internal('Failed to make twin public', error);
  }
};

// Make twin private
export const makeTwinPrivate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw createError.unauthorized('Authentication required');
    }

    const { twinId } = req.body;

    if (!twinId) {
      throw createError.validation('Twin ID is required');
    }

    // Get user's specific twin
    const twinResult = await db.query(`
      SELECT id, "isPublic"
      FROM "Twin"
      WHERE "userId" = $1 and id = $2
      LIMIT 1
    `, [req.user.id, twinId]);

    if (twinResult.rows.length === 0) {
      throw createError.notFound('No twin found', ErrorCodes.TWIN_NOT_FOUND);
    }

    const twin = twinResult.rows[0];

    if (!twin.isPublic) {
      throw createError.conflict('Twin is already private');
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
    if (error instanceof AppError) {
      throw error;
    }
    throw createError.internal('Failed to make twin private', error);
  }
};

// Update twin profile
export const updateTwinProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw createError.unauthorized('Authentication required');
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
      throw createError.notFound('No twin found', ErrorCodes.TWIN_NOT_FOUND);
    }

    const twin = twinResult.rows[0];

    // If updating public handle, check if it's available
    if (updateData.publicHandle && updateData.publicHandle !== twin.publicHandle) {
      const existingHandle = await db.query(`
        SELECT id FROM "Twin" WHERE "publicHandle" = $1 AND id != $2
      `, [updateData.publicHandle, twin.id]);

      if (existingHandle.rows.length > 0) {
        throw createError.conflict('This handle is already taken');
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
    if (error instanceof AppError) {
      throw error;
    }
    throw createError.internal('Failed to update twin profile', error);
  }
};

// Get public twin profile by handle
export const getPublicTwinProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { handle } = req.params;

    if (!handle) {
      throw createError.validation('Handle is required');
    }

    const publicTwin = await publicTwinQueries.findByPublicHandle(handle);

    if (!publicTwin) {
      throw createError.notFound('Public twin not found', ErrorCodes.TWIN_NOT_FOUND);
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
    if (error instanceof AppError) {
      throw error;
    }
    throw createError.internal('Failed to get public twin profile', error);
  }
};

// Get user's own twin profile (with all data)
export const getMyTwinProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        errorCode: 'UNAUTHORIZED'
      });
    }

    const twinResult = await db.query(`
      SELECT t.*, u.handle as userHandle, u.name as userName
      FROM "Twin" t
      JOIN "User" u ON t."userId" = u.id
      WHERE t."userId" = $1
      LIMIT 1
    `, [req.user.id]);

    if (twinResult.rows.length === 0) {
      // Return JSON instead of throwing - user doesn't have a twin yet
      return res.status(404).json({
        success: false,
        error: 'No twin found. Please create a twin first.',
        errorCode: 'TWIN_NOT_FOUND',
        hasTwin: false
      });
    }

    const twin = twinResult.rows[0];

    // Get User's personaData and onboarding status
    const userResult = await db.query(`
      SELECT "personaData", "onboardingCompleted" 
      FROM "User" 
      WHERE id = $1
    `, [req.user.id]);
    
    const userData = userResult?.rows?.[0] || {};

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
        personaData: twin.personaData,        // ✅ Complete onboarding data
        systemPrompt: twin.systemPrompt,      // ✅ Generated system prompt
        createdAt: twin.createdAt,
        userHandle: twin.userHandle,
        userName: twin.userName
      },
      user: {
        personaData: userData.personaData,           // ✅ User's stored personaData
        onboardingCompleted: userData.onboardingCompleted || false
      }
    });

  } catch (error: any) {
    logger.error('getMyTwinProfile error:', error);
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        error: error.message,
        errorCode: error.errorCode
      });
    }
    return res.status(500).json({
      success: false,
      error: 'Failed to get twin profile',
      errorCode: 'INTERNAL_ERROR'
    });
  }
};

// Line 312: Change to AuthenticatedRequest to get userId
export const getPublicChatPage = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { twinId } = req.params;
    // Get chatId from query params - handle both string and array
    const chatIdParam = req.query.chatId;
    const chatId = Array.isArray(chatIdParam) ? chatIdParam[0] : (chatIdParam as string);
    const userId = req.user?.id; // Get userId if logged in
    
    logger.info('getPublicChatPage:', { twinId, chatId, userId });
    
// First, check if twin exists and get basic info
const twinCheck = await db.query(`
  SELECT id, "isPublic", "blockNonLoggedUsers", "publicHandle"
  FROM "Twin" t
  WHERE t.id = $1
`, [twinId]);

if (twinCheck.rows.length === 0) {
  logger.warn('getPublicChatPage: Twin not found', { twinId, userId });
  throw createError.notFound('Twin not found', ErrorCodes.TWIN_NOT_FOUND);
}

const twinInfo = twinCheck.rows[0];

// Check if twin is public
if (!twinInfo.isPublic) {
  logger.warn('getPublicChatPage: Twin is not public', { twinId, userId, isPublic: twinInfo.isPublic });
  throw createError.notFound('Twin is not public', ErrorCodes.TWIN_NOT_FOUND);
}

// Note: blockNonLoggedUsers only affects discover page visibility, not direct access
// Non-logged users can still access public chat pages directly via URL

// Get full twin details (we know it exists and is accessible)
const twinResult = await db.query(`
  SELECT id, "publicHandle", "sampleReply", "isPublic", "profileImage", bio, "requireLogin"
  FROM "Twin" t
  WHERE t.id = $1
`, [twinId]);

if (twinResult.rows.length === 0) {
  logger.error('getPublicChatPage: Unexpected error - twin disappeared', { twinId, userId });
  throw createError.notFound('Public twin not found', ErrorCodes.TWIN_NOT_FOUND);
}

const twin = twinResult.rows[0];    

    // If chatId provided, validate it belongs to user
    let initialChatId = null;
    if (chatId && userId) {
      const chatResult = await db.query(`
        SELECT id FROM "PublicChat" 
        WHERE id = $1 AND "twinId" = $2 AND "userId" = $3
      `, [chatId, twinId, userId]);
      
      if (chatResult && chatResult.rows && chatResult.rows.length > 0) {
        initialChatId = chatId;
        logger.info('Valid chatId found:', { chatId, twinId, userId });
      } else {
        logger.warn('ChatId not found or not owned by user:', { chatId, twinId, userId });
      }
    } else if (chatId && !userId) {
      // If no userId but chatId provided, still try to use it (for anonymous users)
      initialChatId = chatId;
      logger.info('Using chatId without userId validation:', { chatId });
    }
    
    // Fetch full user data from database (like getDiscover)
    let user = null;
    if (req.user) {
      const fullUser = await userQueries.findByEmail(req.user.email);
      if (fullUser) {
        user = {
          id: fullUser.id,
          email: fullUser.email,
          handle: fullUser.handle,
          name: fullUser.name,
          profileImage: fullUser.profileImage,
        };
      }
    }
    
    // Render with twin data and optional initial chatId
    res.render('public-chat', { 
      title: 'Public Chat - AI Twin',
      user: user,
      twin, 
      initialChatId,
      requiresLogin: twin.requireLogin && !userId,
      csrfToken: req.csrfToken?.() || ''
    });
    
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw createError.internal('Failed to load public chat page', error);
  }
};

// ✅ PHASE 2: Check if twin belongs to current user
export const checkTwinOwner = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.json({
        isOwner: false
      });
    }

    const { twinId } = req.params;
    
    const twinResult = await db.query(`
      SELECT "userId" FROM "Twin" WHERE id = $1
    `, [twinId]);

    if (twinResult.rows.length === 0) {
      return res.json({
        isOwner: false
      });
    }

    const isOwner = twinResult.rows[0].userId === req.user.id;

    res.json({
      isOwner
    });
  } catch (error) {
    logger.error('Check twin owner error:', error);
    res.json({
      isOwner: false
    });
  }
};