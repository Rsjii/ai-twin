import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { db } from '../../config/database';
import { logger } from '../../config/logger';
import { TwinService } from './twinService';
import { detokenizeId } from '../../utils/idTokenization';
import { createError, ErrorCodes } from '../../utils/errors';
import { MEMORY_LIMITS } from '../../config/constants';

const twinService = new TwinService();

// MVP (personaData-only): Legacy style schema kept for backward compatibility.
// Updates are synced to personaData; styleVector is stored but not used in prompts.
/**
 * @deprecated Use updatePersonaSchema instead. This schema is kept for legacy updateTwinStyle endpoint.
 */
const updateStyleSchema = z.object({
  formality_level: z.number().min(0).max(1).optional(),
  emoji_usage: z.number().min(0).max(1).optional(),
  humor_style: z.enum(['none', 'light', 'moderate', 'heavy']).optional(),
  question_frequency: z.number().min(0).max(1).optional(),
  response_length_preference: z.enum(['brief', 'detailed', 'comprehensive', 'short', 'normal', 'detailed']).optional(),
  tone: z.enum(['casual', 'witty', 'serious', 'friendly', 'professional', 'polite', 'normal']).optional(),
  sentence_length: z.enum(['short', 'medium', 'long']).optional(), // legacy - synced to personaData.communicationStyle.language.responseLength
  engagementStyle: z.enum(['ask_questions', 'natural', 'mix']).optional(), // synced to personaData.rules.engagementStyle
});

const updatePersonaSchema = z.object({
  basicInfo: z.object({
    fullName: z.string().optional(),
    bio: z.string().optional(),
    username: z.string().optional(),
    primaryUseCase: z.string().optional(),

    // ✅ required by new Twin Settings page
    name: z.string().max(50, 'Name must be 50 characters or less').optional(),
    role: z.string().optional(),
    oneLineBio: z.string().min(1, 'Bio is required').max(MEMORY_LIMITS.MAX_BIO_CHARS, `Bio must be ${MEMORY_LIMITS.MAX_BIO_CHARS} characters or less`), // ✅ MANDATORY: Bio is required
    language: z.enum(['en', 'hi', 'hinglish']).optional(),
    purpose: z.string().optional(), // ✅ ADD
    purposeOther: z.string().max(100, 'Purpose description must be 100 characters or less').optional(), // ✅ ADD: For "other" purpose option
  }).optional(),
  communicationStyle: z.object({
    tone: z.object({
      formalCasual: z.number().min(0).max(100).optional(),
      seriousPlayful: z.number().min(0).max(100).optional(),
      directDiplomatic: z.number().min(0).max(100).optional()
    }).optional(),
    language: z.object({
      greetingStyle: z.string().optional(),
      closingStyle: z.string().optional(),
      emojiUsage: z.string().optional(),
      responseLength: z.string().optional(),
      commonPhrases: z.string().optional()
    }).optional()
  }).optional(),
  preferences: z.object({
    likes: z.array(z.string()).optional(),
    avoids: z.array(z.string()).optional(),
    toneStyle: z.enum(['polite', 'normal', 'casual']).optional(), // ✅ ADD
    emojiPref: z.enum(['low', 'medium', 'high']).optional(), // ✅ ADD
  }).optional(),
  rules: z.object({
    always: z.array(z.string().max(MEMORY_LIMITS.MAX_ALWAYS_NEVER_CHARS, `Each "always" rule must be ${MEMORY_LIMITS.MAX_ALWAYS_NEVER_CHARS} characters or less`)).optional(),
    never: z.array(z.string().max(MEMORY_LIMITS.MAX_ALWAYS_NEVER_CHARS, `Each "never" rule must be ${MEMORY_LIMITS.MAX_ALWAYS_NEVER_CHARS} characters or less`)).optional(),
    replySize: z.enum(['short', 'normal', 'detailed']).optional(), // ✅ ADD
    engagementStyle: z.enum(['ask_questions', 'natural', 'mix']).optional(), // ✅ ADD
  }).optional(),
  context: z.object({
    interests: z.array(z.string()).optional(),
    targetAudience: z.string().optional(),
    topicsToAvoid: z.string().optional()
  }).optional(),
  personality: z.object({
    ocean: z.record(z.number()).optional(),
    communicationStyle: z.record(z.number()).optional()
  }).optional()
});

/**
 * Get current twin data for editing
 */
export const getTwinEditData = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // ✅ SECURITY: Detokenize twinToken from URL
    const { twinToken } = req.params;
    const userId = (req.user as any)?.id || (req.user as any)?.userId;
    if (!userId) {
      throw createError.unauthorized();
    }
    const decoded = detokenizeId(twinToken, { userId, endpoint: 'getTwinEditData' });
    if (!decoded || decoded.type !== 'twin') {
      throw createError.notFound('Invalid twin token', ErrorCodes.TWIN_NOT_FOUND);
    }
    const twinId = decoded.id;

    // Verify twin ownership
    const twinResult = await db.query(`
      SELECT id, "styleVector", "personaData", "systemPrompt", "sampleReply", "createdAt", "last_updated", "style_version", bio
      FROM "Twin" 
      WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);

    if (twinResult.rows.length === 0) {
      throw createError.notFound('Twin not found or access denied', ErrorCodes.TWIN_NOT_FOUND);
    }

    const twin = twinResult.rows[0];
    
    // ✅ SYNC: If Twin.bio exists but personaData.basicInfo.oneLineBio is missing/empty, sync it
    let personaData = twin.personaData || {};
    if (twin.bio && (!personaData.basicInfo || !personaData.basicInfo.oneLineBio)) {
      if (!personaData.basicInfo) {
        personaData.basicInfo = {};
      }
      personaData.basicInfo.oneLineBio = twin.bio;
    }

    res.json({
      success: true,
      twin: {
        id: twin.id,
        styleVector: twin.styleVector,
        personaData: personaData,
        // systemPrompt removed - should not be exposed to users
        sampleReply: twin.sampleReply,
        createdAt: twin.createdAt,
        lastUpdated: twin.last_updated,
        styleVersion: twin.style_version
      }
    });

  } catch (error) {
    next(error); // ✅ Standardize
  }
};

/**
 * Update twin style vector
 */
export const updateTwinStyle = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // ✅ SECURITY: Detokenize twinToken from URL
    const { twinToken } = req.params;
    const userId = (req.user as any)?.id || (req.user as any)?.userId;
    if (!userId) {
      throw createError.unauthorized();
    }
    const decoded = detokenizeId(twinToken, { userId, endpoint: 'updateTwinStyle' });
    if (!decoded || decoded.type !== 'twin') {
      throw createError.notFound('Invalid twin token', ErrorCodes.TWIN_NOT_FOUND);
    }
    const twinId = decoded.id;
    const styleUpdates = updateStyleSchema.parse(req.body);

    // Map engagementStyle to question_frequency if provided
    if ((styleUpdates as any).engagementStyle) {
      const eng = (styleUpdates as any).engagementStyle;
      if (eng === 'ask_questions') {
        styleUpdates.question_frequency = 0.7;
      } else if (eng === 'natural') {
        styleUpdates.question_frequency = 0.2;
      } else {
        styleUpdates.question_frequency = 0.5;
      }
    }

    // Verify twin ownership and load current style + persona
    const twinResult = await db.query(`
      SELECT id, "styleVector", "personaData" FROM "Twin" 
      WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);

    if (twinResult.rows.length === 0) {
      throw createError.notFound('Twin not found or access denied', ErrorCodes.TWIN_NOT_FOUND);
    }

    const currentStyleVector = twinResult.rows[0].styleVector || {};
    const currentPersonaData = twinResult.rows[0].personaData || null;

    // Merge updates with current style vector
    const updatedStyleVector = {
      ...currentStyleVector,
      ...styleUpdates,
    };

    // ✅ SYNC: Sync tone and engagementStyle to personaData
    let updatedPersonaData = currentPersonaData;
    if (styleUpdates.tone && currentPersonaData) {
      const toneValue = styleUpdates.tone as 'polite' | 'normal' | 'casual';
      updatedPersonaData = {
        ...currentPersonaData,
        preferences: {
          ...currentPersonaData.preferences,
          toneStyle: toneValue,
        }
      };
    }

    if ((styleUpdates as any).engagementStyle && updatedPersonaData) {
      updatedPersonaData = {
        ...updatedPersonaData,
        rules: {
          ...updatedPersonaData.rules,
          engagementStyle: (styleUpdates as any).engagementStyle,
        }
      };
    }

    // MVP (personaData-only): Regenerate system prompt from personaData
    const newSystemPrompt = await twinService.generateSystemPrompt(updatedPersonaData);

    // Update twin in database (sync personaData if it was modified)
    const utcTimestamp = new Date().toISOString();
    if (updatedPersonaData !== currentPersonaData) {
      await db.query(`
        UPDATE "Twin" 
        SET "styleVector" = $1, "personaData" = $2, "systemPrompt" = $3, "last_updated" = $4::timestamptz, "style_version" = "style_version" + 1
        WHERE id = $5
      `, [JSON.stringify(updatedStyleVector), JSON.stringify(updatedPersonaData), newSystemPrompt, utcTimestamp, twinId]);
    } else {
      await db.query(`
        UPDATE "Twin" 
        SET "styleVector" = $1, "systemPrompt" = $2, "last_updated" = $3::timestamptz, "style_version" = "style_version" + 1
        WHERE id = $4
      `, [JSON.stringify(updatedStyleVector), newSystemPrompt, utcTimestamp, twinId]);
    }

    // ✅ V2: SampleReply generation on updates - commented out for now
    // SampleReply is only generated during onboarding (first time)
    // Uncomment below for V2 when update-based regeneration is needed
    /*
    const sampleReplyResult = await twinService.generateDraftWithContext({
      personaData: updatedPersonaData,
      systemPrompt: newSystemPrompt,
      tokenLimit: 120,
      chatMemory: [],
      currentMessages: ['Say a short hello in my style.'],
      isFirstMessage: false,
    });
    const newSampleReply =
      typeof sampleReplyResult === 'object' && sampleReplyResult && 'response' in sampleReplyResult
        ? (sampleReplyResult as any).response
        : (typeof sampleReplyResult === 'string' ? sampleReplyResult : 'Hey!');
    */

    res.json({
      success: true,
      message: 'Twin style updated successfully',
      updatedStyleVector,
      // newSampleReply, // V2: Uncomment when sampleReply regeneration is enabled
      systemPrompt: newSystemPrompt,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return next(createError.validation('Invalid input', error.errors));
    }
    next(error);
  }
};

/**
 * Update twin persona data
 */
export const updateTwinPersona = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // ✅ SECURITY: Detokenize twinToken from URL
    const { twinToken } = req.params;
    const userId = (req.user as any)?.id || (req.user as any)?.userId;
    if (!userId) {
      throw createError.unauthorized();
    }
    const decoded = detokenizeId(twinToken, { userId, endpoint: 'updateTwinPersona' });
    if (!decoded || decoded.type !== 'twin') {
      throw createError.notFound('Invalid twin token', ErrorCodes.TWIN_NOT_FOUND);
    }
    const twinId = decoded.id;
    const personaUpdates = updatePersonaSchema.parse(req.body.personaData || req.body);
    
    // Verify twin ownership
    const twinResult = await db.query(`
      SELECT id, "personaData", "styleVector" FROM "Twin" 
      WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);

    if (twinResult.rows.length === 0) {
      throw createError.notFound('Twin not found or access denied', ErrorCodes.TWIN_NOT_FOUND);
    }

    const currentPersonaData = twinResult.rows[0].personaData;
    
    // ✅ Deep-merge so partial updates from Twin Settings don't wipe likes/avoids/etc.
    const current = (currentPersonaData || {}) as any;
    const updates = (personaUpdates || {}) as any;

    const updatedPersonaData = {
      ...current,
      ...updates,

      basicInfo: {
        ...(current.basicInfo || {}),
        ...(updates.basicInfo || {}),
      },

      preferences: {
        ...(current.preferences || {}),
        ...(updates.preferences || {}),
        // ✅ Preserve arrays if not provided in payload
        likes: updates.preferences?.likes ?? current.preferences?.likes ?? [],
        avoids: updates.preferences?.avoids ?? current.preferences?.avoids ?? [],
      },

      rules: {
        ...(current.rules || {}),
        ...(updates.rules || {}),
        always: updates.rules?.always ?? current.rules?.always ?? [],
        never: updates.rules?.never ?? current.rules?.never ?? [],
      },

      communicationStyle: {
        ...(current.communicationStyle || {}),
        ...(updates.communicationStyle || {}),
        tone: {
          ...(current.communicationStyle?.tone || {}),
          ...(updates.communicationStyle?.tone || {}),
        },
        language: {
          ...(current.communicationStyle?.language || {}),
          ...(updates.communicationStyle?.language || {}),
        },
      },

      context: {
        ...(current.context || {}),
        ...(updates.context || {}),
        interests: updates.context?.interests ?? current.context?.interests ?? [],
      },

      personality: {
        ...(current.personality || {}),
        ...(updates.personality || {}),
      },

      settings: {
        ...(current.settings || {}),
        ...(updates.settings || {}),
        memory: {
          ...(current.settings?.memory || {}),
          ...(updates.settings?.memory || {}),
        },
        safety: {
          ...(current.settings?.safety || {}),
          ...(updates.settings?.safety || {}),
        },
        adaptation: {
          ...(current.settings?.adaptation || {}),
          ...(updates.settings?.adaptation || {}),
        },
        replyBehavior: {
          ...(current.settings?.replyBehavior || {}),
          ...(updates.settings?.replyBehavior || {}),
        },
      },
    };

    // MVP (personaData-only): Regenerate system prompt with new persona
    const newSystemPrompt = await twinService.generateSystemPrompt(updatedPersonaData);

    // ✅ Extract oneLineBio from updated personaData to sync to Twin.bio (MANDATORY - already validated by schema)
    const oneLineBio = updatedPersonaData?.basicInfo?.oneLineBio;
    
    // Update twin in database (sync bio column with oneLineBio - bio is mandatory)
    const utcTimestamp = new Date().toISOString();
    await db.query(`
      UPDATE "Twin" 
      SET "personaData" = $1, "systemPrompt" = $2, "last_updated" = $3::timestamptz, bio = $4
      WHERE id = $5
    `, [JSON.stringify(updatedPersonaData), newSystemPrompt, utcTimestamp, oneLineBio, twinId]);

    res.json({
      success: true,
      message: 'Twin persona updated successfully',
      updatedPersonaData,
      systemPrompt: newSystemPrompt
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return next(createError.validation('Invalid input', error.errors));
    }
    next(error);
  }
};

/**
 * Preview style changes without saving
 */
export const previewStyleChanges = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // ✅ SECURITY: Detokenize twinToken from URL
    const { twinToken } = req.params;
    const userId = (req.user as any)?.id || (req.user as any)?.userId;
    if (!userId) {
      throw createError.unauthorized();
    }
    const decoded = detokenizeId(twinToken, { userId, endpoint: 'previewStyleChanges' });
    if (!decoded || decoded.type !== 'twin') {
      throw createError.notFound('Invalid twin token', ErrorCodes.TWIN_NOT_FOUND);
    }
    const twinId = decoded.id;
    const { styleChanges, testMessage } = req.body;

    if (!testMessage) {
      throw createError.validation('Test message is required', ErrorCodes.MISSING_REQUIRED_FIELD);
    }

    // Verify twin ownership
    const twinResult = await db.query(`
      SELECT id, "styleVector", "personaData" FROM "Twin" 
      WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);

    if (twinResult.rows.length === 0) {
      throw createError.notFound('Twin not found or access denied', ErrorCodes.TWIN_NOT_FOUND);
    }

    const currentStyleVector = twinResult.rows[0].styleVector;
    const personaData = twinResult.rows[0].personaData;

    // MVP (personaData-only): styleVector preview is deprecated. Use personaData settings instead.
    const systemPrompt = await twinService.generateSystemPrompt(personaData);
    const originalResult = await twinService.generateDraftWithContext({
      personaData,
      systemPrompt,
      tokenLimit: 120,
      chatMemory: [],
      currentMessages: ['Say a short hello in my style.'],
      isFirstMessage: false,
      twinId,
    });
    const originalResponse =
      typeof originalResult === 'object' && originalResult && 'response' in originalResult
        ? (originalResult as any).response
        : (typeof originalResult === 'string' ? originalResult : 'Hey!');

    // For MVP, return the same response; styleChanges are ignored.
    const newResponse = originalResponse;
    const previewStyleVector = currentStyleVector;

    res.json({
      success: true,
      originalResponse,
      newResponse,
      previewStyleVector
    });

  } catch (error) {
    next(error);
  }
};

// AI Edit schema
const aiEditSchema = z.object({
  draft: z.string().min(1, 'Draft is required').max(2000),
  contextMessage: z.string().max(2000).optional().default(''),
  tone: z.enum(['normal', 'softer', 'direct']).optional().default('normal'),
  keepShort: z.boolean().optional().default(false),
});

/**
 * AI Edit - Rewrite draft to sound like user
 */
export const aiEditRewrite = async (req: any, res: Response, next: NextFunction) => {
  try {
    const { draft, contextMessage, tone, keepShort } = aiEditSchema.parse(req.body);

    const userId = (req.user as any)?.id || (req.user as any)?.userId;
    if (!userId) {
      throw createError.unauthorized();
    }

    const { twinToken } = req.params;
    const decoded = detokenizeId(twinToken, { userId, endpoint: 'aiEditRewrite' });
    if (!decoded || decoded.type !== 'twin') {
      throw createError.notFound('Invalid twin token', ErrorCodes.TWIN_NOT_FOUND);
    }
    const twinId = decoded.id;

    // Load twin style + persona
    const twinResult = await db.query(
      `SELECT "styleVector", "personaData", "systemPrompt", "tokenLimit"
       FROM "Twin"
       WHERE id = $1 AND "userId" = $2`,
      [twinId, userId],
    );

    if (twinResult.rows.length === 0) {
      throw createError.notFound('Twin not found or access denied', ErrorCodes.TWIN_NOT_FOUND);
    }

    const twin = twinResult.rows[0];

    // Build a single-message context for TwinService
    const baseInstruction =
      'Rewrite the user draft so it sounds like them, following their style, preferences, and rules. Keep the meaning the same. Do not add new facts.';

    let toneInstruction = '';
    if (tone === 'softer') toneInstruction = 'Make tone slightly softer and more polite.';
    if (tone === 'direct') toneInstruction = 'Make tone a bit more direct and clear.';

    const lengthInstruction = keepShort ? 'Keep it short and crisp.' : '';

    const fullUserMessage = [
      baseInstruction,
      toneInstruction,
      lengthInstruction,
      contextMessage ? `Other person last message: "${contextMessage}"` : '',
      `User draft: "${draft}"`,
    ]
      .filter(Boolean)
      .join('\n\n');

    const twinService = new TwinService();

    const result = await twinService.generateDraftWithContext({
      styleVector: twin.styleVector,
      personaData: twin.personaData,
      systemPrompt:
        twin.systemPrompt ||
        'You are the user. Rewrite messages in your voice without changing meaning.',
      tokenLimit: twin.tokenLimit || 300,
      chatMemory: [], // AI Edit is stateless
      currentMessages: [fullUserMessage],
      twinId,
      isFirstMessage: false,
      sessionMemory: null,
    });

    const text = typeof result === 'string' ? result.trim() : result.response?.trim() || '';

    res.json({
      success: true,
      suggestions: [{ id: 's1', text }],
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return next(createError.validation('Invalid input', error.errors));
    }
    next(error);
  }
};

// Twin Settings helpers
function buildDefaultSettings() {
  return {
    replyBehavior: {
      defaultLength: 'normal' as 'short' | 'normal' | 'long',
      riskLevel: 'safe' as 'safe' | 'normal' | 'edgy',
      energy: 'normal' as 'calm' | 'normal' | 'high',
    },
    adaptation: {
      enabled: true,
      styleMix: 50,
    },
    safety: {
      avoidNSFW: true,
      avoidAbuse: true,
      avoidPoliticsReligion: true,
    },
    memory: {
      enabled: true,
      allowPublicContribution: false,
      autoExtractFacts: false,
      allowPublicUse: false,
    },
  };
}

const updateSettingsSchema = z.object({
  replyBehavior: z
    .object({
      defaultLength: z.enum(['short', 'normal', 'long']),
      riskLevel: z.enum(['safe', 'normal', 'edgy']),
      energy: z.enum(['calm', 'normal', 'high']),
    })
    .optional(),
  adaptation: z
    .object({
      enabled: z.boolean(),
      styleMix: z.number().min(0).max(100),
    })
    .optional(),
  safety: z
    .object({
      avoidNSFW: z.boolean(),
      avoidAbuse: z.boolean(),
      avoidPoliticsReligion: z.boolean(),
    })
    .optional(),
    memory: z
      .object({
        enabled: z.boolean(),
        allowPublicContribution: z.boolean().optional(),
        autoExtractFacts: z.boolean().optional(),
        allowPublicUse: z.boolean().optional(),
      })
      .optional(),
});

/**
 * GET /api/twin/:twinToken/settings
 */
export const getTwinSettings = async (req: any, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id || (req.user as any)?.userId;
    if (!userId) throw createError.unauthorized();

    const { twinToken } = req.params;
    const decoded = detokenizeId(twinToken, { userId, endpoint: 'getTwinSettings' });
    if (!decoded || decoded.type !== 'twin') {
      throw createError.notFound('Invalid twin token', ErrorCodes.TWIN_NOT_FOUND);
    }

    const twinId = decoded.id;

    const result = await db.query(
      `SELECT "personaData" FROM "Twin" WHERE id = $1 AND "userId" = $2`,
      [twinId, userId],
    );
    if (result.rows.length === 0) {
      throw createError.notFound('Twin not found or access denied', ErrorCodes.TWIN_NOT_FOUND);
    }

    const pd = result.rows[0].personaData || {};
    const settings = { ...buildDefaultSettings(), ...(pd.settings || {}) };

    res.json({ success: true, settings });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/twin/:twinToken/settings
 */
export const updateTwinSettings = async (req: any, res: Response, next: NextFunction) => {
  try {
    const partial = updateSettingsSchema.parse(req.body);

    const userId = req.user?.id || (req.user as any)?.userId;
    if (!userId) throw createError.unauthorized();

    const { twinToken } = req.params;
    const decoded = detokenizeId(twinToken, { userId, endpoint: 'updateTwinSettings' });
    if (!decoded || decoded.type !== 'twin') {
      throw createError.notFound('Invalid twin token', ErrorCodes.TWIN_NOT_FOUND);
    }
    const twinId = decoded.id;

    const result = await db.query(
      `SELECT "personaData" FROM "Twin" WHERE id = $1 AND "userId" = $2`,
      [twinId, userId],
    );
    if (result.rows.length === 0) {
      throw createError.notFound('Twin not found or access denied', ErrorCodes.TWIN_NOT_FOUND);
    }

    const currentPd = result.rows[0].personaData || {};
    const currentSettings = { ...buildDefaultSettings(), ...(currentPd.settings || {}) };

    const updatedSettings = {
      ...currentSettings,
      ...partial,
    };

    const updatedPersonaData = {
      ...currentPd,
      settings: updatedSettings,
    };

    await db.query(
      `UPDATE "Twin"
       SET "personaData" = $1,
           "last_updated" = $2::timestamptz
       WHERE id = $3 AND "userId" = $4`,
      [JSON.stringify(updatedPersonaData), new Date().toISOString(), twinId, userId],
    );

    res.json({ success: true, settings: updatedSettings });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return next(createError.validation('Invalid input', err.errors));
    }
    next(err);
  }
};

// ✅ AI Tools endpoint used by `frontend/src/views/ai-edit.ejs`
const aiToolsSchema = z.object({
  mode: z.enum(['tester', 'rewrite']),
  input: z.string().min(1).max(2000),

  tonePreset: z.enum(['polite', 'normal', 'casual']).optional(), // ✅ CHANGE
  lengthPreset: z.enum(['short', 'normal', 'detailed']).optional(), // ✅ CHANGE
  emojiPreset: z.enum(['off', 'low', 'medium']).optional(),
  template: z.string().optional(),
});

export const aiToolsGenerate = async (req: any, res: Response, next: NextFunction) => {
  try {
    const userId = (req.user as any)?.id || (req.user as any)?.userId;
    if (!userId) throw createError.unauthorized();

    const { twinToken } = req.params;
    const decoded = detokenizeId(twinToken, { userId, endpoint: 'aiToolsGenerate' });
    if (!decoded || decoded.type !== 'twin') {
      throw createError.notFound('Invalid twin token', ErrorCodes.TWIN_NOT_FOUND);
    }
    const twinId = decoded.id;

    const { mode, input, tonePreset, lengthPreset, emojiPreset, template } = aiToolsSchema.parse(req.body);

    const twinResult = await db.query(`
      SELECT id, "userId", "styleVector", "personaData", "systemPrompt", "tokenLimit"
      FROM "Twin"
      WHERE id = $1 AND "userId" = $2
      LIMIT 1
    `, [twinId, userId]);

    if (twinResult.rows.length === 0) {
      throw createError.notFound('Twin not found or access denied', ErrorCodes.TWIN_NOT_FOUND);
    }

    const twin = twinResult.rows[0];
    const styleVector = twin.styleVector || {};
    const personaData = twin.personaData || {};
    const userName = personaData?.basicInfo?.name || personaData?.basicInfo?.fullName || personaData?.name || 'the user';
    const systemPrompt = twin.systemPrompt || `You are ${userName}. Speak in first person as yourself. Respond naturally and helpfully.`;
    const tokenLimit = twin.tokenLimit || 500;

    const presetLine = [
      tonePreset ? `Tone preset: ${tonePreset}.` : '',
      lengthPreset ? `Length: ${lengthPreset}.` : '',
      emojiPreset ? `Emoji: ${emojiPreset}.` : '',
      template ? `Template: ${template}.` : '',
    ].filter(Boolean).join(' ');

    const baseUserMessage =
      mode === 'tester'
        ? `Other person said: "${input}". Reply as the user's twin. ${presetLine}`
        : `Rewrite this message to match the user's twin voice (same meaning, no new facts): "${input}". ${presetLine}`;

    const variants = [
      { label: 'best', extra: '' },
      { label: 'short', extra: 'Make it shorter and crisp.' },
      { label: 'direct', extra: 'Make it more direct but still polite.' },
    ];

    const results = await Promise.all(
      variants.map(async (v) => {
        const r = await twinService.generateDraftWithContext({
          styleVector,
          personaData,
          systemPrompt,
          tokenLimit,
          chatMemory: [],
          currentMessages: [`${baseUserMessage} ${v.extra}`.trim()],
          twinId,
          isFirstMessage: false,
          sessionMemory: null,
        });

        if (typeof r === 'string') return { label: v.label, text: r };
        if (r && typeof r === 'object' && (r as any).response) return { label: v.label, text: (r as any).response };
        return { label: v.label, text: "I'm having trouble thinking right now. Please try again." };
      })
    );

    res.json({ success: true, suggestions: results });
  } catch (error) {
    if (error instanceof z.ZodError) return next(createError.validation('Invalid input', error.errors));
    next(error);
  }
};