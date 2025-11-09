"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getModerationStats = exports.reportContent = exports.moderateContent = exports.ModerationLevel = void 0;
exports.getModerationSettings = getModerationSettings;
exports.moderateContentSync = moderateContentSync;
const database_1 = require("../../config/database");
const logger_1 = require("../../config/logger");
const eventLogger_1 = require("../../services/eventLogger");
const zod_1 = require("zod");
var ModerationLevel;
(function (ModerationLevel) {
    ModerationLevel["NONE"] = "none";
    ModerationLevel["BASIC"] = "basic";
    ModerationLevel["STRICT"] = "strict";
    ModerationLevel["MAXIMUM"] = "maximum";
})(ModerationLevel || (exports.ModerationLevel = ModerationLevel = {}));
const moderateContentSchema = zod_1.z.object({
    content: zod_1.z.string().min(1, 'Content is required'),
    contentType: zod_1.z.enum(['message', 'bio', 'comment', 'profile']).default('message'),
    userId: zod_1.z.string().optional(),
    twinId: zod_1.z.string().optional()
});
const reportContentSchema = zod_1.z.object({
    contentId: zod_1.z.string().min(1, 'Content ID is required'),
    contentType: zod_1.z.enum(['message', 'twin', 'user', 'comment']),
    reason: zod_1.z.enum(['spam', 'harassment', 'inappropriate', 'fake', 'other']),
    description: zod_1.z.string().optional()
});
const moderateContent = async (req, res) => {
    try {
        const { content, contentType, userId, twinId } = moderateContentSchema.parse(req.body);
        const moderationSettings = await getModerationSettings();
        const basicChecks = await performBasicModeration(content);
        let aiModeration = null;
        if (moderationSettings.useAIModeration) {
            aiModeration = await performAIModeration(content, contentType);
        }
        const spamCheck = await detectSpam(content, userId, twinId);
        const isApproved = basicChecks.isApproved &&
            (!aiModeration || aiModeration.isApproved) &&
            !spamCheck.isSpam;
        const moderationResult = {
            isApproved,
            confidence: Math.max(basicChecks.confidence, aiModeration?.confidence || 0, spamCheck.confidence),
            reasons: [
                ...basicChecks.reasons,
                ...(aiModeration?.reasons || []),
                ...spamCheck.reasons
            ],
            suggestions: [
                ...basicChecks.suggestions,
                ...(aiModeration?.suggestions || []),
                ...spamCheck.suggestions
            ]
        };
        if (userId) {
            await eventLogger_1.EventLogger.logUserEvent(userId, 'content_moderated', {
                contentType,
                isApproved,
                confidence: moderationResult.confidence,
                twinId
            });
        }
        res.json({
            success: true,
            moderation: moderationResult
        });
    }
    catch (error) {
        logger_1.logger.error('Moderate content error:', error);
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({
                error: 'Invalid input',
                details: error.errors
            });
        }
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.moderateContent = moderateContent;
const reportContent = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const { contentId, contentType, reason, description } = reportContentSchema.parse(req.body);
        const existingReport = await database_1.db.query(`
      SELECT id FROM "ContentReport"
      WHERE "contentId" = $1 AND "contentType" = $2 AND "reporterId" = $3
    `, [contentId, contentType, req.user.id]);
        if (existingReport.rows.length > 0) {
            return res.status(400).json({ error: 'Content already reported by you' });
        }
        await database_1.db.query(`
      INSERT INTO "ContentReport" ("id", "contentId", "contentType", "reason", "description", "reporterId", "createdAt")
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
    `, [
            `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            contentId,
            contentType,
            reason,
            description || '',
            req.user.id
        ]);
        await eventLogger_1.EventLogger.logUserEvent(req.user.id, 'content_reported', {
            contentId,
            contentType,
            reason
        });
        res.json({
            success: true,
            message: 'Content reported successfully'
        });
    }
    catch (error) {
        logger_1.logger.error('Report content error:', error);
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({
                error: 'Invalid input',
                details: error.errors
            });
        }
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.reportContent = reportContent;
const getModerationStats = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const stats = await database_1.db.query(`
      SELECT 
        COUNT(CASE WHEN type = 'content_moderated' AND meta->>'isApproved' = 'true' THEN 1 END) as approved_content,
        COUNT(CASE WHEN type = 'content_moderated' AND meta->>'isApproved' = 'false' THEN 1 END) as rejected_content,
        COUNT(CASE WHEN type = 'content_reported' THEN 1 END) as total_reports,
        COUNT(CASE WHEN type = 'spam_detected' THEN 1 END) as spam_detected,
        AVG(CASE WHEN type = 'content_moderated' THEN (meta->>'confidence')::float END) as avg_confidence
      FROM "Event"
      WHERE "createdAt" >= NOW() - INTERVAL '30 days'
    `);
        const result = stats.rows[0];
        res.json({
            success: true,
            stats: {
                approvedContent: parseInt(result.approved_content) || 0,
                rejectedContent: parseInt(result.rejected_content) || 0,
                totalReports: parseInt(result.total_reports) || 0,
                spamDetected: parseInt(result.spam_detected) || 0,
                averageConfidence: parseFloat(result.avg_confidence) || 0
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Get moderation stats error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getModerationStats = getModerationStats;
async function getModerationSettings(twinId) {
    if (twinId) {
        try {
            const twinSettings = await database_1.db.query(`
        SELECT t."requireApproval" as twinRequireApproval
        FROM "Twin" t
        WHERE t.id = $1
      `, [twinId]);
            if (twinSettings.rows.length > 0) {
                const row = twinSettings.rows[0];
                const globalSettings = await database_1.db.query(`
          SELECT "useAIModeration", "moderationLevel", "spamThreshold", "requireApproval"
          FROM "ModerationSettings"
          WHERE id = 'global'
        `);
                const global = globalSettings.rows[0] || {
                    useAIModeration: true,
                    moderationLevel: 'basic',
                    spamThreshold: 0.7,
                    requireApproval: false
                };
                return {
                    requireApproval: row.twinRequireApproval ?? global.requireApproval ?? false,
                    useAIModeration: global.useAIModeration ?? true,
                    moderationLevel: global.moderationLevel || 'basic',
                    spamThreshold: global.spamThreshold ?? 0.7
                };
            }
        }
        catch (error) {
            logger_1.logger.warn('Error fetching twin moderation settings, using global:', error);
        }
    }
    try {
        const settings = await database_1.db.query(`
      SELECT "useAIModeration", "moderationLevel", "spamThreshold", "requireApproval"
      FROM "ModerationSettings"
      WHERE id = 'global'
    `);
        return settings.rows[0] || {
            useAIModeration: true,
            moderationLevel: 'basic',
            spamThreshold: 0.7,
            requireApproval: false
        };
    }
    catch (error) {
        logger_1.logger.warn('Error fetching global moderation settings, using defaults:', error);
        return {
            useAIModeration: true,
            moderationLevel: 'basic',
            spamThreshold: 0.7,
            requireApproval: false
        };
    }
}
async function moderateContentSync(content, contentType = 'message', userId, twinId) {
    const moderationSettings = await getModerationSettings(twinId);
    const basicChecks = await performBasicModeration(content);
    let aiModeration = null;
    if (moderationSettings.useAIModeration) {
        aiModeration = await performAIModeration(content, contentType);
    }
    const spamCheck = await detectSpam(content, userId, twinId);
    const isApproved = basicChecks.isApproved &&
        (!aiModeration || aiModeration.isApproved) &&
        !spamCheck.isSpam;
    return {
        isApproved,
        confidence: Math.max(basicChecks.confidence, aiModeration?.confidence || 0, spamCheck.confidence),
        reasons: [
            ...basicChecks.reasons,
            ...(aiModeration?.reasons || []),
            ...spamCheck.reasons
        ],
        suggestions: [
            ...basicChecks.suggestions,
            ...(aiModeration?.suggestions || []),
            ...spamCheck.suggestions
        ]
    };
}
async function performBasicModeration(content) {
    const reasons = [];
    const suggestions = [];
    let confidence = 0.8;
    let isApproved = true;
    const profanityWords = ['badword1', 'badword2'];
    const hasProfanity = profanityWords.some(word => content.toLowerCase().includes(word.toLowerCase()));
    if (hasProfanity) {
        isApproved = false;
        reasons.push('Contains inappropriate language');
        suggestions.push('Please remove inappropriate language');
        confidence = 0.9;
    }
    const capsRatio = (content.match(/[A-Z]/g) || []).length / content.length;
    if (capsRatio > 0.7 && content.length > 10) {
        reasons.push('Excessive use of capital letters');
        suggestions.push('Please reduce the use of capital letters');
        confidence = Math.max(confidence, 0.6);
    }
    const spamPatterns = [
        /(.)\1{4,}/,
        /(https?:\/\/[^\s]+){3,}/,
        /(.)\1{2,}.*(.)\2{2,}.*(.)\3{2,}/
    ];
    const hasSpamPatterns = spamPatterns.some(pattern => pattern.test(content));
    if (hasSpamPatterns) {
        isApproved = false;
        reasons.push('Spam-like patterns detected');
        suggestions.push('Please write more naturally');
        confidence = 0.8;
    }
    return {
        isApproved,
        confidence,
        reasons,
        suggestions
    };
}
async function performAIModeration(content, contentType) {
    return {
        isApproved: true,
        confidence: 0.7,
        reasons: [],
        suggestions: []
    };
}
async function detectSpam(content, userId, twinId) {
    const reasons = [];
    const suggestions = [];
    let confidence = 0.5;
    let isSpam = false;
    if (userId) {
        const recentMessages = await database_1.db.query(`
      SELECT COUNT(*) as count
      FROM "Message"
      WHERE "chatId" IN (
        SELECT id FROM "Chat" WHERE "userId" = $1
      ) AND "createdAt" >= NOW() - INTERVAL '1 minute'
    `, [userId]);
        const messageCount = parseInt(recentMessages.rows[0].count);
        if (messageCount > 5) {
            isSpam = true;
            reasons.push('Rapid message posting detected');
            suggestions.push('Please slow down your messaging');
            confidence = 0.8;
        }
    }
    if (userId) {
        const duplicateContent = await database_1.db.query(`
      SELECT COUNT(*) as count
      FROM "Message"
      WHERE "chatId" IN (
        SELECT id FROM "Chat" WHERE "userId" = $1
      ) AND content = $2 AND "createdAt" >= NOW() - INTERVAL '1 hour'
    `, [userId, content]);
        const duplicateCount = parseInt(duplicateContent.rows[0].count);
        if (duplicateCount > 0) {
            isSpam = true;
            reasons.push('Duplicate content detected');
            suggestions.push('Please avoid repeating the same message');
            confidence = 0.9;
        }
    }
    return {
        isSpam,
        confidence,
        reasons,
        suggestions
    };
}
//# sourceMappingURL=moderationController.js.map