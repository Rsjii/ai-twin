import { Request, Response } from 'express';
import { prisma } from '../../config/prisma';
import { db } from '../../config/database';
import { TwinService } from './twinService';
import { logger } from '../../config/logger';
import { z } from 'zod';
import { EventLogger } from '../../services/eventLogger';
import { validateTwinSamples, isContentSafe, sanitizeText } from '../../utils/safety';
import { featureFlags } from '../../config/featureFlags';

const twinService = new TwinService();

const createTwinSchema = z.object({
  samples: z.array(z.string().min(10, 'Each sample must be at least 10 characters').max(1000, 'Each sample must not exceed 1000 characters')).min(1, 'At least 1 sample required').max(5, 'Maximum 5 samples allowed'),
});

// Simple test schema
const testSchema = z.object({
  samples: z.array(z.string())
});

export const createTwin = async (req: Request, res: Response) => {
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

    // Temporarily bypass authentication for testing
    if (!req.user) {
       return res.status(401).json({ error: 'Authentication required' });
    }

    // Check if AI generation is enabled
    if (!featureFlags.ENABLE_AI_GENERATION) {
      return res.status(503).json({ error: 'AI generation is currently disabled' });
    }

    // Validate samples using safety utils
    const validation = validateTwinSamples(samples);
    console.log('Samples received for validation:', samples);
    console.log('Validation result:', validation);
    if (!validation.valid) {
      return res.status(400).json({ 
        error: 'Invalid samples', 
        details: validation.errors 
      });
    }

    // Check content safety
    const combinedText = samples.join(' ');
    const safetyCheck = isContentSafe(combinedText);
    console.log('Safety check result:', safetyCheck);
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
    
  // Save twin to database using raw SQL
   const twinId = `twin_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
   const insertQuery = `
    INSERT INTO "Twin" (id, "userId", "styleVector", "sampleReply", "createdAt")
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, "createdAt"
   `;

   const result = await db.query(insertQuery, [
     twinId,
     req.user.id,
     JSON.stringify(styleVector),
     sampleReply,
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
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getUserTwins = async (req: Request, res: Response) => {
  try {
    console.log('=== GET USER TWINS ===');
    console.log('req.user:', req.user);
    console.log('User ID:', req.user?.id);
    console.log('=====================');
    
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
    
    console.log('Found twins:', twins);
    res.json({ twins });
  } catch (error) {
    logger.error('Get twins error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getTwinById = async (req: Request, res: Response) => {
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
