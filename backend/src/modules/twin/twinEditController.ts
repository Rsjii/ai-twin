import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { db } from '../../config/database';
import { logger } from '../../config/logger';
import { TwinService } from './twinService';
import { detokenizeId } from '../../utils/idTokenization';
import { createError, ErrorCodes } from '../../utils/errors';

const twinService = new TwinService();

// Validation schemas
const updateStyleSchema = z.object({
  formality_level: z.number().min(0).max(1).optional(),
  emoji_usage: z.number().min(0).max(1).optional(),
  humor_style: z.enum(['none', 'light', 'moderate', 'heavy']).optional(),
  question_frequency: z.number().min(0).max(1).optional(),
  response_length_preference: z.enum(['brief', 'detailed', 'comprehensive']).optional(),
  tone: z.enum(['casual', 'witty', 'serious', 'friendly', 'professional']).optional(),
  sentence_length: z.enum(['short', 'medium', 'long']).optional()
});

const updatePersonaSchema = z.object({
  basicInfo: z.object({
    fullName: z.string().optional(),
    bio: z.string().optional(),
    username: z.string().optional(),
    primaryUseCase: z.string().optional()
  }).optional(),
  communicationStyle: z.object({
    tone: z.object({
      formalCasual: z.number().min(0).max(100).optional(),
      seriousPlayful: z.number().min(0).max(100).optional(),
      directDiplomatic: z.number().min(0).max(100).optional()
    }).optional(),
    language: z.object({
      greetingStyle: z.string().optional(),
      closingStyle: z.string().optional(),
      emojiUsage: z.string().optional(),
      responseLength: z.string().optional(),
      commonPhrases: z.string().optional()
    }).optional()
  }).optional(),
  context: z.object({
    interests: z.array(z.string()).optional(),
    targetAudience: z.string().optional(),
    topicsToAvoid: z.string().optional()
  }).optional(),
  personality: z.object({
    ocean: z.record(z.number()).optional(),
    communicationStyle: z.record(z.number()).optional()
  }).optional()
});

/**
 * Get current twin data for editing
 */
export const getTwinEditData = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // ✅ SECURITY: Detokenize twinToken from URL
    const { twinToken } = req.params;
    const userId = (req.user as any)?.id || (req.user as any)?.userId;
    if (!userId) {
      throw createError.unauthorized();
    }
    const decoded = detokenizeId(twinToken, { userId, endpoint: 'getTwinEditData' });
    if (!decoded || decoded.type !== 'twin') {
      throw createError.notFound('Invalid twin token', ErrorCodes.TWIN_NOT_FOUND);
    }
    const twinId = decoded.id;

    // Verify twin ownership
    const twinResult = await db.query(`
      SELECT id, "styleVector", "personaData", "systemPrompt", "sampleReply", "createdAt", "last_updated", "style_version"
      FROM "Twin" 
      WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);

    if (twinResult.rows.length === 0) {
      throw createError.notFound('Twin not found or access denied', ErrorCodes.TWIN_NOT_FOUND);
    }

    const twin = twinResult.rows[0];

    res.json({
      success: true,
      twin: {
        id: twin.id,
        styleVector: twin.styleVector,
        personaData: twin.personaData,
        // systemPrompt removed - should not be exposed to users
        sampleReply: twin.sampleReply,
        createdAt: twin.createdAt,
        lastUpdated: twin.last_updated,
        styleVersion: twin.style_version
      }
    });

  } catch (error) {
    next(error); // ✅ Standardize
  }
};

/**
 * Update twin style vector
 */
export const updateTwinStyle = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // ✅ SECURITY: Detokenize twinToken from URL
    const { twinToken } = req.params;
    const userId = (req.user as any)?.id || (req.user as any)?.userId;
    if (!userId) {
      throw createError.unauthorized();
    }
    const decoded = detokenizeId(twinToken, { userId, endpoint: 'updateTwinStyle' });
    if (!decoded || decoded.type !== 'twin') {
      throw createError.notFound('Invalid twin token', ErrorCodes.TWIN_NOT_FOUND);
    }
    const twinId = decoded.id;
    const styleUpdates = updateStyleSchema.parse(req.body);

    // Verify twin ownership and load current style + persona
    const twinResult = await db.query(`
      SELECT id, "styleVector", "personaData" FROM "Twin" 
      WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);

    if (twinResult.rows.length === 0) {
      throw createError.notFound('Twin not found or access denied', ErrorCodes.TWIN_NOT_FOUND);
    }

    const currentStyleVector = twinResult.rows[0].styleVector || {};
    const currentPersonaData = twinResult.rows[0].personaData || null;

    // Merge updates with current style vector
    const updatedStyleVector = {
      ...currentStyleVector,
      ...styleUpdates,
    };

    // Regenerate system prompt with new style + existing persona
    const newSystemPrompt = await twinService.generateSystemPrompt(
      updatedStyleVector,
      currentPersonaData,
    );

    // Update twin in database
    const utcTimestamp = new Date().toISOString();
    await db.query(`
      UPDATE "Twin" 
      SET "styleVector" = $1, "systemPrompt" = $2, "last_updated" = $3::timestamptz, "style_version" = "style_version" + 1
      WHERE id = $4
    `, [JSON.stringify(updatedStyleVector), newSystemPrompt, utcTimestamp, twinId]);

    // Generate new sample reply
    const newSampleReply = await twinService.generateSampleReply(updatedStyleVector);

    res.json({
      success: true,
      message: 'Twin style updated successfully',
      updatedStyleVector,
      newSampleReply,
      systemPrompt: newSystemPrompt,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return next(createError.validation('Invalid input', error.errors));
    }
    next(error);
  }
};

/**
 * Update twin persona data
 */
export const updateTwinPersona = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // ✅ SECURITY: Detokenize twinToken from URL
    const { twinToken } = req.params;
    const userId = (req.user as any)?.id || (req.user as any)?.userId;
    if (!userId) {
      throw createError.unauthorized();
    }
    const decoded = detokenizeId(twinToken, { userId, endpoint: 'updateTwinPersona' });
    if (!decoded || decoded.type !== 'twin') {
      throw createError.notFound('Invalid twin token', ErrorCodes.TWIN_NOT_FOUND);
    }
    const twinId = decoded.id;
    const personaUpdates = updatePersonaSchema.parse(req.body.personaData || req.body);
    
    // Verify twin ownership
    const twinResult = await db.query(`
      SELECT id, "personaData", "styleVector" FROM "Twin" 
      WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);

    if (twinResult.rows.length === 0) {
      throw createError.notFound('Twin not found or access denied', ErrorCodes.TWIN_NOT_FOUND);
    }

    const currentPersonaData = twinResult.rows[0].personaData;
    
    // Merge updates with current persona data
    const updatedPersonaData = {
      ...currentPersonaData,
      ...personaUpdates
    };

    // Regenerate system prompt with new persona
    const newSystemPrompt = await twinService.generateSystemPrompt(twinResult.rows[0].styleVector, updatedPersonaData);

    // Update twin in database
    const utcTimestamp = new Date().toISOString();
    await db.query(`
      UPDATE "Twin" 
      SET "personaData" = $1, "systemPrompt" = $2, "last_updated" = $3::timestamptz
      WHERE id = $4
    `, [JSON.stringify(updatedPersonaData), newSystemPrompt, utcTimestamp, twinId]);

    res.json({
      success: true,
      message: 'Twin persona updated successfully',
      updatedPersonaData,
      systemPrompt: newSystemPrompt
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return next(createError.validation('Invalid input', error.errors));
    }
    next(error);
  }
};

/**
 * Preview style changes without saving
 */
export const previewStyleChanges = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // ✅ SECURITY: Detokenize twinToken from URL
    const { twinToken } = req.params;
    const userId = (req.user as any)?.id || (req.user as any)?.userId;
    if (!userId) {
      throw createError.unauthorized();
    }
    const decoded = detokenizeId(twinToken, { userId, endpoint: 'previewStyleChanges' });
    if (!decoded || decoded.type !== 'twin') {
      throw createError.notFound('Invalid twin token', ErrorCodes.TWIN_NOT_FOUND);
    }
    const twinId = decoded.id;
    const { styleChanges, testMessage } = req.body;

    if (!testMessage) {
      throw createError.validation('Test message is required', ErrorCodes.MISSING_REQUIRED_FIELD);
    }

    // Verify twin ownership
    const twinResult = await db.query(`
      SELECT id, "styleVector", "personaData" FROM "Twin" 
      WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);

    if (twinResult.rows.length === 0) {
      throw createError.notFound('Twin not found or access denied', ErrorCodes.TWIN_NOT_FOUND);
    }

    const currentStyleVector = twinResult.rows[0].styleVector;
    const personaData = twinResult.rows[0].personaData;

    // Generate original response with current style
    const originalResponse = await twinService.generateSampleReply(currentStyleVector);

    // Merge style changes with current style vector
    const previewStyleVector = {
      ...currentStyleVector,
      ...styleChanges
    };

    // Generate new response with preview style
    const newResponse = await twinService.generateSampleReply(previewStyleVector);

    res.json({
      success: true,
      originalResponse,
      newResponse,
      previewStyleVector
    });

  } catch (error) {
    next(error);
  }
};