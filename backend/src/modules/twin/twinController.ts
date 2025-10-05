import { Request, Response } from 'express';
import { prisma } from '../../config/prisma';
import { TwinService } from './twinService';
import { logger } from '../../config/logger';
import { z } from 'zod';
import { AuthenticatedRequest } from '../../middleware/auth';

const twinService = new TwinService();

const createTwinSchema = z.object({
  samples: z.string().min(100, 'At least 100 characters required').max(3000, 'Maximum 3000 characters allowed'),
});

export const createTwin = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { samples } = createTwinSchema.parse(req.body);
    
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Extract style vector
    const styleVector = await twinService.extractStyle(samples);
    
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
    
    // Log twin creation event
    await prisma.event.create({
      data: {
        userId: req.user.id,
        type: 'twin_created',
        meta: { twinId: twin.id },
      },
    });
    
    res.json({
      success: true,
      twin: {
        id: twin.id,
        styleVector,
        sampleReply,
      },
    });
  } catch (error) {
    logger.error('Twin creation error:', error);
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
