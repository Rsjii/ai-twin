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

   const existingTwinQuery = `
    SELECT id, "createdAt" 
    FROM "Twin" 
    WHERE "userId" = $1 
    LIMIT 1
    `;

  const existingTwinResult = await db.query(existingTwinQuery, [req.user.id]);

  if (existingTwinResult.rows.length > 0) {
    const existingTwin = existingTwinResult.rows[0];
    throw createError.conflict('User already has a twin. Only one twin per user is allowed.', {
      existingTwin: {
        id: existingTwin.id,
        createdAt: existingTwin.createdAt
      }
    }); 
  }

    // Check if AI generation is enabled
    if (!featureFlags.ENABLE_AI_GENERATION) {
      throw createError.internal('AI generation is currently disabled');
    }

    // Validate samples using safety utils
    const validation = validateTwinSamples(samples);
    console.log('Samples received for validation:', samples);
    console.log('Validation result:', validation);
    if (!validation.valid) {
      throw createError.validation('Invalid samples', validation.errors);
    }

    // Check content safety
    const combinedText = samples.join(' ');
    const safetyCheck = isContentSafe(combinedText);
    console.log('Safety check result:', safetyCheck);
    if (!safetyCheck.safe) {
      throw createError.validation('Content safety check failed', { reasons: safetyCheck.reasons });
    }

    // Sanitize samples
    const sanitizedSamples = samples.map(sample => sanitizeText(sample));
    
    // Extract style vector
    const styleVector = await twinService.extractStyle(sanitizedSamples.join('\n---\n'));
    
    // Generate sample reply
    const sampleReply = await twinService.generateSampleReply(styleVector);
    
  // Save twin to database using raw SQL
   const twinId = generateId.twin();
   const insertQuery = `
    INSERT INTO "Twin" (id, "userId", "styleVector", "sampleReply", "isPublic", "verified", "likeCount", "followCount", "chatCount", "createdAt")
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING id, "createdAt"
   `;

   const result = await db.query(insertQuery, [
     twinId,
     req.user.id,
     JSON.stringify(styleVector),
     sampleReply,
     false, // isPublic - default to private
     false, // verified - default to not verified
     0,     // likeCount - default to 0
     0,     // followCount - default to 0
     0,     // chatCount - default to 0
     new Date()
   ]);

    
    // Create a mock twin object for testing
    const twin = {
      id: 'test-twin-id',
      userId: req.user.id,
      styleVector,
      sampleReply,
      createdAt: new Date()
    };
    
    // Log twin creation event using EventLogger
    await EventLogger.logUserEvent(req.user.id, 'twin_created', { 
      twinId: twin.id,
      samplesCount: samples.length,
      totalLength: combinedText.length,
      styleVector: styleVector
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
    if (req.user) {
      await EventLogger.logUserEvent(req.user.id, 'twin_creation_failed', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
    
    handleControllerError(error, 'Failed to create twin');
  }
};

export const getUserTwins = async (req: Request, res: Response, next: NextFunction) => {
  try {
    logger.debug('Getting user twins:', { userId: req.user?.id });
    
    if (!req.user) {
      throw createError.unauthorized();
    }

    const twins = await db.query(`
      SELECT id, "styleVector", "sampleReply", "createdAt"
      FROM "Twin"
      WHERE "userId" = $1
      ORDER BY "createdAt" DESC
    `, [req.user.id]);
    
    logger.debug('Found twins:', { count: twins.rows.length });
    res.json({ twins: twins.rows });
  } catch (error) {
    handleControllerError(error, 'Failed to get user twins');
  }
};

export const getTwinById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    
    if (!req.user) {
      throw createError.unauthorized();
    }

    const twinResult = await db.query(`
      SELECT * FROM "Twin"
      WHERE id = $1 AND "userId" = $2
    `, [id, req.user.id]);
    
    const twin = twinResult.rows[0];
    
    if (!twin) {
      throw createError.notFound('Twin not found', ErrorCodes.TWIN_NOT_FOUND);
    }
    
    res.json({ twin });
  } catch (error) {
    handleControllerError(error, 'Failed to get twin');
  }
};

/**
 * Delete Twin
 * DELETE /api/twin/:id
 */
export const deleteTwin = async (req: any, res: Response) => {
  try {
    const { id: twinId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Verify twin exists and belongs to user
    const twin = await twinQueries.findById(twinId);
    if (!twin) {
      return res.status(404).json({ error: 'Twin not found' });
    }

    if (twin.userId !== userId) {
      return res.status(403).json({ error: 'You do not have permission to delete this twin' });
    }

    // Delete twin (CASCADE will handle all related data)
    await twinQueries.delete(twinId, userId);

    logger.info(`Twin ${twinId} deleted by user ${userId}`);

    res.json({
      success: true,
      message: 'Twin deleted successfully'
    });
  } catch (error: any) {
    logger.error('Delete twin error:', error);
    
    if (error.message?.includes('not found') || error.message?.includes('not owned')) {
      return res.status(404).json({ error: error.message });
    }
    
    res.status(500).json({ error: 'Failed to delete twin' });
  }
};
