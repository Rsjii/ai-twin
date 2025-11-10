import { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../../config/database';
import { logger } from '../../config/logger';
import { TwinService } from './twinService';

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
export const getTwinEditData = async (req: Request, res: Response) => {
  try {
    const { id: twinId } = req.params;
    const userId = req.user.id;

    // Verify twin ownership
    const twinResult = await db.query(`
      SELECT id, "styleVector", "personaData", "systemPrompt", "sampleReply", "createdAt", "last_updated", "style_version"
      FROM "Twin" 
      WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);

    if (twinResult.rows.length === 0) {
      return res.status(404).json({ error: 'Twin not found or access denied' });
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
    logger.error('Get twin edit data error:', error);
    res.status(500).json({ error: 'Failed to get twin edit data' });
  }
};

/**
 * Update twin style vector
 */
export const updateTwinStyle = async (req: Request, res: Response) => {
  try {
    const { id: twinId } = req.params;
    const userId = req.user.id;
    const styleUpdates = updateStyleSchema.parse(req.body);

    // Verify twin ownership
    const twinResult = await db.query(`
      SELECT id, "styleVector" FROM "Twin" 
      WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);

    if (twinResult.rows.length === 0) {
      return res.status(404).json({ error: 'Twin not found or access denied' });
    }

    const currentStyleVector = twinResult.rows[0].styleVector;
    
    // Merge updates with current style vector
    const updatedStyleVector = {
      ...currentStyleVector,
      ...styleUpdates
    };

    // Regenerate system prompt with new style
    const newSystemPrompt = await twinService.generateSystemPrompt(updatedStyleVector, twinResult.rows[0].personaData);

    // Update twin in database
    await db.query(`
      UPDATE "Twin" 
      SET "styleVector" = $1, "systemPrompt" = $2, "last_updated" = NOW(), "style_version" = "style_version" + 1
      WHERE id = $3
    `, [JSON.stringify(updatedStyleVector), newSystemPrompt, twinId]);

    // Generate new sample reply
    const newSampleReply = await twinService.generateSampleReply(updatedStyleVector);

    res.json({
      success: true,
      message: 'Twin style updated successfully',
      updatedStyleVector,
      newSampleReply,
      systemPrompt: newSystemPrompt
    });

  } catch (error) {
    logger.error('Update twin style error:', error);
    res.status(500).json({ error: 'Failed to update twin style' });
  }
};

/**
 * Update twin persona data
 */
export const updateTwinPersona = async (req: Request, res: Response) => {
  try {
    const { id: twinId } = req.params;
    const userId = req.user.id;
    const personaUpdates = updatePersonaSchema.parse(req.body.personaData || req.body);
    
    // Verify twin ownership
    const twinResult = await db.query(`
      SELECT id, "personaData", "styleVector" FROM "Twin" 
      WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);

    if (twinResult.rows.length === 0) {
      return res.status(404).json({ error: 'Twin not found or access denied' });
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
    await db.query(`
      UPDATE "Twin" 
      SET "personaData" = $1, "systemPrompt" = $2, "last_updated" = NOW()
      WHERE id = $3
    `, [JSON.stringify(updatedPersonaData), newSystemPrompt, twinId]);

    res.json({
      success: true,
      message: 'Twin persona updated successfully',
      updatedPersonaData,
      systemPrompt: newSystemPrompt
    });

  } catch (error) {
    logger.error('Update twin persona error:', error);
    res.status(500).json({ error: 'Failed to update twin persona' });
  }
};

/**
 * Preview style changes without saving
 */
export const previewStyleChanges = async (req: Request, res: Response) => {
  try {
    const { id: twinId } = req.params;
    const userId = req.user.id;
    const { styleChanges, testMessage } = req.body;

    if (!testMessage) {
      return res.status(400).json({ 
        success: false, 
        error: 'Test message is required' 
      });
    }

    // Verify twin ownership
    const twinResult = await db.query(`
      SELECT id, "styleVector", "personaData" FROM "Twin" 
      WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);

    if (twinResult.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: 'Twin not found or access denied' 
      });
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
    logger.error('Preview style changes error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to preview style changes' 
    });
  }
};