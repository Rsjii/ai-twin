import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth';
import { db, publicTwinQueries, userQueries, publicChatQueries } from '../../config/database';
import { logger } from '../../config/logger';
import { EventLogger } from '../../services/eventLogger';
import { z } from 'zod';
import { createError, ErrorCodes } from '../../utils/errors';
import { verifyTwinOwnership } from '../../utils/twinUtils';
import { handleControllerError } from '../../utils/errorHandler';
import {twinQueries} from '../../config/database';
import { detokenizeId, sanitizeTwin, tokenizeId } from '../../utils/idTokenization';

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

    await verifyTwinOwnership(twinId, req.user.id);

    // Get twin data after verification
    const twinResult = await db.query(`
      SELECT id, "isPublic", "publicHandle"
      FROM "Twin"
      WHERE id = $1
      LIMIT 1
    `, [twinId]);

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
    handleControllerError(error, 'Failed to make twin public');
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

    await verifyTwinOwnership(twinId, req.user.id);

    // Get twin data after verification
    const twinResult = await db.query(`
      SELECT id, "isPublic"
      FROM "Twin"
      WHERE id = $1
      LIMIT 1
    `, [twinId]);

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
    handleControllerError(error, 'Failed to make twin private');
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
    handleControllerError(error, 'Failed to update twin profile');
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
    const sanitizedTwin = sanitizeTwin(publicTwin);
    res.json({
      success: true,
      twin: {
        ...sanitizedTwin,
        sampleReply: publicTwin.sampleReply,
        userHandle: publicTwin.userHandle,
        userName: publicTwin.userName
      }
    });

  } catch (error) {
    handleControllerError(error, 'Failed to get public twin profile');
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

    const sanitizedTwin = sanitizeTwin(twin);

    res.json({
      success: true,
      twin: {
        ...sanitizedTwin, // ✅ Already has publicId, no raw id
        styleVector: twin.styleVector,
        sampleReply: twin.sampleReply,
        personaData: twin.personaData,
        systemPrompt: twin.systemPrompt,
        createdAt: twin.createdAt,
        userHandle: twin.userHandle,
        userName: twin.userName
      },
      user: {
        personaData: userData.personaData,
        onboardingCompleted: userData.onboardingCompleted || false
      }
    });

  } catch (error: any) {
    logger.error('getMyTwinProfile error:', error);
    handleControllerError(error, 'Failed to get twin profile');
  }
};

// Line 312: Change to AuthenticatedRequest to get userId
export const getPublicChatPage = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { twinToken } = req.params;
    // ✅ ADD: Extract chatId from query params

      // ✅ ADD: Validate twinToken exists
      if (!twinToken) {
        logger.warn('getPublicChatPage: Missing twinToken', { 
          params: req.params,
          path: req.path,
          userId: req.user?.id 
        });
        throw createError.validation('Twin token is required', ErrorCodes.INVALID_INPUT);
      }

    const chatIdParam = req.query.chatId;
    let initialChatIdToken: string | null = null;
    const userId = req.user?.id;

    // ✅ PHASE 2: Detokenize twinToken to get actual twinId
    const decoded = detokenizeId(twinToken, {
      userId: req.user?.id,
      endpoint: 'getPublicChatPage'
    });    
    if (!decoded || decoded.type !== 'twin') {
      logger.warn('getPublicChatPage: Invalid twin token', { twinToken, userId });
      throw createError.validation('Invalid twin token', ErrorCodes.INVALID_INPUT);
    }
    const twinId = decoded.id;

    logger.info('getPublicChatPage:', { twinToken, chatIdParam, userId });

    
    // ✅ FIRST: Check if this is user's own twin - redirect immediately
    if (userId) {
      try {
        await verifyTwinOwnership(twinId, userId);
        // Own twin detected - redirect to enhanced chat
        logger.info('Own twin detected, redirecting to enhanced chat:', { twinId, userId });
        const message = encodeURIComponent('You cannot chat with your own twin in public chat. Use Enhanced Chat for interactive conversations.');
        const safeTwinId = tokenizeId(twinId, 'twin');
        return res.redirect(`/chat-enhanced?twinId=${safeTwinId}&message=${message}`);
      } catch (error) {
        // Not owned, continue with public chat flow
      }
    }
    
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

// ✅ Check blockNonLoggedUsers for non-logged users
if (!userId && twinInfo.blockNonLoggedUsers === true) {
  logger.warn('getPublicChatPage: Non-logged user blocked', { twinId });
  return res.status(403).render('403',{
    title: 'Access Denied',
    message: 'This twin requires you to be logged in to access',
    csrfToken: res.locals['csrfToken'],
    user: null
  });
}

// ✅ Check if user is blocked (only if logged in)
if (userId) {
  const blockedCheck = await db.query(`
    SELECT id FROM "TwinBlockedUsers"
    WHERE "twinId" = $1 AND "userId" = $2
  `, [twinId, userId]);
  
  if (blockedCheck.rows.length > 0) {
    logger.warn('getPublicChatPage: Blocked user tried to access', { twinId, userId });
    return res.status(403).render('403', {
      title: 'Access Denied',
      message: 'You are blocked from accessing this twin',
      csrfToken: res.locals['csrfToken'],
      user: req.user || null
    });
  }
}

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

    // ✅ FIX: Treat chatId as token ONLY for logged-in users
    if (userId && chatIdParam) {
      const chatTokenRaw = Array.isArray(chatIdParam) ? chatIdParam[0] : chatIdParam;
      const chatToken = typeof chatTokenRaw === 'string' ? chatTokenRaw : String(chatTokenRaw);
      
      try {
        // Detokenize to get actual DB ID for verification
        const decodedChat = detokenizeId(chatToken, {
          userId: req.user?.id,
          endpoint: 'getPublicChatPage.initialChat'
        });
        
        if (decodedChat && decodedChat.type === 'chat') {
          const dbChatId = decodedChat.id;
          
          // Verify this chat belongs to this twin
          const chatResult = await db.query(`
            SELECT id, "userId", "visitorId" 
            FROM "PublicChat" 
            WHERE id = $1 AND "twinId" = $2
          `, [dbChatId, twinId]);
          
          if (chatResult && chatResult.rows && chatResult.rows.length > 0) {
            const chat = chatResult.rows[0];
            
            // If user is logged in, check if they own the chat OR if they own the twin
            // (we already know userId is truthy here)
            const ownsChat = chat.userId === userId;
            let ownsTwin = false;
            try {
              await verifyTwinOwnership(twinId, userId);
              ownsTwin = true;
            } catch (error) {
              ownsTwin = false;
            }
            
            if (ownsChat || ownsTwin) {
              initialChatIdToken = chatToken;  // ✅ Keep token for frontend
              logger.info('Valid chatId token found:', { chatToken, dbChatId, twinId, userId, ownsChat, ownsTwin });
            } else {
              logger.warn('ChatId token not found or access denied:', { chatToken, dbChatId, twinId, userId });
            }
          } else {
            logger.warn('ChatId token not found in database:', { chatToken, dbChatId, twinId });
          }
        } else {
          logger.warn('Invalid chat token type:', { chatToken, decodedType: decodedChat?.type });
        }
      } catch (error) {
        // If detokenization fails, log but don't crash - just don't set initialChatId
        logger.warn('Failed to detokenize chatId query param:', { 
          chatIdParam, 
          error: error instanceof Error ? error.message : 'Unknown error',
          userId 
        });
      }
    }
    
    // ✅ NEW: For logged-in users, if no chatId provided, pick default chat
    if (userId && !initialChatIdToken) {
      try {
        const defaultChat = await publicChatQueries.findLatestByTwinAndUser(twinId, userId);
        if (defaultChat) {
          initialChatIdToken = tokenizeId(defaultChat.id, 'chat');
          logger.info('getPublicChatPage: Using default chat for logged-in user', {
            twinId,
            userId,
            chatId: defaultChat.id,
          });
        }
      } catch (error) {
        logger.warn('getPublicChatPage: Failed to find default chat', {
          twinId,
          userId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        // Continue with initialChatIdToken = null
      }
    }
    
    // Fetch full user data from database (like getDiscover)    
    let user = null;
    let hasTwins = false;
    let userTwinId = null;  // ✅ Changed from twinId to userTwinId
    
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
        
        const userTwins = await twinQueries.findByUserId(fullUser.id);
        hasTwins = userTwins.length > 0;
        const userTwin = hasTwins ? userTwins[0] : null;
        userTwinId = userTwin && userTwin.id ? userTwin.id : null;  // ✅ Changed to userTwinId
      }
    }

    const twinPublicId = tokenizeId(twin.id, 'twin');
    
    // ✅ NEW: For anonymous users, prevent browser caching (back should always reload)
    if (!userId) {
      res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'Pragma': 'no-cache',
        'Expires': '0',
      });
    }

    // Render with twin data and optional initial chatId
    res.render('public-chat', { 
      title: 'Public Chat - AI Twin',
      user: user,
      twin: {
        ...twin,
        publicId: twinPublicId
      },
      twinPublicId: twinPublicId,
      initialChatId: initialChatIdToken,  // ✅ Always a token if set, null otherwise
      requiresLogin: twin.requireLogin && !userId,
      hasTwins: hasTwins,
      twinId: userTwinId,
      csrfToken: req.csrfToken?.() || ''
    });
    
  } catch (error) {
    handleControllerError(error, 'Failed to load public chat page');
  }
};

// ✅ PHASE 2: Check if twin belongs to current user
export const checkTwinOwner = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.json({ isOwner: false });
    }

    const { twinToken } = req.params;  // ✅ Changed from twinId

    if (!twinToken) {
      logger.warn('checkTwinOwner: Missing twinToken', {
        params: req.params,
        path: req.path,
        userId: req.user.id
      });
      return res.json({ isOwner: false });
    }

    // ✅ PHASE 6: Detokenize with context for logging
    const decoded = detokenizeId(twinToken, {
      userId: req.user.id,
      endpoint: 'checkTwinOwner'
    });

    if (!decoded || decoded.type !== 'twin') {
      logger.warn('checkTwinOwner: Invalid twin token', {
        tokenLength: twinToken.length,
        userId: req.user.id,
        path: req.path
      });
      return res.json({ isOwner: false });
    }

    const twinId = decoded.id;
    
    const twinResult = await db.query(`
      SELECT "userId" FROM "Twin" WHERE id = $1
    `, [twinId]);

    if (twinResult.rows.length === 0) {
      return res.json({ isOwner: false });
    }

    const isOwner = twinResult.rows[0].userId === req.user.id;

    return res.json({ isOwner });
  } catch (error) {
    logger.error('Check twin owner error:', error);
    return res.json({ isOwner: false });
  }
};