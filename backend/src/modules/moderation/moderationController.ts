import { Request, Response } from 'express';
import { db } from '../../config/database';
import { logger } from '../../config/logger';
import { EventLogger } from '../../services/eventLogger';
import { z } from 'zod';
import {generateId} from '../../utils/idGenerator';
import { EVENT_TYPES } from '../../config/constants';

// Content moderation levels
export enum ModerationLevel {
  NONE = 'none',
  BASIC = 'basic',
  STRICT = 'strict',
  MAXIMUM = 'maximum'
}

// Validation schemas
const moderateContentSchema = z.object({
  content: z.string().min(1, 'Content is required'),
  contentType: z.enum(['message', 'bio', 'comment', 'profile']).default('message'),
  userId: z.string().optional(),
  twinId: z.string().optional()
});

const reportContentSchema = z.object({
  contentId: z.string().min(1, 'Content ID is required'),
  contentType: z.enum(['message', 'twin', 'user', 'comment']),
  reason: z.enum(['spam', 'harassment', 'inappropriate', 'fake', 'other']),
  description: z.string().optional()
});

// Enhanced content moderation
export const moderateContent = async (req: Request, res: Response) => {
  try {
    const { content, contentType, userId, twinId } = moderateContentSchema.parse(req.body);

    // Get moderation settings
    const moderationSettings = await getModerationSettings();

    // Basic content checks
    const basicChecks = await performBasicModeration(content);
    
    // Advanced AI-based moderation (if enabled)
    let aiModeration = null;
    if (moderationSettings.useAIModeration) {
      aiModeration = await performAIModeration(content, contentType);
    }

    // Spam detection
    const spamCheck = await detectSpam(content, userId, twinId);

    // Combine all checks
    const isApproved = basicChecks.isApproved && 
                      (!aiModeration || aiModeration.isApproved) && 
                      !spamCheck.isSpam;

    const moderationResult = {
      isApproved,
      confidence: Math.max(
        basicChecks.confidence,
        aiModeration?.confidence || 0,
        spamCheck.confidence
      ),
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

    // Log moderation event
    if (userId) {
      await EventLogger.logUserEvent(userId, EVENT_TYPES.CONTENT_MODERATED, {
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

  } catch (error) {
    logger.error('Moderate content error:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Invalid input', 
        details: error.errors 
      });
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Report inappropriate content
export const reportContent = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { contentId, contentType, reason, description } = reportContentSchema.parse(req.body);

    // Check if already reported by this user
    const existingReport = await db.query(`
      SELECT id FROM "ContentReport"
      WHERE "contentId" = $1 AND "contentType" = $2 AND "reporterId" = $3
    `, [contentId, contentType, req.user.id]);

    if (existingReport.rows.length > 0) {
      return res.status(400).json({ error: 'Content already reported by you' });
    }

    // Create report
    const utcTimestamp = new Date().toISOString();
    await db.query(`
      INSERT INTO "ContentReport" ("id", "contentId", "contentType", "reason", "description", "reporterId", "createdAt")
      VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz)
    `, [
      generateId.report(),
      contentId,
      contentType,
      reason,
      description || '',
      req.user.id,
      utcTimestamp
    ]);

    // Log report event
    await EventLogger.logUserEvent(req.user.id, EVENT_TYPES.CONTENT_REPORTED, {
      contentId,
      contentType,
      reason
    });

    res.json({
      success: true,
      message: 'Content reported successfully'
    });

  } catch (error) {
    logger.error('Report content error:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Invalid input', 
        details: error.errors 
      });
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get moderation statistics
export const getModerationStats = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Get moderation stats for the last 30 days
    const stats = await db.query(`
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

  } catch (error) {
    logger.error('Get moderation stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Helper functions
export async function getModerationSettings(twinId?: string) {
  // If twinId provided, check for per-twin settings first
  if (twinId) {
    try {
      // Query Twin table directly (no JOIN needed - ModerationSettings doesn't have twinId)
      const twinSettings = await db.query(`
        SELECT t."requireApproval" as twinRequireApproval
        FROM "Twin" t
        WHERE t.id = $1
      `, [twinId]);
      
      if (twinSettings.rows.length > 0) {
        const row = twinSettings.rows[0];
        // Get global moderation settings for defaults
        const globalSettings = await db.query(`
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
      // If twin not found, fall through to global settings
    } catch (error) {
      logger.warn('Error fetching twin moderation settings, using global:', error);
      // Fall through to global settings
    }
  }
  
  // Global settings fallback
  try {
    const settings = await db.query(`
      SELECT "useAIModeration", "moderationLevel", "spamThreshold", "requireApproval"
      FROM "ModerationSettings"
      WHERE id = 'global'
    `);

    return settings.rows[0] || {
      useAIModeration: true,
      moderationLevel: 'basic',
      spamThreshold: 0.7,
      requireApproval: false  // Default: no approval required
    };
  } catch (error) {
    logger.warn('Error fetching global moderation settings, using defaults:', error);
    // Return safe defaults
    return {
      useAIModeration: true,
      moderationLevel: 'basic',
      spamThreshold: 0.7,
      requireApproval: false
    };
  }
}

// Helper function to moderate content directly (for use in controllers)
export async function moderateContentSync(
  content: string, 
  contentType: string = 'message', 
  userId?: string, 
  twinId?: string
): Promise<{ isApproved: boolean; confidence: number; reasons: string[]; suggestions: string[] }> {
  // Get moderation settings
  const moderationSettings = await getModerationSettings(twinId);

  // Basic content checks
  const basicChecks = await performBasicModeration(content);
  
  // Advanced AI-based moderation (if enabled)
  let aiModeration = null;
  if (moderationSettings.useAIModeration) {
    aiModeration = await performAIModeration(content, contentType);
  }

  // Spam detection
  const spamCheck = await detectSpam(content, userId, twinId);

  // Combine all checks
  const isApproved = basicChecks.isApproved && 
                    (!aiModeration || aiModeration.isApproved) && 
                    !spamCheck.isSpam;

  return {
    isApproved,
    confidence: Math.max(
      basicChecks.confidence,
      aiModeration?.confidence || 0,
      spamCheck.confidence
    ),
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

async function performBasicModeration(content: string) {
  const reasons: string[] = [];
  const suggestions: string[] = [];
  let confidence = 0.8;
  let isApproved = true;

  // Check for profanity
  const profanityWords = ['badword1', 'badword2']; // Replace with actual profanity list
  const hasProfanity = profanityWords.some(word => 
    content.toLowerCase().includes(word.toLowerCase())
  );

  if (hasProfanity) {
    isApproved = false;
    reasons.push('Contains inappropriate language');
    suggestions.push('Please remove inappropriate language');
    confidence = 0.9;
  }

  // Check for excessive caps
  const capsRatio = (content.match(/[A-Z]/g) || []).length / content.length;
  if (capsRatio > 0.7 && content.length > 10) {
    reasons.push('Excessive use of capital letters');
    suggestions.push('Please reduce the use of capital letters');
    confidence = Math.max(confidence, 0.6);
  }

  // ✅ DISABLED: Spam pattern blocking - let messages go to AI
  // Check for spam patterns (detection only, no blocking)
  const spamPatterns = [
    /(.)\1{4,}/, // Repeated characters
    /(https?:\/\/[^\s]+){3,}/, // Multiple URLs
    /(.)\1{2,}.*(.)\2{2,}.*(.)\3{2,}/ // Multiple repeated patterns
  ];

  const hasSpamPatterns = spamPatterns.some(pattern => pattern.test(content));
  if (hasSpamPatterns) {
    // ✅ Don't block - just log for monitoring (messages will go to AI)
    // isApproved = false; // REMOVED - let spam patterns pass through to AI
    // reasons.push('Spam-like patterns detected');
    // suggestions.push('Please write more naturally');
    // confidence = 0.8;
  }

  return {
    isApproved,
    confidence,
    reasons,
    suggestions
  };
}

async function performAIModeration(content: string, contentType: string) {
  // This would integrate with an AI moderation service
  // For now, return a basic implementation
  return {
    isApproved: true,
    confidence: 0.7,
    reasons: [],
    suggestions: []
  };
}

async function detectSpam(content: string, userId?: string, twinId?: string) {
  return {
    isSpam: false,
    confidence: 0,
    reasons: [] as string[],
    suggestions: [] as string[],
  };

  //NOT NEEDED FOR MVP
  const reasons: string[] = [];
  const suggestions: string[] = [];
  let confidence = 0.5;
  let isSpam = false;

  // Check for rapid posting
  if (userId) {
    const recentMessages = await db.query(`
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
  //NOT NEEDED FOR MVP
  /*

  // Check for duplicate content
  if (userId) {
    const duplicateContent = await db.query(`
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
    */

  return {
    isSpam,
    confidence,
    reasons,
    suggestions
  };
}
