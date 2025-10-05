import { Request, Response } from 'express';
import { prisma } from '../../config/db';
import { generateProfileToken, verifyProfileToken } from '../auth/authService';
import { logger } from '../../config/logger';
import { z } from 'zod';
import { AuthenticatedRequest } from '../../middleware/auth';

const updateHandleSchema = z.object({
  handle: z.string().min(3, 'Handle must be at least 3 characters').max(20, 'Handle too long').regex(/^[a-zA-Z0-9_-]+$/, 'Handle can only contain letters, numbers, hyphens, and underscores'),
});

export const updateHandle = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { handle } = updateHandleSchema.parse(req.body);
    
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Check if handle is already taken
    const existingUser = await prisma.user.findUnique({
      where: { handle },
    });
    
    if (existingUser && existingUser.id !== req.user.id) {
      return res.status(400).json({ error: 'Handle already taken' });
    }
    
    // Update user handle
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { handle },
    });
    
    // Update session
    req.session!.userHandle = handle;
    
    res.json({
      success: true,
      handle: user.handle,
    });
  } catch (error) {
    logger.error('Update handle error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getPublicProfile = async (req: Request, res: Response) => {
  try {
    const { handle } = req.params;
    const { t: token } = req.query;
    
    // Verify token
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Invalid or missing token' });
    }
    
    const tokenData = verifyProfileToken(token);
    if (!tokenData || tokenData.handle !== handle) {
      return res.status(400).json({ error: 'Invalid or expired token' });
    }
    
    // Get user and their latest twin
    const user = await prisma.user.findUnique({
      where: { handle },
      include: {
        twins: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            styleVector: true,
            sampleReply: true,
            createdAt: true,
          },
        },
      },
    });
    
    if (!user || !user.twins.length) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    
    const twin = user.twins[0];
    
    res.json({
      user: {
        handle: user.handle,
        createdAt: user.createdAt,
      },
      twin: {
        styleVector: twin.styleVector,
        sampleReply: twin.sampleReply,
        createdAt: twin.createdAt,
      },
    });
  } catch (error) {
    logger.error('Get public profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const generateProfileLink = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!req.user.handle) {
      return res.status(400).json({ error: 'Handle not set. Please set a handle first.' });
    }
    
    // Generate token
    const token = generateProfileToken(req.user.id, req.user.handle);
    const profileUrl = `/p/${req.user.handle}?t=${token}`;
    
    res.json({
      success: true,
      profileUrl,
      token,
    });
  } catch (error) {
    logger.error('Generate profile link error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const logProfileShare = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Log profile shared event
    await prisma.event.create({
      data: {
        userId: req.user.id,
        type: 'profile_shared',
      },
    });
    
    res.json({ success: true });
  } catch (error) {
    logger.error('Log profile share error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
