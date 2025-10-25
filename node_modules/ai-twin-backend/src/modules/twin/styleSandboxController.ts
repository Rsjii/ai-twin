import { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../../config/database';
import { logger } from '../../config/logger';
import { TwinService } from './twinService';

const twinService = new TwinService();

const previewStyleSchema = z.object({
  styleChanges: z.record(z.any()),
  testMessage: z.string().min(1).max(500)
});

/**
 * Preview style changes without saving
 */
export const previewStyleChanges = async (req: Request, res: Response) => {
  try {
    const { twinId } = req.params;
    const userId = req.user.id;
    const { styleChanges, testMessage } = previewStyleSchema.parse(req.body);

    // Verify twin ownership
    const twinResult = await db.query(`
      SELECT id, "styleVector", "personaData", "systemPrompt", "sampleReply"
      FROM "Twin" 
      WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);

    if (twinResult.rows.length === 0) {
      return res.status(404).json({ error: 'Twin not found or access denied' });
    }

    const twin = twinResult.rows[0];
    const currentStyleVector = twin.styleVector;

    // Apply temporary changes
    const tempStyleVector = {
      ...currentStyleVector,
      ...styleChanges
    };

    // Generate test response with temporary style
    const testResponse = await twinService.generateDraftWithContext({
      styleVector: tempStyleVector,
      personaData: twin.personaData,
      systemPrompt: twin.systemPrompt,
      chatMemory: [],
      currentMessages: [testMessage],
      twinId
    });

    // Generate original response for comparison
    const originalResponse = await twinService.generateDraftWithContext({
      styleVector: currentStyleVector,
      personaData: twin.personaData,
      systemPrompt: twin.systemPrompt,
      chatMemory: [],
      currentMessages: [testMessage],
      twinId
    });

    res.json({
      success: true,
      originalResponse,
      newResponse: testResponse,
      changes: styleChanges,
      styleComparison: {
        original: currentStyleVector,
        updated: tempStyleVector
      }
    });

  } catch (error) {
    logger.error('Preview style changes error:', error);
    res.status(500).json({ error: 'Failed to preview style changes' });
  }
};

/**
 * Get style comparison data
 */
export const getStyleComparison = async (req: Request, res: Response) => {
  try {
    const { twinId } = req.params;
    const userId = req.user.id;

    // Verify twin ownership
    const twinResult = await db.query(`
      SELECT "styleVector", "personaData" FROM "Twin" 
      WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);

    if (twinResult.rows.length === 0) {
      return res.status(404).json({ error: 'Twin not found or access denied' });
    }

    const twin = twinResult.rows[0];

    res.json({
      success: true,
      currentStyle: twin.styleVector,
      personaData: twin.personaData
    });

  } catch (error) {
    logger.error('Get style comparison error:', error);
    res.status(500).json({ error: 'Failed to get style comparison' });
  }
};