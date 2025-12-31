import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth';
import { db, publicTwinQueries, userQueries, publicChatQueries } from '../../config/database';
import { logger } from '../../config/logger';
import { EventLogger } from '../../services/eventLogger';
import { z } from 'zod';
import { createError, ErrorCodes } from '../../utils/errors';
import { verifyTwinOwnership } from '../../utils/twinUtils';
import {twinQueries} from '../../config/database';
import { detokenizeId, sanitizeTwin, tokenizeId } from '../../utils/idTokenization';
import { EVENT_TYPES, MEMORY_LIMITS } from '../../config/constants';
import { checkQuotaStatus } from '../../services/tokenQuotaService';

// Validation schemas
const makePublicSchema = z.object({
  twinId: z.string().min(1, 'Twin ID is required'),
  // ✅ REMOVED: publicHandle - always use user.handle for consistent URLs
  bio: z.string().min(1, 'Bio is required').max(MEMORY_LIMITS.MAX_BIO_CHARS, `Bio must be ${MEMORY_LIMITS.MAX_BIO_CHARS} characters or less`), // ✅ MANDATORY: Bio is required
  profileImage: z.string().url('Profile image must be a valid URL').optional()
});

const updateProfileSchema = z.object({
  bio: z.string().max(MEMORY_LIMITS.MAX_BIO_CHARS, `Bio must be ${MEMORY_LIMITS.MAX_BIO_CHARS} characters or less`).optional(),
  profileImage: z.string().url('Profile image must be a valid URL').optional(),
  publicHandle: z.string()
    .min(3, 'Handle must be at least 3 characters')
    .max(30, 'Handle must be less than 30 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Handle can only contain letters, numbers, hyphens, and underscores')
    .optional()
});

// Make twin public
export const makeTwinPublic = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw createError.unauthorized('Authentication required');
    }

    const { twinId: twinIdInput, bio, profileImage } = makePublicSchema.parse(req.body);

    // ✅ FIX: Detokenize if tokenized ID is provided
    let twinId: string;
    try {
      const decoded = detokenizeId(twinIdInput);
      if (decoded && decoded.type === 'twin') {
        twinId = decoded.id;
        logger.info('Making twin public - detokenized ID', { input: twinIdInput, twinId });
      } else {
        // Fallback: assume raw ID (for backward compatibility)
        twinId = twinIdInput;
        logger.info('Making twin public - using raw ID (backward compatibility)', { twinId });
      }
    } catch (error) {
      // If detokenization fails, assume it's a raw ID (backward compatibility)
      twinId = twinIdInput;
      logger.info('Making twin public - detokenization failed, using as raw ID', { twinId });
    }

    logger.info('Making twin public - request received', {
      twinId,
      userId: req.user.id,
      bio: bio?.substring(0, 50),
      hasProfileImage: !!profileImage
    });

    await verifyTwinOwnership(twinId, req.user.id);

    // ✅ Check Twin directly
    const twinResult = await db.query(
      `SELECT id, "userId", "isPublic" FROM "Twin" WHERE id = $1`,
      [twinId]
    );
    if (twinResult.rows.length === 0) {
      throw createError.notFound('Twin not found', ErrorCodes.TWIN_NOT_FOUND);
    }

    const twin = twinResult.rows[0];

    // Idempotent: already public
    if (twin.isPublic) {
      return res.status(200).json({
        success: true,
        message: 'Twin is already public'
      });
    }

    // Always use user.handle as "public" identity
    const userRes = await db.query(
      `SELECT handle FROM "User" WHERE id = $1`,
      [twin.userId]
    );
    const userHandle = userRes.rows[0]?.handle || '';

    const updated = await publicTwinQueries.makePublic(twinId, bio, profileImage);

    // ✅ Guard: agar update nahi hua to error throw karo
if (!updated || !updated.isPublic) {
  logger.error('makeTwinPublic: Twin update failed', {
    twinId,
    updated
  });
  throw createError.internal('Failed to make twin public. Please try again.');
}

    // ✅ SYNC: Always sync Twin.bio to personaData.basicInfo.oneLineBio (bio is mandatory)
    try {
      const personaResult = await db.query(
        `SELECT "personaData" FROM "Twin" WHERE id = $1`,
        [twinId]
      );
      if (personaResult.rows.length > 0) {
        const personaData = personaResult.rows[0].personaData || {};
        if (!personaData.basicInfo) {
          personaData.basicInfo = {};
        }
        // Always sync - use updated.bio (bio is mandatory, so it will always have a value)
        personaData.basicInfo.oneLineBio = updated.bio;
        await db.query(
          `UPDATE "Twin" SET "personaData" = $1 WHERE id = $2`,
          [JSON.stringify(personaData), twinId]
        );
        logger.info('makeTwinPublic: Synced Twin.bio to personaData.basicInfo.oneLineBio:', updated.bio);
      }
    } catch (syncError) {
      // Don't fail the request if personaData sync fails (non-critical)
      logger.warn('makeTwinPublic: Failed to sync bio to personaData (non-critical):', syncError);
    }

    await EventLogger.logUserEvent(req.user.id, EVENT_TYPES.TWIN_MADE_PUBLIC, {
      publicTwinId: twinId,
      handle: userHandle,
      bioLength: bio?.length || 0
    });

    return res.json({
      success: true,
      message: 'Twin is now public!',
      twin: {
        id: updated.id,
        isPublic: updated.isPublic,
        bio: updated.bio,
        profileImage: updated.profileImage,
        // for front-end display only
        publicHandle: userHandle
      }
    });

  } catch (error) {
    logger.error('Error making twin public', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      userId: req.user?.id
    });
    return next(error);
  }
};

// Make twin private
export const makeTwinPrivate = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw createError.unauthorized('Authentication required');
    }

    const { twinId: twinIdInput } = req.body;

    if (!twinIdInput) {
      throw createError.validation('Twin ID is required');
    }

    // ✅ FIX: Detokenize if tokenized ID is provided (same as makeTwinPublic)
    let twinId: string;
    try {
      const decoded = detokenizeId(twinIdInput);
      if (decoded && decoded.type === 'twin') {
        twinId = decoded.id;
        logger.info('Making twin private - detokenized ID', { input: twinIdInput, twinId });
      } else {
        // Fallback: assume raw ID (for backward compatibility)
        twinId = twinIdInput;
        logger.info('Making twin private - using raw ID (backward compatibility)', { twinId });
      }
    } catch (error) {
      // If detokenization fails, assume it's a raw ID (backward compatibility)
      twinId = twinIdInput;
      logger.info('Making twin private - detokenization failed, using as raw ID', { twinId });
    }

    await verifyTwinOwnership(twinId, req.user.id);

    const twinRes = await db.query(
      `SELECT id, "isPublic" FROM "Twin" WHERE id = $1`,
      [twinId]
    );
    if (twinRes.rows.length === 0) {
      throw createError.notFound('Twin not found', ErrorCodes.TWIN_NOT_FOUND);
    }

    if (!twinRes.rows[0].isPublic) {
      throw createError.conflict('Twin is already private');
    }

    await publicTwinQueries.makePrivate(twinId);

    await EventLogger.logUserEvent(req.user.id, EVENT_TYPES.TWIN_MADE_PRIVATE, {
      publicTwinId: twinId
    });

    return res.json({
      success: true,
      message: 'Twin is now private'
    });
  } catch (error) {
    logger.error('Failed to make twin private:', error);
    return next(error);
  }
};

// Update twin profile
export const updateTwinProfile = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw createError.unauthorized('Authentication required');
    }

    const updateData = updateProfileSchema.parse(req.body);
    // We ignore updateData.publicHandle – only one username = User.handle.

    const twinRes = await db.query(
      `SELECT id, "userId"
      FROM "Twin"
      WHERE "userId" = $1
       LIMIT 1`,
      [req.user.id]
    );

    if (twinRes.rows.length === 0) {
      throw createError.notFound('No twin found', ErrorCodes.TWIN_NOT_FOUND);
    }

    const twin = twinRes.rows[0];

    const updatedTwin = await publicTwinQueries.updateProfile(
      twin.id,
      updateData.bio,
      updateData.profileImage
    );

    // ✅ SYNC: Always sync Twin.bio to personaData.basicInfo.oneLineBio (bio is mandatory)
    try {
      const personaResult = await db.query(
        `SELECT "personaData" FROM "Twin" WHERE id = $1`,
        [twin.id]
      );
      if (personaResult.rows.length > 0) {
        const personaData = personaResult.rows[0].personaData || {};
        if (!personaData.basicInfo) {
          personaData.basicInfo = {};
        }
        // Always sync - use updatedTwin.bio (bio is mandatory, so it will always have a value)
        personaData.basicInfo.oneLineBio = updatedTwin.bio;
        await db.query(
          `UPDATE "Twin" SET "personaData" = $1 WHERE id = $2`,
          [JSON.stringify(personaData), twin.id]
        );
        logger.info('updateTwinProfile: Synced Twin.bio to personaData.basicInfo.oneLineBio:', updatedTwin.bio);
      }
    } catch (syncError) {
      // Don't fail the request if personaData sync fails (non-critical)
      logger.warn('updateTwinProfile: Failed to sync bio to personaData (non-critical):', syncError);
    }

    res.json({
      success: true,
      message: 'Profile updated successfully',
      twin: {
        id: updatedTwin.id,
        bio: updatedTwin.bio,
        profileImage: updatedTwin.profileImage,
        isPublic: updatedTwin.isPublic
      }
    });
  } catch (error) {
    logger.error('Failed to update twin profile:', error);
    return next(error);
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

    // 🚩 NEW: Check if viewer is blocked (for API consistency)
    // Note: blockNonLoggedUsers is already filtered in findByPublicHandle query
    const viewerId = (req as AuthenticatedRequest).user?.id;

    // NEW: For non-logged users, enforce blockNonLoggedUsers → 404
    if (!viewerId && publicTwin.blockNonLoggedUsers === true) {
      throw createError.notFound('Public twin not found', ErrorCodes.TWIN_NOT_FOUND);
    }

    if (viewerId) {
      const blockedCheck = await db.query(`
        SELECT id FROM "TwinBlockedUsers"
        WHERE "twinId" = $1 AND "userId" = $2
      `, [publicTwin.id, viewerId]);

      if (blockedCheck.rows.length > 0) {
        throw createError.notFound('Public twin not found', ErrorCodes.TWIN_NOT_FOUND);
      }
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
    logger.error('Failed to get public twin profile:', error);
    return next(error);
  }
};

// Get user's own twin profile (with all data)
export const getMyTwinProfile = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        errorCode: 'UNAUTHORIZED'
      });
    }

    const twinRes = await db.query(
      `SELECT 
         t.id,
         t."userId",
         t."isPublic",
         t.bio,
         t."profileImage",
         t."likeCount",
         t."followCount",
         t."chatCount",
         t.verified,
         t."styleVector",
         t."sampleReply",
         t."personaData",
         t."systemPrompt",
         t."createdAt",
         u.handle as "userHandle",
         u.name   as "userName"
      FROM "Twin" t
      JOIN "User" u ON t."userId" = u.id
      WHERE t."userId" = $1
       LIMIT 1`,
      [req.user.id]
    );

    if (twinRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No twin found. Please create a twin first.',
        errorCode: 'TWIN_NOT_FOUND',
        hasTwin: false
      });
    }

    const row = twinRes.rows[0];
    const twinPublicId = tokenizeId(row.id, 'twin');

    const userMetaRes = await db.query(
      `SELECT "personaData", "onboardingCompleted"
      FROM "User" 
       WHERE id = $1`,
      [req.user.id]
    );
    const userMeta = userMetaRes.rows[0] || {};

    res.json({
      success: true,
      twin: {
        id: twinPublicId,
        publicId: twinPublicId,
        isPublic: row.isPublic,
        publicHandle: row.userHandle,   // ✅ always user.handle
        bio: row.bio,
        profileImage: row.profileImage,
        likeCount: row.likeCount || 0,
        followCount: row.followCount || 0,
        chatCount: row.chatCount || 0,
        verified: row.verified || false,
        styleVector: row.styleVector,
        sampleReply: row.sampleReply,
        personaData: row.personaData,
        systemPrompt: row.systemPrompt,
        createdAt: row.createdAt,
        userHandle: row.userHandle,
        userName: row.userName
      },
      user: {
        personaData: userMeta.personaData,
        onboardingCompleted: userMeta.onboardingCompleted || false
      }
    });
  } catch (error: any) {
    logger.error('getMyTwinProfile error:', error);
    return next(error);
  }
};

// Line 312: Change to AuthenticatedRequest to get userId
export const getPublicChatPage = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { twinToken, chatToken: paramChatToken } = req.params;
    // ✅ ADD: Extract chatId from query params

      // ✅ ADD: Validate twinToken exists
      if (!twinToken) {
        logger.warn('getPublicChatPage: Missing twinToken', { 
          params: req.params,
          path: req.path,
          userId: req.user?.id 
        });
      // Treat as "not found" so user just sees 404
      throw createError.notFound('This chat does not exist', ErrorCodes.TWIN_NOT_FOUND);        
      }

    const chatIdParam = paramChatToken || req.query.chatId;
    
    let initialChatIdToken: string | null = null;
    const userId = req.user?.id;

    // ✅ PHASE 2: Detokenize twinToken to get actual twinId
    const decoded = detokenizeId(twinToken, {
      userId: req.user?.id,
      endpoint: 'getPublicChatPage'
    });    
    if (!decoded || decoded.type !== 'twin') {
      logger.warn('getPublicChatPage: Invalid twin token', { twinToken, userId });
      // Treat as "not found" so user just sees 404
      throw createError.notFound('This chat does not exist', ErrorCodes.TWIN_NOT_FOUND);      
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
    
// ✅ Check twin existence + visibility from Twin
const twinCheck = await db.query(
  `SELECT 
     id,
     "isPublic",
     "blockNonLoggedUsers",
     "requireLogin"
   FROM "Twin"
   WHERE id = $1
   LIMIT 1`,
  [twinId]
);

if (twinCheck.rows.length === 0) {
  logger.warn('getPublicChatPage: Twin not found', { twinId, userId });
  throw createError.notFound('This chat does not exist', ErrorCodes.TWIN_NOT_FOUND);
}

const twinInfo = twinCheck.rows[0];

// ✅ Check blockNonLoggedUsers for non-logged users
if (!userId && twinInfo.blockNonLoggedUsers === true) {
  logger.warn('getPublicChatPage: Non-logged user blocked', { twinId });
  // Non-logged viewers should see a simple 404
  throw createError.notFound('This chat does not exist', ErrorCodes.TWIN_NOT_FOUND);  
}

// ✅ Check if user is blocked (uses Twin.id directly)
if (userId) {
  const blockedCheck = await db.query(
    `SELECT id FROM "TwinBlockedUsers"
     WHERE "twinId" = $1 AND "userId" = $2`,
    [twinId, userId]
  );
  
  if (blockedCheck.rows.length > 0) {
    logger.warn('getPublicChatPage: Blocked user tried to access', { twinId, userId });
 // Pretend the twin does not exist
 throw createError.notFound('This chat does not exist', ErrorCodes.TWIN_NOT_FOUND);    
  }
}

// ✅ Check if twin is public
if (!twinInfo.isPublic) {
  logger.warn('getPublicChatPage: Twin is not public', { twinId, userId, isPublic: twinInfo.isPublic });
  throw createError.notFound('This chat does not exist', ErrorCodes.TWIN_NOT_FOUND);
}

// ✅ Load display fields from Twin (join with User to get handle)
const twinResult = await db.query(
  `SELECT 
     COALESCE(t."publicHandle", u.handle) AS "publicHandle",
     t."isPublic",
     t."profileImage",
     t.bio,
     t."requireLogin",
     t."sampleReply",
     u.handle AS "userHandle",
     u.name   AS "userName"
   FROM "Twin" t
   JOIN "User" u ON t."userId" = u.id
   WHERE t.id = $1`,
  [twinId]
);

if (twinResult.rows.length === 0) {
  logger.error('getPublicChatPage: Unexpected error - twin disappeared', { twinId, userId });
  throw createError.notFound('This chat does not exist', ErrorCodes.TWIN_NOT_FOUND);
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
    
    // ✅ FIX: Validate twinPublicId was created
    if (!twinPublicId) {
      logger.error('[getPublicChatPage] Failed to tokenize twin ID', { twinId: twin.id });
      throw createError.internal('Failed to generate twin token');
    }
    
    // ✅ NEW: For anonymous users, prevent browser caching (back button always reloads)
    if (!userId) {
      res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'Pragma': 'no-cache',
        'Expires': '0',
      });
    }

    // ✅ NEW: Check quota status for BOTH anonymous and logged-in users (pre-check before rendering)
    // This prevents the browser from even attempting to send messages when quota is exceeded
    let quotaExceeded = false;
    try {
      // ✅ MUST MATCH public chat message reservation logic:
      // baseTokenLimit = min(tokenLimit||500, 800)
      // reserveTokens = baseTokenLimit + 400
      const baseTokenLimit = Math.min((twin?.tokenLimit || 500), 800);
      const reserveTokens = baseTokenLimit + 400;

      if (!userId) {
        // Anonymous user: IP-based quota check
        const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
        const quotaStatus = await checkQuotaStatus({
          actor: { kind: 'anon', ip: clientIp },
          reserveTokens, // ✅ key change: use reserve-aware check
        });
        quotaExceeded = quotaStatus.exceeded;
        logger.info('[getPublicChatPage] Quota check for anonymous user:', {
          ip: clientIp,
          used: quotaStatus.used,
          reserveTokens: quotaStatus.reserveTokens,
          totalIfReserved: quotaStatus.used + quotaStatus.reserveTokens,
          limit: quotaStatus.limit,
          exceeded: quotaExceeded
        });
      } else {
        // Logged-in user: account-based quota check
        const quotaStatus = await checkQuotaStatus({
          actor: { kind: 'user', userId },
          reserveTokens, // ✅ key change: use reserve-aware check
        });
        quotaExceeded = quotaStatus.exceeded;
        logger.info('[getPublicChatPage] Quota check for logged-in user:', {
          userId,
          used: quotaStatus.used,
          reserveTokens: quotaStatus.reserveTokens,
          totalIfReserved: quotaStatus.used + quotaStatus.reserveTokens,
          limit: quotaStatus.limit,
          exceeded: quotaExceeded
        });
      }
    } catch (error) {
      // If quota check fails, log but don't block page render (server will still enforce on send)
      logger.warn('[getPublicChatPage] Failed to check quota status:', error);
      quotaExceeded = false; // Default to false, server will still enforce on actual send
    }

    // Render with twin data and optional initial chatId
    res.render('public-chat', { 
      title: 'Public Chat - TwinOS',
      user: user,
      twin: {
        ...twin,
        publicId: twinPublicId
      },
      twinPublicId: twinPublicId,
      initialChatId: initialChatIdToken,  // ✅ Always a token if set, null otherwise
      requiresLogin: twin.requireLogin && !userId,
      hasTwins: hasTwins,
      // ✅ viewer ka apna twin (agar ho) – purana behaviour same
      twinId: userTwinId,
      // ✅ NEW: pass original URL twin token to frontend
      twinToken: twinToken,
      // ✅ NEW: pass quota exceeded status for both anonymous and logged-in users
      quotaExceeded: quotaExceeded,
      // CSRF token is generated by our session-based middleware (`generateCSRFToken`)
      // and exposed via `res.locals.csrfToken` for EJS.
      csrfToken: res.locals['csrfToken'] || ''
    });
    
  } catch (error) {
    logger.error('Failed to load public chat page:', error);
    return next(error);
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