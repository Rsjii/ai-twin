import { Request, Response, NextFunction } from 'express';
import { db } from '../../config/database';
import { logger } from '../../config/logger';
import { z } from 'zod';
import { EventLogger } from '../../services/eventLogger';
import { TwinService } from '../twin/twinService';
import type { StyleVector } from '../twin/twinService';
import { featureFlags } from '../../config/featureFlags';
import { generateId } from '../../utils/idGenerator';
import { EVENT_TYPES } from '../../config/constants';
import { tokenizeId } from '../../utils/idTokenization';
import { isDev } from '../../config/env';
import { AppError, createError } from '../../utils/errors';
import { memoryService } from '../../services/memoryService';

const twinService = new TwinService();

// New onboarding schema matching the 5-step flow
const enhancedOnboardingSchema = z.object({
  basicInfo: z.object({
    name: z.string().min(1, 'Name is required'),
    oneLineBio: z.string().min(1, 'Bio is required').max(150, 'Bio must be less than 150 characters'), // ✅ MANDATORY: Twin one-line bio (max 150 chars)
    role: z.string().min(1, 'Role is required'),
    roleOther: z.string().optional().default(''),
    purpose: z.string().optional(), // NEW: what twin helps with
  }),
  styleSamples: z.object({
    casualSample: z.string().min(20, 'Casual sample must be at least 20 characters'),
    formalSample: z.string().optional(),
  }),
  preferences: z.object({
    // topics user likes (startups, tech, games, etc.) - max 3
    likes: z.array(z.string()).min(1, 'Select at least one topic you like').max(3, 'Max 3 likes allowed'),
    // topics to avoid (optional) - max 3
    avoids: z.array(z.string()).max(3, 'Max 3 avoids allowed').optional().default([]),
    toneStyle: z.enum(['polite', 'normal', 'casual']), // NEW: replaces humor + strongWords
    emojiPref: z.enum(['low', 'medium', 'high']),
  }),
  rules: z.object({
    always: z.array(z.string()).optional().default([]),
    never: z.array(z.string()).optional().default([]),
    replySize: z.enum(['short', 'normal', 'detailed']),
    engagementStyle: z.enum(['ask_questions', 'natural', 'mix']), // NEW: question frequency
  }),
  onboardingCompleted: z.boolean(),
  completedAt: z.string(),
});

export const createEnhancedTwin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    logger.info('=== ENHANCED TWIN CREATION (v2) ===');
    if (isDev) logger.info('Request body:', JSON.stringify(req.body, null, 2));

    if (!req.user) return next(createError.unauthorized());

    // 1) Validate incoming payload against new schema
    const validatedData = enhancedOnboardingSchema.parse(req.body);
    if (isDev) logger.info('Validated onboarding data:', validatedData);

    // 2) Enforce one twin per user
    const existingTwinResult = await db.query(
      `SELECT id, "createdAt" 
      FROM "Twin" 
      WHERE "userId" = $1 
      LIMIT 1`,
      [req.user.id]
    );

    if (existingTwinResult.rows.length > 0) {
      const existingTwin = existingTwinResult.rows[0];
      return next(createError.conflict('User already has a twin. Only one twin per user is allowed.', {
        existingTwin: {
          id: existingTwin.id,
          createdAt: existingTwin.createdAt,
        },
      }));
    }

    // 3) Check feature flag
    if (!featureFlags.ENABLE_AI_GENERATION) {
      return next(new AppError(503, 'AI generation is currently disabled', 'SERVICE_UNAVAILABLE'));
    }

    // 4) Build personaData object from onboarding payload
    const personaData = createPersonaData(validatedData);
    logger.info('Generated persona data:', personaData);
    console.log('[ONBOARDING] [HYP-A] personaData created:', JSON.stringify(personaData, null, 2));
    console.log('[ONBOARDING] [HYP-A] Source: onboarding payload, Destination: Twin table');

    // 5) Generate system prompt from persona
    const systemPrompt = generateSystemPrompt(personaData);
    logger.info('Generated system prompt');
    console.log('[ONBOARDING] [HYP-B] systemPrompt generated from personaData');
    console.log('[ONBOARDING] [HYP-B] systemPrompt length:', systemPrompt.length, 'chars');
    console.log('[ONBOARDING] [HYP-B] systemPrompt preview:', systemPrompt.substring(0, 200) + '...');

    // 6) MVP (personaData-only): styleVector is legacy/ignored.
    // Keep it stored as an empty object to avoid schema drift.
    const styleVector = {};
    logger.info('MVP: Skipping styleVector generation (personaData-only)');

    // 7) Generate a sample reply using the systemPrompt (personaData-only)
    const sampleReplyResult = await twinService.generateDraftWithContext({
      personaData,
      systemPrompt,
      tokenLimit: 120,
      chatMemory: [],
      currentMessages: ['Say a short hello in my style.'],
      isFirstMessage: false,
    });
    const sampleReply =
      typeof sampleReplyResult === 'object' && sampleReplyResult && 'response' in sampleReplyResult
        ? (sampleReplyResult as any).response
        : (typeof sampleReplyResult === 'string' ? sampleReplyResult : 'Hey!');

    // 8) Update user profile with persona data and onboardingCompleted flag
    await updateUserProfile(req.user.id, validatedData);

    // 9) Insert Twin row
    const twinId = generateId.twin();
    
    let insertQuery: string;
    let insertParams: any[];
    
    try {
      // Full insert with persona + systemPrompt + tokenLimit + tier + bio
      const oneLineBio = validatedData.basicInfo?.oneLineBio; // ✅ MANDATORY - already validated by schema
      insertQuery = `
        INSERT INTO "Twin" (
          id,
          "userId",
          "styleVector",
          "sampleReply",
          "personaData",
          "systemPrompt",
          "tokenLimit",
          "tier",
          bio,
          "createdAt"
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id, "createdAt"
      `;
      insertParams = [
        twinId,
        req.user.id,
        JSON.stringify(styleVector),
        sampleReply,
        JSON.stringify(personaData),
        systemPrompt,
        500,
        'free',
        oneLineBio, // ✅ MANDATORY: Bio is required
        new Date(),
      ];
    } catch (e) {
      // Fallback: minimal insert if extra columns do not exist
      insertQuery = `
        INSERT INTO "Twin" (id, "userId", "styleVector", "sampleReply", "createdAt")
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, "createdAt"
      `;
      insertParams = [twinId, req.user.id, JSON.stringify(styleVector), sampleReply, new Date()];
    }

    const result = await db.query(insertQuery, insertParams);
    console.log('[ONBOARDING] [HYP-A] Twin stored in database:', { twinId, userId: req.user.id });
    console.log('[ONBOARDING] [HYP-A] personaData stored:', JSON.stringify(personaData, null, 2));
    console.log('[ONBOARDING] [HYP-B] systemPrompt stored in database');

    // 10) Initialize default settings with new memory structure
    // ✅ FIX: Store settings in personaData (not separate column - single source of truth)
    const defaultSettings = {
      replyBehavior: {
        defaultLength: 'normal',
        riskLevel: 'safe',
        energy: 'normal',
      },
      adaptation: {
        // MVP: no automatic style adaptation while using external APIs
        enabled: false,
        styleMix: 50,
      },
      safety: {
        avoidNSFW: true,
        avoidAbuse: true,
        avoidPoliticsReligion: true,
      },
    memory: {
      enabled: true, // ✅ Default: memory enabled
      allowPublicContribution: false,
      autoExtractFacts: false,
      allowPublicUse: false, // ✅ NEW: public chat can use ONLY public-visible long-term memories
    },
    };

    // Update personaData with settings (single source of truth)
    const updatedPersonaData = {
      ...personaData,
      settings: defaultSettings,
    };

    await db.query(
      `UPDATE "Twin" SET "personaData" = $1 WHERE id = $2`,
      [JSON.stringify(updatedPersonaData), twinId]
    );
    console.log('[ONBOARDING] [HYP-A] Updated personaData with default settings');
    console.log('[ONBOARDING] [HYP-A] Settings included:', JSON.stringify(defaultSettings, null, 2));

    // 11) Mirror likes/avoids to Long-Term Memory preferences (existing system, no new endpoint)
    const likes = (validatedData.preferences?.likes || []).slice(0, 3);
    const avoids = (validatedData.preferences?.avoids || []).slice(0, 3);

    try {
      await Promise.all([
        ...likes.map((v) =>
          memoryService.storeLongTermMemory(
            twinId,
            `pref_like_${slugKey(v)}`,
            `Likes: ${v}`,
            'preference',
            'manual',
            'owner'
          )
        ),
        ...avoids.map((v) =>
          memoryService.storeLongTermMemory(
            twinId,
            `pref_avoid_${slugKey(v)}`,
            `Avoid: ${v}`,
            'preference',
            'manual',
            'owner'
          )
        ),
      ]);
      console.log('[ONBOARDING] [HYP-A] ✅ Mirrored likes/avoids to LTM preferences:', { likes: likes.length, avoids: avoids.length });
    } catch (memoryError) {
      // Don't fail twin creation if memory write fails (non-critical)
      logger.warn('[ONBOARDING] Failed to mirror likes/avoids to LTM (non-critical):', memoryError);
    }

    // 12) Event log
    await EventLogger.logUserEvent(req.user.id, EVENT_TYPES.ENHANCED_TWIN_CREATED, { 
      publicTwinId: twinId,
      personaData: updatedPersonaData,
      samplesCount: countSamples(validatedData.styleSamples),
    });

    return res.json({
      success: true,
      twin: {
        publicId: tokenizeId(twinId, 'twin'),
        styleVector,
        sampleReply,
        personaData: updatedPersonaData,
        systemPrompt,
        createdAt: result.rows[0].createdAt,
      },
    });
  } catch (error) {
    logger.error('Enhanced twin creation error:', error);
    
    // Event log stays (internal)
    if ((req as any).user?.id) {
      try {
      await EventLogger.logUserEvent((req as any).user.id, EVENT_TYPES.TWIN_CREATION_FAILED, { 
        error: error instanceof Error ? error.message : 'Unknown error',
          type: 'enhanced_v2',
      });
      } catch (e) {
        logger.warn('Failed to log TWIN_CREATION_FAILED:', e);
      }
    }
    
    // ✅ Do NOT send raw details to user
    if (error instanceof z.ZodError) {
      return next(
        createError.validation('Invalid input', {
          issues: error.errors.map(e => ({ field: e.path.join('.'), message: e.message })),
        })
      );
    }
    if (error instanceof Error) {
      return next(createError.internal('Failed to create twin', { cause: error.message }));
    }
    return next(createError.internal('Failed to create twin'));
  }
};

function countSamples(styleSamples: any): number {
  let count = 0;
  if (styleSamples?.casualSample) count += 1;
  if (styleSamples?.formalSample) count += 1;
  return count;
}

/**
 * Helper: Convert string to safe key slug for memory storage
 */
function slugKey(s: string): string {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'x';
}

// Update User personaData + onboardingCompleted using new shape
async function updateUserProfile(userId: string, data: z.infer<typeof enhancedOnboardingSchema>) {
  let updateQuery: string;
  let updateParams: any[];

  try {
    const personaData = createPersonaData(data);

    updateQuery = `
      UPDATE "User" 
      SET 
        name = $1,
        "personaData" = $2,
        "onboardingCompleted" = $3,
        "updatedAt" = $4
      WHERE id = $5
    `;

    updateParams = [
      data.basicInfo.name,
      JSON.stringify(personaData),
      data.onboardingCompleted,
      new Date(),
      userId,
    ];
  } catch (error) {
    // Fallback: update only name
    updateQuery = `
      UPDATE "User" 
      SET name = $1
      WHERE id = $2
    `;
    updateParams = [data.basicInfo.name, userId];
  }

  await db.query(updateQuery, updateParams);
}

// Build personaData from the new onboarding payload
function createPersonaData(data: z.infer<typeof enhancedOnboardingSchema>) {
  return {
    basicInfo: data.basicInfo,
    styleSamples: data.styleSamples,
    preferences: data.preferences,
    rules: data.rules,
    onboardingCompleted: data.onboardingCompleted,
    completedAt: data.completedAt,
  };
}

// Generate a system prompt based on the new persona shape
function generateSystemPrompt(personaData: any): string {
  const { basicInfo, preferences, rules, styleSamples } = personaData || {};

  const name = basicInfo?.name || 'the user';
  const role = basicInfo?.role || '';
  const likes: string[] = preferences?.likes || [];
  const avoids: string[] = preferences?.avoids || [];
  const always: string[] = rules?.always || [];
  const never: string[] = rules?.never || [];
  const toneStyle = preferences?.toneStyle || 'normal';
  const emojiPref = preferences?.emojiPref || 'medium';
  const replySize = rules?.replySize || 'normal';
  const engagementStyle = rules?.engagementStyle || 'mix';

  // Map toneStyle to humor/strong words for backward compatibility
  const humorLevel = toneStyle === 'polite' ? 'none' : toneStyle === 'normal' ? 'normal' : 'high';
  const strongWords = toneStyle === 'polite' ? 'never' : toneStyle === 'normal' ? 'some' : 'normal';

  const likesText = likes.length ? likes.join(', ') : 'none specified';
  const avoidsText = avoids.length ? avoids.join(', ') : 'none specified';

  const alwaysText =
    always.length > 0 ? always.map((r) => `- ${r}`).join('\n') : '- (none specified)';
  const neverText =
    never.length > 0 ? never.map((r) => `- ${r}`).join('\n') : '- (none specified)';

  const casualPresent = !!styleSamples?.casualSample;
  const formalPresent = !!styleSamples?.formalSample;

  const purposeText = basicInfo?.purpose ? basicInfo.purpose.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'General conversation';

  return `You are "${name}", an AI twin that writes messages exactly like this person.

BACKGROUND:
- Role: ${role || 'not specified'}
- Purpose: ${purposeText}

PREFERENCES:
- Topics they enjoy: ${likesText}
- Topics to avoid or keep light: ${avoidsText}
- Tone & language style: ${toneStyle} (polite & respectful / normal & friendly / casual & relaxed)
- Emoji usage: ${emojiPref} (low / medium / high)

DEFAULT BEHAVIOR:
- Reply length: ${replySize} (short / normal / detailed)
- Engagement style: ${engagementStyle === 'ask_questions' ? 'Ask questions to keep conversation going' : engagementStyle === 'natural' ? 'Respond naturally without forcing questions' : 'Mix of both'}
- Memory: Enabled (remembers facts and preferences from conversations)

ALWAYS DO:
${alwaysText}

NEVER DO:
${neverText}

STYLE SAMPLES:
- Casual chat example provided: ${casualPresent ? 'YES' : 'NO'}
- More formal example provided: ${formalPresent ? 'YES' : 'NO'}
Use these implicitly to match phrasing, tone, and flow. Do not quote them directly.

GENERAL INSTRUCTIONS:
- Always answer in the first person as "${name}".
- Match their voice, tone, and boundaries reflected above.
- If you are unsure or the user asks for something that conflicts with the NEVER rules or safety (e.g., explicit adult content, heavy abuse, deep politics/religion if they avoided it), gently refuse and suggest a safer alternative.
- Keep responses natural and conversational, not robotic.
- Do not mention that you are an AI or that you are following a prompt.`;
}

// MVP (personaData-only): Legacy style vector generation removed.
// Onboarding now stores personaData + systemPrompt only; styleVector is {}.
