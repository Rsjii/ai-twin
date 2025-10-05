import { Request, Response } from 'express';
import { prisma } from '../../config/prisma';
import { generateInviteCode } from '../auth/authService';
import { logger } from '../../config/logger';
import { AuthenticatedRequest } from '../../middleware/auth';

export const createInvite = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Generate unique invite code
    const code = generateInviteCode();
    
    // Create invite
    const invite = await prisma.invite.create({
      data: {
        code,
        inviterId: req.user.id,
      },
    });
    
    // Log invite sent event
    await prisma.event.create({
      data: {
        userId: req.user.id,
        type: 'invite_sent',
        meta: { inviteId: invite.id, code },
      },
    });
    
    const inviteUrl = `/?ref=${code}`;
    
    res.json({
      success: true,
      inviteUrl,
      code,
    });
  } catch (error) {
    logger.error('Create invite error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const acceptInvite = async (req: Request, res: Response) => {
  try {
    const { ref: code } = req.query;
    
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'Invalid invite code' });
    }
    
    // Find invite
    const invite = await prisma.invite.findUnique({
      where: { code },
      include: {
        inviter: {
          select: {
            id: true,
            email: true,
            handle: true,
          },
        },
      },
    });
    
    if (!invite) {
      return res.status(404).json({ error: 'Invalid invite code' });
    }
    
    // Check if already accepted
    if (invite.acceptedBy) {
      return res.status(400).json({ error: 'Invite already used' });
    }
    
    res.json({
      success: true,
      invite: {
        code: invite.code,
        inviter: invite.inviter,
        createdAt: invite.createdAt,
      },
    });
  } catch (error) {
    logger.error('Accept invite error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const processInviteAcceptance = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { code } = req.body;
    
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!code) {
      return res.status(400).json({ error: 'Invite code required' });
    }
    
    // Find invite
    const invite = await prisma.invite.findUnique({
      where: { code },
    });
    
    if (!invite) {
      return res.status(404).json({ error: 'Invalid invite code' });
    }
    
    // Check if already accepted
    if (invite.acceptedBy) {
      return res.status(400).json({ error: 'Invite already used' });
    }
    
    // Update invite with accepted user
    await prisma.invite.update({
      where: { id: invite.id },
      data: { acceptedBy: req.user.id },
    });
    
    // Log invite accepted event
    await prisma.event.create({
      data: {
        userId: req.user.id,
        type: 'invite_accepted',
        meta: { inviteId: invite.id, inviterId: invite.inviterId },
      },
    });
    
    res.json({ success: true });
  } catch (error) {
    logger.error('Process invite acceptance error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
