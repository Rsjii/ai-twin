import { Request, Response } from 'express';
import { db } from '../../config/database';
import { logger } from '../../config/logger';
import { z } from 'zod';
import { EventLogger } from '../../services/eventLogger';
import { TwinService } from '../twin/twinService';
import { featureFlags } from '../../config/featureFlags';
import { generateId } from '../../utils/idGenerator';
import { EVENT_TYPES } from '../../config/constants';
import { tokenizeId } from '../../utils/idTokenization';

const twinService = new TwinService();

// New onboarding schema matching the 5-step flow
const enhancedOnboardingSchema = z.object({
  basicInfo: z.object({
    name: z.string().min(1, 'Name is required'),
    role: z.string().min(1, 'Role is required'),
    roleOther: z.string().optional().default(''),
    // who you mostly text: friends / partner / family / colleagues / clients / mixed
    whoYouText: z.array(z.string()).min(1, 'Select at least one audience'),
    // where you will use twin: whatsapp / instagram / linkedin_email / dating / everywhere
    whereUse: z.array(z.string()).min(1, 'Select at least one primary channel'),
  }),
  styleSamples: z.object({
    casualSample: z.string().min(20, 'Casual sample must be at least 20 characters'),
    formalSample: z.string().optional(),
  }),
  preferences: z.object({
    // topics user likes (startups, tech, games, etc.)
    likes: z.array(z.string()).min(1, 'Select at least one topic you like'),
    // topics to avoid (optional)
    avoids: z.array(z.string()).optional().default([]),
    humorLevel: z.enum(['none', 'normal', 'high']),
    strongWords: z.enum(['never', 'some', 'normal']),
    emojiPref: z.enum(['low', 'medium', 'high']),
  }),
  rules: z.object({
    always: z.array(z.string()).optional().default([]),
    never: z.array(z.string()).optional().default([]),
    replySize: z.enum(['short', 'normal', 'detailed']),
    riskLevel: z.enum(['safe', 'normal', 'edgy']),
    adaptation: z.enum(['mine', 'mix', 'theirs']),
    approvalRequired: z.boolean().optional().default(false),
  }),
  onboardingCompleted: z.boolean(),
  completedAt: z.string(),
});

export const createEnhancedTwin = async (req: Request, res: Response) => {
  try {
    logger.info('=== ENHANCED TWIN CREATION (v2) ===');
    logger.info('Request body:', JSON.stringify(req.body, null, 2));

    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // 1) Validate incoming payload against new schema
    const validatedData = enhancedOnboardingSchema.parse(req.body);
    logger.info('Validated onboarding data:', validatedData);

    // 2) Enforce one twin per user
    const existingTwinQuery = `
      SELECT id, "createdAt" 
      FROM "Twin" 
      WHERE "userId" = $1 
      LIMIT 1
    `;
    const existingTwinResult = await db.query(existingTwinQuery, [req.user.id]);

    if (existingTwinResult.rows.length > 0) {
      const existingTwin = existingTwinResult.rows[0];
      return res.status(400).json({ 
        error: 'User already has a twin. Only one twin per user is allowed.',
        existingTwin: {
          id: existingTwin.id,
          createdAt: existingTwin.createdAt,
        },
      }); 
    }

    // 3) Check feature flag
    if (!featureFlags.ENABLE_AI_GENERATION) {
      return res.status(503).json({ error: 'AI generation is currently disabled' });
    }

    // 4) Build personaData object from onboarding payload
    const personaData = createPersonaData(validatedData);
    logger.info('Generated persona data:', personaData);

    // 5) Generate system prompt from persona
    const systemPrompt = generateSystemPrompt(personaData);
    logger.info('Generated system prompt');

    // 6) Build style vector using user’s real chat samples (casual + optional formal)
    const styleVector = await createEnhancedStyleVector(validatedData);
    logger.info('Generated style vector:', styleVector);

    // 7) Generate a sample reply in the user’s style
    const sampleReply = await twinService.generateSampleReply(styleVector);

    // 8) Update user profile with persona data and onboardingCompleted flag
    await updateUserProfile(req.user.id, validatedData);

    // 9) Insert Twin row
    const twinId = generateId.twin();
    
    let insertQuery: string;
    let insertParams: any[];
    
    try {
      // Full insert with persona + systemPrompt + tokenLimit + tier
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
          "createdAt"
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
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

    // 10) Event log
    await EventLogger.logUserEvent(req.user.id, EVENT_TYPES.ENHANCED_TWIN_CREATED, { 
      publicTwinId: twinId,
      personaData,
      samplesCount: countSamples(validatedData.styleSamples),
    });

    return res.json({
      success: true,
      twin: {
        publicId: tokenizeId(twinId, 'twin'),
        styleVector,
        sampleReply,
        personaData,
        systemPrompt,
        createdAt: result.rows[0].createdAt,
      },
    });
  } catch (error) {
    logger.error('Enhanced twin creation error:', error);
    
    if (req.user) {
      try {
      await EventLogger.logUserEvent(req.user.id, EVENT_TYPES.TWIN_CREATION_FAILED, { 
        error: error instanceof Error ? error.message : 'Unknown error',
          type: 'enhanced_v2',
      });
      } catch (e) {
        logger.warn('Failed to log TWIN_CREATION_FAILED:', e);
      }
    }
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
};

function countSamples(styleSamples: any): number {
  let count = 0;
  if (styleSamples?.casualSample) count += 1;
  if (styleSamples?.formalSample) count += 1;
  return count;
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
  const humorLevel = preferences?.humorLevel || 'normal';
  const strongWords = preferences?.strongWords || 'some';
  const emojiPref = preferences?.emojiPref || 'medium';
  const replySize = rules?.replySize || 'normal';
  const riskLevel = rules?.riskLevel || 'safe';
  const adaptation = rules?.adaptation || 'mix';

  const likesText = likes.length ? likes.join(', ') : 'none specified';
  const avoidsText = avoids.length ? avoids.join(', ') : 'none specified';

  const alwaysText =
    always.length > 0 ? always.map((r) => `- ${r}`).join('\n') : '- (none specified)';
  const neverText =
    never.length > 0 ? never.map((r) => `- ${r}`).join('\n') : '- (none specified)';

  const casualPresent = !!styleSamples?.casualSample;
  const formalPresent = !!styleSamples?.formalSample;

  return `You are "${name}", an AI twin that writes messages exactly like this person.

BACKGROUND:
- Role: ${role || 'not specified'}
- Main audiences: ${Array.isArray(basicInfo?.whoYouText) ? basicInfo.whoYouText.join(', ') : 'not specified'}
- Main channels: ${Array.isArray(basicInfo?.whereUse) ? basicInfo.whereUse.join(', ') : 'not specified'}

PREFERENCES:
- Topics they enjoy: ${likesText}
- Topics to avoid or keep light: ${avoidsText}
- Humor level: ${humorLevel} (none / normal / high)
- Strong words / swearing: ${strongWords} (never / some / normal)
- Emoji usage: ${emojiPref} (low / medium / high)

DEFAULT BEHAVIOR:
- Reply length: ${replySize} (short / normal / detailed)
- Risk level: ${riskLevel} (safe / normal / edgy)
- Style adaptation: ${adaptation} (mostly user, mix, or mostly other person)
- Approval: ${
  rules?.approvalRequired
  ? 'For sensitive/risky messages, ask a short confirmation question before finalizing.'
  : 'You may speak more freely, but still be respectful.'  
  }

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

// Build a style vector using the real chat samples via TwinService.extractStyle
async function createEnhancedStyleVector(data: z.infer<typeof enhancedOnboardingSchema>) {
  const samples: string[] = [];

  if (data.styleSamples?.casualSample) {
    samples.push(data.styleSamples.casualSample);
  }
  if (data.styleSamples?.formalSample) {
    samples.push(data.styleSamples.formalSample);
  }

  const combined = samples.join('\n---\n');

  if (!combined.trim()) {
    // Fallback to a default style vector if no samples were provided
    try {
      // If TwinService exposes a default helper
      // @ts-ignore
      if (typeof twinService.getDefaultStyleVector === 'function') {
        // @ts-ignore
        return twinService.getDefaultStyleVector();
      }
    } catch {
      // ignore
    }

    return {};
  }

  try {
    const styleVector = await twinService.extractStyle(combined);
  return styleVector;
  } catch (e) {
    logger.warn('Style extraction failed, using empty style vector:', e);
    return {};
  }
}
