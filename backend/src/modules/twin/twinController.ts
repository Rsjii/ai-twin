import { Request, Response, NextFunction } from 'express';
import { db, twinQueries } from '../../config/database';
import { TwinService } from './twinService';
import { logger } from '../../config/logger';
import { z } from 'zod';
import { EventLogger } from '../../services/eventLogger';
import { validateTwinSamples, isContentSafe, sanitizeText } from '../../utils/safety';
import { featureFlags } from '../../config/featureFlags';
import { createError, ErrorCodes } from '../../utils/errors';
import { generateId } from '../../utils/idGenerator';
import { handleControllerError } from '../../utils/errorHandler';
import { EVENT_TYPES } from '../../config/constants';
import { detokenizeId } from '../../utils/idTokenization';

const twinService = new TwinService();

const createTwinSchema = z.object({
  samples: z.array(z.string().min(10, 'Each sample must be at least 10 characters').max(1000, 'Each sample must not exceed 1000 characters')).min(1, 'At least 1 sample required').max(5, 'Maximum 5 samples allowed'),
});

// Simple test schema
const testSchema = z.object({
  samples: z.array(z.string())
});

export const createTwin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Check authentication
    if (!req.user) {
       throw createError.unauthorized();
    }

    const {samples} = createTwinSchema.parse(req.body);

   const existingTwinQuery = `
    SELECT id, "createdAt" 
    FROM "Twin" 
    WHERE "userId" = $1 
    LIMIT 1
    `;

  const userId = (req.user as any)?.id || (req.user as any)?.userId;
  if (!userId) {
    throw createError.unauthorized();
  }
  const existingTwinResult = await db.query(existingTwinQuery, [userId]);

  if (existingTwinResult.rows.length > 0) {
    const existingTwin = existingTwinResult.rows[0];
    throw createError.conflict('User already has a twin. Only one twin per user is allowed.', {
      existingTwin: {
        id: existingTwin.id,
        createdAt: existingTwin.createdAt
      }
    }); 
  }

    // Check if twin creation is enabled
    if (!featureFlags.ENABLE_AI_GENERATION) {
      throw createError.internal('Twin creation is currently disabled');
    }

    // Validate samples using safety utils
    const validation = validateTwinSamples(samples);
    if (!validation.valid) {
      throw createError.validation('Invalid samples', validation.errors);
    }

    // Check content safety
    const combinedText = samples.join(' ');
    const safetyCheck = isContentSafe(combinedText);
    if (!safetyCheck.safe) {
      throw createError.validation('Content safety check failed', { reasons: safetyCheck.reasons });
    }

    // Sanitize samples (still used for safety checks / future training pipeline)
    const _sanitizedSamples = samples.map(sample => sanitizeText(sample));
    
    // MVP (personaData-only): create a minimal persona + systemPrompt.
    // This endpoint is legacy (sample-based); onboarding/settings are the main flow.
    const personaData = {
      basicInfo: {
        fullName: (req.user as any)?.handle || (req.user as any)?.email || 'the user',
        bio: '',
      },
      rules: {
        always: [],
        never: [],
        replySize: 'normal',
        engagementStyle: 'mix',
      },
      context: {
        interests: [],
        targetAudience: 'general',
        topicsToAvoid: 'nsfw, explicit sexual content',
      },
      communicationStyle: {
        language: {
          greetingStyle: 'friendly',
          closingStyle: 'friendly',
          emojiUsage: 'medium',
          responseLength: 'normal',
          commonPhrases: '',
        },
        tone: {},
      },
      settings: {
        memory: { enabled: true, autoExtractFacts: false },
      },
    };

    const systemPrompt = await twinService.generateSystemPrompt(personaData);
    const styleVector = {}; // legacy/ignored

    const sampleReplyResult = await twinService.generateDraftWithContext({
      personaData,
      systemPrompt,
      tokenLimit: 120,
      chatMemory: [],
      currentMessages: ['Say a short hello in my style.'],
      isFirstMessage: false,
    });
    const sampleReply =
      typeof sampleReplyResult === 'object' && sampleReplyResult && 'response' in sampleReplyResult
        ? (sampleReplyResult as any).response
        : (typeof sampleReplyResult === 'string' ? sampleReplyResult : 'Hey!');
    
    // Save twin to database using raw SQL
    const twinId = generateId.twin();
    const utcNow = new Date().toISOString();

    let result;
    try {
      // Preferred insert (personaData-only MVP)
      result = await db.query(
        `
        INSERT INTO "Twin" (
          id, "userId", "styleVector", "sampleReply", "personaData", "systemPrompt",
          "isPublic", "verified", "likeCount", "followCount", "chatCount", "createdAt"
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::timestamptz)
        RETURNING id, "createdAt"
        `,
        [
          twinId,
          userId,
          JSON.stringify(styleVector),
          sampleReply,
          JSON.stringify(personaData),
          systemPrompt,
          false,
          false,
          0,
          0,
          0,
          utcNow,
        ]
      );
    } catch (e) {
      // Fallback: minimal insert if extra columns do not exist
      const insertQuery = `
        INSERT INTO "Twin" (id, "userId", "styleVector", "sampleReply", "isPublic", "verified", "likeCount", "followCount", "chatCount", "createdAt")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id, "createdAt"
      `;
      result = await db.query(insertQuery, [
        twinId,
        userId,
        JSON.stringify(styleVector),
        sampleReply,
        false,
        false,
        0,
        0,
        0,
        new Date(),
      ]);
    }
     
    // ✅ Twin created - profile URL is /@user.handle (no TwinProfile needed)
    
    // Create a mock twin object for testing
    const twin = {
      id: twinId,
      userId: userId,
      styleVector,
      sampleReply,
      createdAt: result.rows[0].createdAt
    };
    
    // Log twin creation event using EventLogger
    await EventLogger.logTwinCreated(userId, twin.id, {
      samplesCount: samples.length
    });
    
    res.json({
      success: true,
      twin: {
        id: twin.id,
        styleVector,
        sampleReply,
        createdAt: twin.createdAt,
      },
    });
  } catch (error) {
    logger.error('Twin creation error:', error);
    
    // Log the error event
    const userId = (req.user as any)?.id || (req.user as any)?.userId;
    if (userId) {
      await EventLogger.logUserEvent(userId, EVENT_TYPES.TWIN_CREATION_FAILED, { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }).catch(() => {}); // Don't let logging errors break the flow
    }

    // ✅ FIX: Handle errors properly
    if (error instanceof z.ZodError) {
      return next(createError.validation('Invalid input', error.errors));
    }
    next(error); // ✅ Let errorHandlerMiddleware handle AppError and others
  }
};

export const getUserTwins = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req.user as any)?.id || (req.user as any)?.userId;
    if (!userId) {
      throw createError.unauthorized();
    }
    
    const twins = await db.query(`
      SELECT id, "styleVector", "sampleReply", "createdAt"
      FROM "Twin"
      WHERE "userId" = $1
      ORDER BY "createdAt" DESC
    `, [userId]);
    res.json({ twins: twins.rows });
  } catch (error) {
    next(error);      
  }
};

export const getTwinById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // ✅ SECURITY: Detokenize twinToken from URL
    const { twinToken } = req.params;
    const userId = (req.user as any)?.id || (req.user as any)?.userId;
    if (!userId) {
      throw createError.unauthorized();
    }
    const decoded = detokenizeId(twinToken, { userId, endpoint: 'getTwinById' });
    if (!decoded || decoded.type !== 'twin') {
      throw createError.notFound('Twin not found', ErrorCodes.TWIN_NOT_FOUND);
    }
    const id = decoded.id;

    const twinResult = await db.query(`
      SELECT * FROM "Twin"
      WHERE id = $1 AND "userId" = $2
    `, [id, userId]);
    
    const twin = twinResult.rows[0];
    
    if (!twin) {
      throw createError.notFound('Twin not found', ErrorCodes.TWIN_NOT_FOUND);
    }
    
    res.json({ twin });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete Twin
 * DELETE /api/twin/:id
 */
export const deleteTwin = async (req: any, res: Response, next: NextFunction) => {
  try {
    // ✅ SECURITY: Detokenize twinToken from URL
    const { twinToken } = req.params;
    const decoded = detokenizeId(twinToken, { userId: req.user?.id, endpoint: 'deleteTwin' });
    if (!decoded || decoded.type !== 'twin') {
      throw createError.notFound('This twin link is invalid or has expired.', ErrorCodes.TWIN_NOT_FOUND);
    }
    const twinId = decoded.id;
    const userId = req.user?.id;

    if (!userId) {
      throw createError.unauthorized();
    }

    // Verify twin exists and belongs to user
    const twin = await twinQueries.findById(twinId);
    if (!twin) {
      throw createError.notFound('Twin not found', ErrorCodes.TWIN_NOT_FOUND);
    }

    if (twin.userId !== userId) {
      throw createError.forbidden('You do not have permission to delete this twin');
    }

    // Delete twin (CASCADE will handle all related data)
    await twinQueries.delete(twinId, userId);

    // ✅ Log twin deletion event
    await EventLogger.logUserEvent(userId, EVENT_TYPES.TWIN_DELETED, {
      publicTwinId: twinId, // Will be tokenized automatically
      twinPublicHandle: twin.publicHandle || null,
      wasPublic: twin.isPublic || false,
    }).catch(() => {}); // Silent fail - don't break deletion if logging fails

    logger.info(`Twin ${twinId} deleted by user ${userId}`);

    res.json({
      success: true,
      message: 'Twin deleted successfully'
    });
  } catch (error) {
    next(error); // ✅ Standardize
  }
};
