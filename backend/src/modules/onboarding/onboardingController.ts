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

// Simplified onboarding schema - focused on essential data
const enhancedOnboardingSchema = z.object({
  basicInfo: z.object({
    fullName: z.string().min(1, 'Full name is required'),
    bio: z.string().min(50, 'Bio must be at least 50 characters').max(150, 'Bio must not exceed 150 characters'),
    primaryUseCase: z.string().min(1, 'Primary use case is required')
  }),
  communicationStyle: z.object({
    tone: z.object({
      formalCasual: z.number().min(0).max(100),
      seriousPlayful: z.number().min(0).max(100),
      directDiplomatic: z.number().min(0).max(100)
    }),
    language: z.object({
      greetingStyle: z.string().min(1, 'Greeting style is required'),
      closingStyle: z.string().min(1, 'Closing style is required'),
      emojiUsage: z.string().min(1, 'Emoji usage is required'),
      responseLength: z.string().min(1, 'Response length is required'),
      commonPhrases: z.string().optional()
    })
  }),
  context: z.object({
    interests: z.array(z.string()).min(3, 'Please select at least 3 interests'),
    targetAudience: z.string().min(1, 'Target audience is required'),
    topicsToAvoid: z.string().optional()
  }),
  samples: z.object({
    content: z.array(z.object({
      category: z.string(),
      content: z.string().min(20, 'Sample must be at least 20 characters')
    })).min(2, 'At least 2 text samples are required for accuracy')
  }),
  onboardingCompleted: z.boolean(),
  completedAt: z.string()
});

export const createEnhancedTwin = async (req: Request, res: Response) => {
  try {
    console.log('=== ENHANCED TWIN CREATION ===');
    console.log('Request body:', JSON.stringify(req.body, null, 2));

    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Validate the enhanced onboarding data
    const validatedData = enhancedOnboardingSchema.parse(req.body);
    console.log('Validated data:', validatedData);

    // Check if user already has a twin
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
          createdAt: existingTwin.createdAt
        }
      }); 
    }

    // Check if AI generation is enabled
    if (!featureFlags.ENABLE_AI_GENERATION) {
      return res.status(503).json({ error: 'AI generation is currently disabled' });
    }

    // Update user profile with enhanced data
    await updateUserProfile(req.user.id, validatedData);

    // Create enhanced persona data
    const personaData = createPersonaData(validatedData);
    console.log('Generated persona data:', personaData);

    // Generate system prompt from persona
    const systemPrompt = generateSystemPrompt(personaData);
    console.log('Generated system prompt:', systemPrompt);

    // Create style vector from enhanced data
    const styleVector = await createEnhancedStyleVector(validatedData);
    console.log('Generated style vector:', styleVector);

    // Generate sample reply
    const sampleReply = await twinService.generateSampleReply(styleVector);

    // Save enhanced twin to database
    const twinId = generateId.twin();
    
    // Check if enhanced columns exist, if not use basic insert
    let insertQuery, insertParams;
    
    try {
      // Try enhanced insert first
      insertQuery = `
        INSERT INTO "Twin" (id, "userId", "styleVector", "sampleReply", "personaData", "systemPrompt", "tokenLimit", "tier", "createdAt")
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
        500, // tokenLimit
        'free', // tier
        new Date()
      ];
    } catch (error) {
      // Fallback to basic insert if enhanced columns don't exist
      insertQuery = `
        INSERT INTO "Twin" (id, "userId", "styleVector", "sampleReply", "createdAt")
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, "createdAt"
      `;
      insertParams = [
        twinId,
        req.user.id,
        JSON.stringify(styleVector),
        sampleReply,
        new Date()
      ];
    }

    const result = await db.query(insertQuery, insertParams);

    // ✅ Twin created - profile URL is /@user.handle (no TwinProfile needed)

    // Log twin creation event
    await EventLogger.logUserEvent(req.user.id, EVENT_TYPES.ENHANCED_TWIN_CREATED, { 
      publicTwinId: twinId,
      personaData: personaData,
      samplesCount: validatedData.samples.content.length,
    });

    res.json({
      success: true,
      twin: {
        publicId: tokenizeId(twinId, 'twin'),  // ✅ ADD: Always return tokenized ID
        styleVector,
        sampleReply,
        personaData,
        systemPrompt,
        createdAt: result.rows[0].createdAt,
      },
    });

  } catch (error) {
    logger.error('Enhanced twin creation error:', error);
    
    // Log the error event
    if (req.user) {
      await EventLogger.logUserEvent(req.user.id, EVENT_TYPES.TWIN_CREATION_FAILED, { 
        error: error instanceof Error ? error.message : 'Unknown error',
        type: 'enhanced'
      });
    }
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};

async function updateUserProfile(userId: string, data: any) {
  // Try enhanced update first, fallback to basic update
  let updateQuery, updateParams;
  
  try {
    // Enhanced update with persona data
    updateQuery = `
      UPDATE "User" 
      SET 
        name = $1,
        bio = $2,
        "personaData" = $3,
        "onboardingCompleted" = $4,
        "updatedAt" = $5
      WHERE id = $6
    `;
    
    const personaData = {
      basicInfo: data.basicInfo,
      communicationStyle: data.communicationStyle,
      context: data.context,
      samples: data.samples,
      completedAt: data.completedAt
    };

    updateParams = [
      data.basicInfo.fullName,
      data.basicInfo.bio,
      JSON.stringify(personaData),
      data.onboardingCompleted,
      new Date(),
      userId
    ];
  } catch (error) {
    // Fallback to basic update
    updateQuery = `
      UPDATE "User" 
      SET 
        name = $1,
        bio = $2
      WHERE id = $3
    `;
    
    updateParams = [
      data.basicInfo.fullName,
      data.basicInfo.bio,
      userId
    ];
  }

  await db.query(updateQuery, updateParams);
}

function createPersonaData(data: any) {
  return {
    // Basic Information
    name: data.basicInfo.fullName,
    bio: data.basicInfo.bio,
    primaryUseCase: data.basicInfo.primaryUseCase,

    // Communication Style
    communicationStyle: data.communicationStyle,

    // Context & Interests
    context: data.context,

    // Writing Samples (most important for accuracy)
    samples: data.samples,

    // Metadata
    onboardingCompleted: data.onboardingCompleted,
    completedAt: data.completedAt
  };
}

function generateSystemPrompt(personaData: any) {
  const { name, bio, communicationStyle, context, samples } = personaData;
  
  // Build communication style description
  const styleDesc = buildCommunicationStyle(communicationStyle);
  
  // Build context information
  const contextInfo = buildContextInfo(context);
  
  // Reference to samples for style learning
  const samplesNote = samples && samples.content && samples.content.length > 0 
    ? `\n\nWRITING SAMPLES REFERENCE:\nYou have ${samples.content.length} writing sample(s) that demonstrate this person's actual writing style. Use these as reference for tone, vocabulary, and communication patterns.`
    : '';

  return `You are ${name}, an AI twin created to represent this person's communication style and personality.

BIO:
${bio}

COMMUNICATION STYLE:
${styleDesc}

CONTEXT & INTERESTS:
${contextInfo}${samplesNote}

INSTRUCTIONS:
- Always speak in first person as ${name}
- Match the communication style described above exactly
- Use the specified tone, language preferences, and response length
- Be authentic to the person's interests and use case
- Keep responses natural and conversational
- Reference the writing samples to match their actual style
- Remember that you are representing a real person, so be respectful and appropriate

Remember: You are ${name}, not an AI assistant. Respond as this person would, maintaining their unique communication style and personality.`;
}

function buildCommunicationStyle(communicationStyle: any) {
  const { tone, language } = communicationStyle;
  
  let style = "Communication Preferences:\n";
  
  // Tone sliders
  style += `- Formality Level: ${tone.formalCasual > 50 ? 'More formal' : 'More casual'} (${tone.formalCasual}/100)\n`;
  style += `- Tone: ${tone.seriousPlayful > 50 ? 'More serious' : 'More playful'} (${tone.seriousPlayful}/100)\n`;
  style += `- Approach: ${tone.directDiplomatic > 50 ? 'More direct' : 'More diplomatic'} (${tone.directDiplomatic}/100)\n`;
  
  // Language preferences
  style += `\nLanguage Style:\n`;
  style += `- Greeting Style: ${language.greetingStyle}\n`;
  style += `- Closing Style: ${language.closingStyle}\n`;
  style += `- Emoji Usage: ${language.emojiUsage}\n`;
  style += `- Response Length: ${language.responseLength}\n`;
  if (language.commonPhrases) {
    style += `- Common Phrases: ${language.commonPhrases}\n`;
  }
  
  return style;
}

function buildContextInfo(context: any) {
  let info = "Background & Interests:\n";
  info += `- Target Audience: ${context.targetAudience}\n`;
  info += `- Interests: ${context.interests.join(', ')}\n`;
  if (context.topicsToAvoid) {
    info += `- Topics to Avoid: ${context.topicsToAvoid}\n`;
  }
  
  return info;
}


async function createEnhancedStyleVector(data: any) {
  // Create style vector based on simplified onboarding data
  const styleVector = {
    // Communication style
    communicationStyle: data.communicationStyle,
    
    // Context information
    context: data.context,
    
    // Sample analysis (most important for accuracy)
    samples: data.samples.content.length > 0 ? {
      count: data.samples.content.length,
      categories: data.samples.content.map((s: any) => s.category),
      // Samples will be analyzed for actual style patterns
      hasSamples: true
    } : null,
    
    // Metadata
    createdAt: new Date().toISOString(),
    version: '3.0' // Simplified version focused on essentials
  };
  
  return styleVector;
}
