import { Request, Response } from 'express';
import { generateInviteCode } from '../auth/authService';
import { logger } from '../../config/logger';
import { AuthenticatedRequest } from '../../middleware/auth';
import { db } from '../../config/database';
import { logEvent } from '../../services/eventLogger';
import { EVENT_TYPES } from '../../config/constants';
import { EventLogger } from '../../services/eventLogger';

export const getMyReferralCode = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { db } = await import('../../config/database');
    
    const result = await db.query(
      'SELECT "referralCode" FROM "User" WHERE id = $1',
      [req.user.id]
    );
    
    if (!result.rows[0]?.referralCode) {
      const code = generateInviteCode();
      
      await db.query('UPDATE "User" SET "referralCode" = $1 WHERE id = $2', 
        [code, req.user.id]);
      
      return res.json({
        success: true,
        referralCode: code,
        referralUrl: `/?ref=${code}`
      });
    }
    
    const code = result.rows[0].referralCode;
    
    res.json({
      success: true,
      referralCode: code,
      referralUrl: `/?ref=${code}`
    });
  } catch (error) {
    logger.error('Get referral code error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getMyReferrals = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const referrals = await db.query(
      `SELECT 
         i.*, 
         u.id as referred_user_id, u.email, u.name, u.handle, u."createdAt" as user_created
       FROM "Invite" i
       JOIN "User" u ON i."acceptedBy" = u.id
       WHERE i."inviterId" = $1 AND i."acceptedBy" IS NOT NULL
       ORDER BY i."createdAt" DESC`,
      [req.user.id]
    );
    
    res.json({
      success: true,
      count: referrals.rows.length,
      referrals: referrals.rows.map(r => ({
        code: r.code,
        referredUser: {
          id: r.referred_user_id,
          email: r.email,
          name: r.name,
          handle: r.handle,
          createdAt: r.user_created
        },
        joinedAt: r.createdAt
      }))
    });
  } catch (error) {
    logger.error('Get referrals error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const acceptInvite = async (req: Request, res: Response) => {
  try {
    const { ref: code } = req.query;
    
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'Invalid invite code' });
    }
    
    // Find invite using raw SQL
    const inviteResult = await db.query(
      `SELECT i.*, u.id as inviter_id, u.email as inviter_email, u.handle as inviter_handle
       FROM "Invite" i
       JOIN "User" u ON i."inviterId" = u.id
       WHERE i.code = $1`,
      [code]
    );
    
    if (!inviteResult.rows.length) {
      return res.status(404).json({ error: 'Invalid invite code' });
    }
    
    const invite = inviteResult.rows[0];
    
    // Check if already accepted
    if (invite.acceptedBy) {
      return res.status(400).json({ error: 'Invite already used' });
    }
    
    res.json({
      success: true,
      invite: {
        code: invite.code,
        inviter: {
          id: invite.inviter_id,
          email: invite.inviter_email,
          handle: invite.inviter_handle,
        },
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
    
    // Find invite using raw SQL
    const inviteResult = await db.query(
      'SELECT * FROM "Invite" WHERE code = $1',
      [code]
    );
    
    if (!inviteResult.rows.length) {
      return res.status(404).json({ error: 'Invalid invite code' });
    }
    
    const invite = inviteResult.rows[0];
    
    // Check if already accepted
    if (invite.acceptedBy) {
      return res.status(400).json({ error: 'Invite already used' });
    }
    
    // Update invite with accepted user using raw SQL
    await db.query(
      'UPDATE "Invite" SET "acceptedBy" = $1 WHERE id = $2',
      [req.user.id, invite.id]
    );
    
    // Log invite accepted event using raw SQL
    await EventLogger.logInviteAccepted(req.user.id, code, invite.inviterId);
    
    res.json({ success: true });
  } catch (error) {
    logger.error('Process invite acceptance error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};