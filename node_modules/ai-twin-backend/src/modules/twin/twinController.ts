import { Request, Response } from 'express';
import { prisma } from '../../config/prisma';
import { TwinService } from './twinService';
import { logger } from '../../config/logger';
import { z } from 'zod';
import { AuthenticatedRequest } from '../../middleware/auth';
import { EventLogger } from '../../services/eventLogger';
import { validateTwinSamples, isContentSafe, sanitizeText } from '../../utils/safety';
import { featureFlags } from '../../config/featureFlags';

const twinService = new TwinService();

const createTwinSchema = z.object({
  samples: z.array(z.string().min(10, 'Each sample must be at least 10 characters').max(1000, 'Each sample must not exceed 1000 characters')).min(3, 'At least 3 samples required').max(5, 'Maximum 5 samples allowed'),
});

export const createTwin = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { samples } = createTwinSchema.parse(req.body);
    
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Check if AI generation is enabled
    if (!featureFlags.ENABLE_AI_GENERATION) {
      return res.status(503).json({ error: 'AI generation is currently disabled' });
    }

    // Validate samples using safety utils
    const validation = validateTwinSamples(samples);
    if (!validation.valid) {
      return res.status(400).json({ 
        error: 'Invalid samples', 
        details: validation.errors 
      });
    }

    // Check content safety
    const combinedText = samples.join(' ');
    const safetyCheck = isContentSafe(combinedText);
    if (!safetyCheck.safe) {
      return res.status(400).json({ 
        error: 'Content safety check failed', 
        reasons: safetyCheck.reasons 
      });
    }

    // Sanitize samples
    const sanitizedSamples = samples.map(sample => sanitizeText(sample));
    
    // Extract style vector
    const styleVector = await twinService.extractStyle(sanitizedSamples.join('\n---\n'));
    
    // Generate sample reply
    const sampleReply = await twinService.generateSampleReply(styleVector);
    
    // Save twin to database
    const twin = await prisma.twin.create({
      data: {
        userId: req.user.id,
        styleVector: styleVector as any, // Prisma JSON type
        sampleReply,
      },
    });
    
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
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getUserTwins = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const twins = await prisma.twin.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        styleVector: true,
        sampleReply: true,
        createdAt: true,
      },
    });
    
    res.json({ twins });
  } catch (error) {
    logger.error('Get twins error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getTwinById = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const twin = await prisma.twin.findFirst({
      where: {
        id,
        userId: req.user.id,
      },
    });
    
    if (!twin) {
      return res.status(404).json({ error: 'Twin not found' });
    }
    
    res.json({ twin });
  } catch (error) {
    logger.error('Get twin error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
