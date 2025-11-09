"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getShareableContent = exports.generateQRCode = exports.getPopularSharePlatforms = exports.trackShareClick = exports.getShareAnalytics = exports.generateShareLink = void 0;
const database_1 = require("../../config/database");
const logger_1 = require("../../config/logger");
const eventLogger_1 = require("../../services/eventLogger");
const zod_1 = require("zod");
const generateShareLinkSchema = zod_1.z.object({
    twinId: zod_1.z.string().min(1, 'Twin ID is required'),
    platform: zod_1.z.enum(['twitter', 'facebook', 'linkedin', 'whatsapp', 'telegram', 'copy']).optional().default('copy')
});
const shareAnalyticsSchema = zod_1.z.object({
    shareId: zod_1.z.string().min(1, 'Share ID is required'),
    platform: zod_1.z.string().min(1, 'Platform is required'),
    referrer: zod_1.z.string().optional()
});
const generateShareLink = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const { twinId, platform } = generateShareLinkSchema.parse(req.body);
        const twinResult = await database_1.db.query(`
      SELECT id, "publicHandle", "isPublic", "likeCount", "followCount", "chatCount"
      FROM "Twin"
      WHERE id = $1 AND "userId" = $2 AND "isPublic" = true
    `, [twinId, req.user.id]);
        if (twinResult.rows.length === 0) {
            return res.status(404).json({ error: 'Public twin not found or not owned by user' });
        }
        const twin = twinResult.rows[0];
        const shareUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/@${twin.publicHandle}`;
        let shareContent = '';
        let shareTitle = '';
        switch (platform) {
            case 'twitter':
                shareTitle = `Check out my AI twin @${twin.publicHandle}!`;
                shareContent = `🤖 I created an AI twin that you can chat with! Check it out: ${shareUrl}`;
                break;
            case 'facebook':
                shareTitle = `My AI Twin - @${twin.publicHandle}`;
                shareContent = `I created an AI twin that you can chat with! It has ${twin.likeCount} likes, ${twin.followCount} followers, and ${twin.chatCount} chats. Try it out: ${shareUrl}`;
                break;
            case 'linkedin':
                shareTitle = `AI Twin: @${twin.publicHandle}`;
                shareContent = `I've created an AI twin using advanced AI technology. You can chat with it and experience personalized AI interactions. Check it out: ${shareUrl}`;
                break;
            case 'whatsapp':
                shareContent = `🤖 Check out my AI twin! You can chat with it: ${shareUrl}`;
                break;
            case 'telegram':
                shareContent = `🤖 I created an AI twin that you can chat with! Try it: ${shareUrl}`;
                break;
            default:
                shareContent = shareUrl;
                shareTitle = `AI Twin: @${twin.publicHandle}`;
        }
        await eventLogger_1.EventLogger.logUserEvent(req.user.id, 'twin_shared', {
            twinId,
            platform,
            shareUrl,
            publicHandle: twin.publicHandle
        });
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
    }
    catch (error) {
        logger_1.logger.error('Generate share link error:', error);
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({
                error: 'Invalid input',
                details: error.errors
            });
        }
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.generateShareLink = generateShareLink;
const getShareAnalytics = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const { twinId } = req.params;
        const twinResult = await database_1.db.query(`
      SELECT id, "publicHandle", "isPublic"
      FROM "Twin"
      WHERE id = $1 AND "userId" = $2
    `, [twinId, req.user.id]);
        if (twinResult.rows.length === 0) {
            return res.status(404).json({ error: 'Twin not found or not owned by user' });
        }
        const analyticsResult = await database_1.db.query(`
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
    }
    catch (error) {
        logger_1.logger.error('Get share analytics error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getShareAnalytics = getShareAnalytics;
const trackShareClick = async (req, res) => {
    try {
        const { shareId, platform, referrer } = shareAnalyticsSchema.parse(req.body);
        await eventLogger_1.EventLogger.logUserEvent('anonymous', 'share_clicked', {
            shareId,
            platform,
            referrer: referrer || 'direct'
        });
        res.json({
            success: true,
            message: 'Share click tracked'
        });
    }
    catch (error) {
        logger_1.logger.error('Track share click error:', error);
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({
                error: 'Invalid input',
                details: error.errors
            });
        }
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.trackShareClick = trackShareClick;
const getPopularSharePlatforms = async (req, res) => {
    try {
        const popularPlatforms = await database_1.db.query(`
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
    }
    catch (error) {
        logger_1.logger.error('Get popular share platforms error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getPopularSharePlatforms = getPopularSharePlatforms;
const generateQRCode = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const { twinId } = req.params;
        const twinResult = await database_1.db.query(`
      SELECT id, "publicHandle", "isPublic"
      FROM "Twin"
      WHERE id = $1 AND "userId" = $2 AND "isPublic" = true
    `, [twinId, req.user.id]);
        if (twinResult.rows.length === 0) {
            return res.status(404).json({ error: 'Public twin not found or not owned by user' });
        }
        const twin = twinResult.rows[0];
        const shareUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/@${twin.publicHandle}`;
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
    }
    catch (error) {
        logger_1.logger.error('Generate QR code error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.generateQRCode = generateQRCode;
const getShareableContent = async (req, res) => {
    try {
        const { handle } = req.params;
        const { platform } = req.query;
        const twinResult = await database_1.db.query(`
      SELECT t.id, t."publicHandle", t."bio", t."likeCount", t."followCount", t."chatCount",
             u.handle as "userHandle", u.name as "userName"
      FROM "Twin" t
      JOIN "User" u ON t."userId" = u.id
      WHERE t."publicHandle" = $1 AND t."isPublic" = true
    `, [handle]);
        if (twinResult.rows.length === 0) {
            return res.status(404).json({ error: 'Public twin not found' });
        }
        const twin = twinResult.rows[0];
        const shareUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/@${twin.publicHandle}`;
        const content = {
            twitter: {
                text: `🤖 Check out this amazing AI twin @${twin.publicHandle}! You can chat with it and experience personalized AI interactions. ${shareUrl}`,
                hashtags: ['AI', 'Twin', 'ChatBot', 'ArtificialIntelligence']
            },
            facebook: {
                title: `AI Twin: @${twin.publicHandle}`,
                description: `Chat with this AI twin created by ${twin.userName}! It has ${twin.likeCount} likes, ${twin.followCount} followers, and ${twin.chatCount} chats.`,
                url: shareUrl
            },
            linkedin: {
                title: `AI Twin: @${twin.publicHandle}`,
                summary: `Experience the future of AI with this personalized twin. Created by ${twin.userName}, this AI twin has ${twin.likeCount} likes and ${twin.chatCount} conversations.`,
                url: shareUrl
            },
            whatsapp: {
                text: `🤖 Check out this AI twin @${twin.publicHandle}! You can chat with it: ${shareUrl}`
            },
            telegram: {
                text: `🤖 AI Twin: @${twin.publicHandle}\n\nChat with this amazing AI twin! ${shareUrl}`
            },
            email: {
                subject: `Check out this AI Twin: @${twin.publicHandle}`,
                body: `Hi!\n\nI found this amazing AI twin that you can chat with:\n\nTwin: @${twin.publicHandle}\nCreator: ${twin.userName}\n\nYou can chat with it here: ${shareUrl}\n\nTry it out and let me know what you think!`
            }
        };
        res.json({
            success: true,
            shareUrl,
            content: platform ? content[platform] : content,
            twin: {
                id: twin.id,
                publicHandle: twin.publicHandle,
                bio: twin.bio,
                likeCount: twin.likeCount,
                followCount: twin.followCount,
                chatCount: twin.chatCount,
                creator: {
                    handle: twin.userHandle,
                    name: twin.userName
                }
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Get shareable content error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getShareableContent = getShareableContent;
//# sourceMappingURL=shareController.js.map