import { Request, Response } from 'express';
import { db } from '../../config/database';
import { logger } from '../../config/logger';
import { EventLogger } from '../../services/eventLogger';
import { z } from 'zod';
import { EVENT_TYPES } from '../../config/constants';
import { tokenizeId } from '../../utils/idTokenization';

// Validation schemas
const generateShareLinkSchema = z.object({
  twinId: z.string().min(1, 'Twin ID is required'),
  platform: z.enum(['twitter', 'facebook', 'linkedin', 'whatsapp', 'telegram', 'copy']).optional().default('copy')
});

const shareAnalyticsSchema = z.object({
  shareId: z.string().min(1, 'Share ID is required'),
  platform: z.string().min(1, 'Platform is required'),
  referrer: z.string().optional()
});

// Generate shareable URL for a twin
export const generateShareLink = async (req: Request, res: Response) => {
  try {
    const { twinId, platform } = generateShareLinkSchema.parse(req.body);

    // ✅ FIX: Verify twin is public (anyone can share public twins, not just owner)
    const twinResult = await db.query(`
      SELECT id, "publicHandle", "isPublic", "likeCount", "followCount", "chatCount", "allowShares", "userId"
      FROM "Twin"
      WHERE id = $1 AND "isPublic" = true
    `, [twinId]);

    if (twinResult.rows.length === 0) {
      return res.status(404).json({ error: 'Public twin not found' });
    }

    const twin = twinResult.rows[0];

    // ✅ Check if user is blocked (only if user is logged in)
    if (req.user) {
      const blockedCheck = await db.query(`
        SELECT id FROM "TwinBlockedUsers"
        WHERE "twinId" = $1 AND "userId" = $2
      `, [twinId, req.user.id]);
      
      if (blockedCheck.rows.length > 0) {
        return res.status(403).json({
          error: 'You are blocked from interacting with this twin',
          errorCode: 'USER_BLOCKED'
        });
      }
    }

    // ✅ PHASE 2: Check if shares are allowed
    if (twin.allowShares === false) {
      return res.status(403).json({ 
        error: 'Shares are disabled for this twin',
        errorCode: 'SHARES_DISABLED'
      });
    }

    const frontendUrl = process.env.FRONTEND_URL;
    if (!frontendUrl) {
      logger.error('FRONTEND_URL not set in environment variables');
      return res.status(500).json({ error: 'Server configuration error: FRONTEND_URL not set' });
    }
    const shareUrl = `${frontendUrl}/@${twin.publicHandle}`;

    // Generate share content based on platform
    let shareContent = '';
    let shareTitle = '';
    
    switch (platform) {
      case 'twitter':
        shareTitle = `Check out my twin @${twin.publicHandle}!`;
        shareContent = `💬 Meet my twin @${twin.publicHandle}! Chat with it and see how it responds in my style. ${shareUrl}`;
        break;
      case 'facebook':
        shareTitle = `My Twin - @${twin.publicHandle}`;
        shareContent = `I created a digital version of myself that you can chat with! It talks just like me — same style, same personality. Give it a try and let me know what you think! ${shareUrl}`;
        break;
      case 'linkedin':
        shareTitle = `Twin: @${twin.publicHandle}`;
        shareContent = `I've built a digital version of myself that captures how I communicate. Have a conversation with it and experience personalized digital interaction. ${shareUrl}`;
        break;
      case 'whatsapp':
        shareContent = `💬 Hey! I created a digital version of myself that you can chat with. It responds just like I would. Check it out: ${shareUrl}`;
        break;
      case 'telegram':
        shareContent = `💬 I built my twin @${twin.publicHandle}! Chat with it and see how it responds in my style. ${shareUrl}`;
        break;
      default:
        shareContent = shareUrl;
        shareTitle = `Twin: @${twin.publicHandle}`;
    }

    // ✅ FIX: Log share event (userId can be null for anonymous users)
    const userId = req.user?.id || null;
    if (userId) {
      // Logged-in user: use logProfileShared
      await EventLogger.logProfileShared(userId, twinId, {
        shareMethod: platform,
        shareUrl
      });
    } else {
      // Anonymous user: log with null userId
      await EventLogger.log(null, EVENT_TYPES.TWIN_SHARED, {
        twinId,
        publicTwinId: tokenizeId(twinId, 'twin'),
        shareMethod: platform,
        shareUrl
      });
    }

    res.json({
      success: true,
      shareUrl,
      shareContent,
      shareTitle,
      platform,
      twin: {
        id: twin.id,
        publicHandle: twin.publicHandle,
        likeCount: twin.likeCount,
        followCount: twin.followCount,
        chatCount: twin.chatCount
      }
    });

  } catch (error) {
    logger.error('Generate share link error:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Invalid input', 
        details: error.errors 
      });
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get share analytics for a twin
export const getShareAnalytics = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { twinId } = req.params;

    // Verify twin belongs to user
    const twinResult = await db.query(`
      SELECT id, "publicHandle", "isPublic"
      FROM "Twin"
      WHERE id = $1 AND "userId" = $2
    `, [twinId, req.user.id]);

    if (twinResult.rows.length === 0) {
      return res.status(404).json({ error: 'Twin not found or not owned by user' });
    }

    // Get share analytics from events
    const analyticsResult = await db.query(`
      SELECT 
        COUNT(*) as total_shares,
        COUNT(CASE WHEN meta->>'platform' = 'twitter' THEN 1 END) as twitter_shares,
        COUNT(CASE WHEN meta->>'platform' = 'facebook' THEN 1 END) as facebook_shares,
        COUNT(CASE WHEN meta->>'platform' = 'linkedin' THEN 1 END) as linkedin_shares,
        COUNT(CASE WHEN meta->>'platform' = 'whatsapp' THEN 1 END) as whatsapp_shares,
        COUNT(CASE WHEN meta->>'platform' = 'telegram' THEN 1 END) as telegram_shares,
        COUNT(CASE WHEN meta->>'platform' = 'copy' THEN 1 END) as copy_shares,
        MAX("createdAt") as last_shared
      FROM "Event"
      WHERE "userId" = $1 AND type = 'twin_shared' AND meta->>'twinId' = $2
    `, [req.user.id, twinId]);

    const analytics = analyticsResult.rows[0];

    res.json({
      success: true,
      analytics: {
        totalShares: parseInt(analytics.total_shares) || 0,
        platformBreakdown: {
          twitter: parseInt(analytics.twitter_shares) || 0,
          facebook: parseInt(analytics.facebook_shares) || 0,
          linkedin: parseInt(analytics.linkedin_shares) || 0,
          whatsapp: parseInt(analytics.whatsapp_shares) || 0,
          telegram: parseInt(analytics.telegram_shares) || 0,
          copy: parseInt(analytics.copy_shares) || 0
        },
        lastShared: analytics.last_shared
      }
    });

  } catch (error) {
    logger.error('Get share analytics error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Track share click (when someone clicks a shared link)
export const trackShareClick = async (req: Request, res: Response) => {
  try {
    const { shareId, platform, referrer } = shareAnalyticsSchema.parse(req.body);

    // Log share click event
    await EventLogger.logSystemEvent(EVENT_TYPES.SHARE_CLICKED, {
      shareId,
      platform,
      referrer: referrer || 'direct'
    });

    res.json({
      success: true,
      message: 'Share click tracked'
    });

  } catch (error) {
    logger.error('Track share click error:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Invalid input', 
        details: error.errors 
      });
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get popular share platforms
export const getPopularSharePlatforms = async (req: Request, res: Response) => {
  try {
    const popularPlatforms = await db.query(`
      SELECT 
        meta->>'platform' as platform,
        COUNT(*) as share_count
      FROM "Event"
      WHERE type = 'twin_shared'
      AND "createdAt" >= NOW() - INTERVAL '30 days'
      GROUP BY meta->>'platform'
      ORDER BY share_count DESC
      LIMIT 10
    `);

    res.json({
      success: true,
      platforms: popularPlatforms.rows
    });

  } catch (error) {
    logger.error('Get popular share platforms error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Generate QR code for twin (for easy mobile sharing)
export const generateQRCode = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { twinId } = req.params;

    // Verify twin belongs to user and is public
    const twinResult = await db.query(`
      SELECT id, "publicHandle", "isPublic"
      FROM "Twin"
      WHERE id = $1 AND "userId" = $2 AND "isPublic" = true
    `, [twinId, req.user.id]);

    if (twinResult.rows.length === 0) {
      return res.status(404).json({ error: 'Public twin not found or not owned by user' });
    }

    const twin = twinResult.rows[0];
    const frontendUrl = process.env.FRONTEND_URL;
    if (!frontendUrl) {
      logger.error('FRONTEND_URL not set in environment variables');
      return res.status(500).json({ error: 'Server configuration error: FRONTEND_URL not set' });
    }
    const shareUrl = `${frontendUrl}/@${twin.publicHandle}`;

    // Generate QR code URL (using a QR code service)
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(shareUrl)}`;

    res.json({
      success: true,
      qrCodeUrl,
      shareUrl,
      twin: {
        id: twin.id,
        publicHandle: twin.publicHandle
      }
    });

  } catch (error) {
    logger.error('Generate QR code error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get shareable content for different platforms
export const getShareableContent = async (req: Request, res: Response) => {
  try {
    const { handle } = req.params;
    const { platform } = req.query;

    // Get public twin by handle
    const twinResult = await db.query(`
      SELECT 
        t.id,
        t."publicHandle",
        t."bio",
        t."likeCount",
        t."followCount",
        t."chatCount",
        t."allowShares",
        u.handle as "userHandle",
        u.name   as "userName"
      FROM "Twin" t
      JOIN "User" u ON t."userId" = u.id
      WHERE u.handle = $1
        AND t."isPublic" = true
    `, [handle]);    

    if (twinResult.rows.length === 0) {
      return res.status(404).json({ error: 'Public twin not found' });
    }

    const twin = twinResult.rows[0];

    // ✅ PHASE 2: Check if shares are allowed
    if (twin.allowShares === false) {
      return res.status(403).json({ 
        error: 'Shares are disabled for this twin',
        errorCode: 'SHARES_DISABLED'
      });
    }

    const frontendUrl = process.env.FRONTEND_URL;
    if (!frontendUrl) {
      logger.error('FRONTEND_URL not set in environment variables');
      return res.status(500).json({ error: 'Server configuration error: FRONTEND_URL not set' });
    }
    // ✅ FIX: Use fallback for publicHandle to prevent null in share messages
    const publicHandle = twin.publicHandle || twin.userHandle || 'twin';
    const shareUrl = `${frontendUrl}/@${publicHandle}`;

    // ✅ FIX: Use fallback for userName to prevent null in share messages
    const creatorName = twin.userName || twin.userHandle || 'the creator';

    // Generate content for different platforms
    const content = {
      twitter: {
        text: `💬 Meet this amazing twin @${publicHandle}! Chat with it and see how it responds in ${creatorName}'s style.`,
        hashtags: ['Twin', 'DigitalSelf', 'Chat', 'Personalized']
      },
      facebook: {
        title: `Twin: @${publicHandle}`,
        description: `Chat with this twin created by ${creatorName}! It's a digital version that talks just like them — same style, same personality. Give it a try!`,
        url: shareUrl
      },
      linkedin: {
        title: `Twin: @${publicHandle}`,
        summary: `A personalized digital version created by ${creatorName}. Experience how it communicates in their unique style by having a conversation with it.`,
        url: shareUrl
      },
      whatsapp: {
        text: `💬 Hey! Check out this twin @${publicHandle}! It's a digital version that chats just like ${creatorName}. Try it: ${shareUrl}`
      },
      telegram: {
        text: `💬 Twin: @${publicHandle}\n\nChat with this digital version and see how it responds in ${creatorName}'s style! ${shareUrl}`
      },
      email: {
        subject: `Check out this Twin: @${publicHandle}`,
        body: `Hi!\n\nI found this amazing twin that you can chat with:\n\nTwin: @${publicHandle}\nCreator: ${creatorName}\n\nIt's a digital version that talks just like ${creatorName} — same communication style and personality. You can chat with it here:\n${shareUrl}\n\nTry it out and let me know what you think!`
      },
      copy: {
        text: `💬 Hey! Check out this twin @${publicHandle}! It's a digital version that chats just like ${creatorName}. Try it: ${shareUrl}`
      }
    };

    res.json({
      success: true,
      shareUrl,
      content: platform ? content[platform as keyof typeof content] : content,
      twin: {
        id: twin.id,
        publicHandle: publicHandle,
        bio: twin.bio,
        likeCount: twin.likeCount,
        followCount: twin.followCount,
        chatCount: twin.chatCount,
        creator: {
          name: creatorName
        }
      }
    });

  } catch (error) {
    logger.error('Get shareable content error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
