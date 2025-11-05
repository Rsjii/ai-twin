import { Request, Response, NextFunction } from 'express';
import { db } from '../../config/database';
import { TwinService } from './twinService';
import { logger } from '../../config/logger';
import { z } from 'zod';
import { EventLogger } from '../../services/eventLogger';
import { validateTwinSamples, isContentSafe, sanitizeText } from '../../utils/safety';
import { featureFlags } from '../../config/featureFlags';
import { AppError, createError, ErrorCodes } from '../../utils/errors';

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
    // Add this at the very top of createTwin function
console.log('=== MIDDLEWARE CHECK ===');
console.log('req.user before any checks:', req.user);
console.log('req.cookies:', req.cookies);
console.log('========================');
    console.log('=== DEBUGGING TWIN CREATION ===');
    console.log('Parsed request body:', JSON.stringify(req.body, null, 2));
    console.log('Request body type:', typeof req.body);
    console.log('Request body samples:', req.body.samples);
    console.log('Request body samples type:', typeof req.body.samples);
    console.log('Request body samples isArray:', Array.isArray(req.body.samples));
    console.log('Request body samples constructor:', req.body.samples?.constructor?.name);
    
    // Try to parse with simple schema first
    try {
      const { samples } = testSchema.parse(req.body);
      console.log('Simple schema parsing successful, samples:', samples);
    } catch (error) {
      console.log('Simple schema parsing failed:', error);
    }
    
    // Try to parse the full schema
    try {
      const { samples } = createTwinSchema.parse(req.body);
      console.log('Full schema parsing successful, samples:', samples);
    } catch (error) {
      console.log('Full schema parsing failed:', error);
      throw error;
    }
    
    const { samples } = createTwinSchema.parse(req.body);

    // Debug logging
    console.log('=== AUTHENTICATION DEBUG ===');
    console.log('req.user:', req.user);
    console.log('req.user type:', typeof req.user);
    console.log('req.user keys:', req.user ? Object.keys(req.user) : 'undefined');
    console.log('============================');

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
   const twinId = `twin_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
    
    if (error instanceof AppError) {
      throw error;
    }
    throw createError.internal('Failed to create twin', error);
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
    if (error instanceof AppError) {
      throw error;
    }
    throw createError.internal('Failed to get user twins', error);
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
    if (error instanceof AppError) {
      throw error;
    }
    throw createError.internal('Failed to get twin', error);
  }
};
