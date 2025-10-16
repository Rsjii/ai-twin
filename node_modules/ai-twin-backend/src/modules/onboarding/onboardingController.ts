import { Request, Response } from 'express';
import { db } from '../../config/database';
import { logger } from '../../config/logger';
import { z } from 'zod';
import { EventLogger } from '../../services/eventLogger';
import { TwinService } from '../twin/twinService';
import { featureFlags } from '../../config/featureFlags';

const twinService = new TwinService();

// Enhanced onboarding schema
const enhancedOnboardingSchema = z.object({
  basicInfo: z.object({
    fullName: z.string().min(1, 'Full name is required'),
    username: z.string().min(3, 'Username must be at least 3 characters'),
    bio: z.string().min(50, 'Bio must be at least 50 characters').max(150, 'Bio must not exceed 150 characters'),
    ageRange: z.string().min(1, 'Age range is required'),
    profession: z.string().min(1, 'Profession is required'),
    location: z.string().min(1, 'Location is required')
  }),
  personality: z.object({
    ocean: z.object({
      openness: z.number().min(1).max(5),
      conscientiousness: z.number().min(1).max(5),
      extraversion: z.number().min(1).max(5),
      agreeableness: z.number().min(1).max(5),
      neuroticism: z.number().min(1).max(5)
    }),
    communicationStyle: z.object({
      formality: z.number().min(1).max(5),
      casual: z.number().min(1).max(5),
      humor: z.number().min(1).max(5),
      directness: z.number().min(1).max(5)
    })
  }),
  tone: z.object({
    sliders: z.object({
      formalCasual: z.number().min(0).max(100),
      seriousPlayful: z.number().min(0).max(100),
      directDiplomatic: z.number().min(0).max(100),
      enthusiasticReserved: z.number().min(0).max(100),
      technicalSimple: z.number().min(0).max(100),
      warmProfessional: z.number().min(0).max(100)
    }),
    scenarios: z.object({
      greetingStyle: z.string().optional(),
      badNewsStyle: z.string().optional(),
      excitementStyle: z.string().optional()
    })
  }),
  language: z.object({
    greetingStyle: z.string().min(1, 'Greeting style is required'),
    closingStyle: z.string().min(1, 'Closing style is required'),
    punctuationStyle: z.string().min(1, 'Punctuation style is required'),
    vocabularyLevel: z.string().min(1, 'Vocabulary level is required'),
    slangUsage: z.string().min(1, 'Slang usage is required')
  }),
  context: z.object({
    interests: z.array(z.string()).min(3, 'Please select at least 3 interests'),
    primaryUseCase: z.string().min(1, 'Primary use case is required'),
    targetAudience: z.string().min(1, 'Target audience is required')
  }),
  samples: z.object({
    categories: z.array(z.string()),
    content: z.array(z.object({
      category: z.string(),
      content: z.string()
    }))
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
    const twinId = `twin_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const insertQuery = `
      INSERT INTO "Twin" (id, "userId", "styleVector", "sampleReply", "personaData", "systemPrompt", "createdAt")
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, "createdAt"
    `;

    const result = await db.query(insertQuery, [
      twinId,
      req.user.id,
      JSON.stringify(styleVector),
      sampleReply,
      JSON.stringify(personaData),
      systemPrompt,
      new Date()
    ]);

    // Log twin creation event
    await EventLogger.logUserEvent(req.user.id, 'enhanced_twin_created', { 
      twinId: twinId,
      personaData: personaData,
      samplesCount: validatedData.samples.content.length,
      onboardingCompleted: validatedData.onboardingCompleted
    });

    res.json({
      success: true,
      twin: {
        id: twinId,
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
      await EventLogger.logUserEvent(req.user.id, 'enhanced_twin_creation_failed', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
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
  const updateQuery = `
    UPDATE "User" 
    SET 
      name = $1,
      handle = $2,
      bio = $3,
      "personaData" = $4,
      "onboardingCompleted" = $5,
      "updatedAt" = $6
    WHERE id = $7
  `;

  const personaData = {
    basicInfo: data.basicInfo,
    personality: data.personality,
    tone: data.tone,
    language: data.language,
    context: data.context,
    samples: data.samples,
    completedAt: data.completedAt
  };

  await db.query(updateQuery, [
    data.basicInfo.fullName,
    data.basicInfo.username,
    data.basicInfo.bio,
    JSON.stringify(personaData),
    data.onboardingCompleted,
    new Date(),
    userId
  ]);
}

function createPersonaData(data: any) {
  return {
    // Basic Information
    name: data.basicInfo.fullName,
    username: data.basicInfo.username,
    bio: data.basicInfo.bio,
    ageRange: data.basicInfo.ageRange,
    profession: data.basicInfo.profession,
    location: data.basicInfo.location,

    // Personality Traits
    personality: {
      ocean: data.personality.ocean,
      communicationStyle: data.personality.communicationStyle
    },

    // Communication Preferences
    tone: data.tone,
    language: data.language,

    // Context & Interests
    context: data.context,

    // Writing Samples
    samples: data.samples,

    // Metadata
    onboardingCompleted: data.onboardingCompleted,
    completedAt: data.completedAt
  };
}

function generateSystemPrompt(personaData: any) {
  const { name, bio, personality, tone, language, context } = personaData;
  
  // Build personality description
  const personalityDesc = buildPersonalityDescription(personality);
  
  // Build communication style
  const communicationStyle = buildCommunicationStyle(tone, language);
  
  // Build context information
  const contextInfo = buildContextInfo(context);

  return `You are ${name}, an AI twin created to represent this person's personality and communication style.

PERSONALITY PROFILE:
${personalityDesc}

COMMUNICATION STYLE:
${communicationStyle}

CONTEXT & INTERESTS:
${contextInfo}

BIO:
${bio}

INSTRUCTIONS:
- Always speak in first person as ${name}
- Maintain the personality traits and communication style described above
- Be authentic to the person's interests and background
- Use the specified tone and language preferences
- Keep responses natural and conversational
- Remember that you are representing a real person, so be respectful and appropriate

Remember: You are ${name}, not an AI assistant. Respond as this person would, maintaining their unique personality and communication style.`;
}

function buildPersonalityDescription(personality: any) {
  const { ocean, communicationStyle } = personality;
  
  let description = "Personality Traits:\n";
  
  // OCEAN traits
  description += `- Openness: ${getTraitDescription('openness', ocean.openness)}\n`;
  description += `- Conscientiousness: ${getTraitDescription('conscientiousness', ocean.conscientiousness)}\n`;
  description += `- Extraversion: ${getTraitDescription('extraversion', ocean.extraversion)}\n`;
  description += `- Agreeableness: ${getTraitDescription('agreeableness', ocean.agreeableness)}\n`;
  description += `- Neuroticism: ${getTraitDescription('neuroticism', ocean.neuroticism)}\n`;
  
  // Communication style
  description += "\nCommunication Style:\n";
  description += `- Formality Level: ${getFormalityDescription(communicationStyle.formality)}\n`;
  description += `- Humor Usage: ${getHumorDescription(communicationStyle.humor)}\n`;
  description += `- Directness: ${getDirectnessDescription(communicationStyle.directness)}\n`;
  
  return description;
}

function buildCommunicationStyle(tone: any, language: any) {
  let style = "Communication Preferences:\n";
  
  // Tone sliders
  style += `- Formality: ${tone.sliders.formalCasual > 50 ? 'More formal' : 'More casual'}\n`;
  style += `- Energy: ${tone.sliders.enthusiasticReserved > 50 ? 'More enthusiastic' : 'More reserved'}\n`;
  style += `- Approach: ${tone.sliders.directDiplomatic > 50 ? 'More direct' : 'More diplomatic'}\n`;
  style += `- Language: ${tone.sliders.technicalSimple > 50 ? 'More technical' : 'More simple'}\n`;
  
  // Language preferences
  style += `- Greeting Style: ${language.greetingStyle}\n`;
  style += `- Closing Style: ${language.closingStyle}\n`;
  style += `- Punctuation: ${language.punctuationStyle}\n`;
  style += `- Vocabulary: ${language.vocabularyLevel}\n`;
  style += `- Slang Usage: ${language.slangUsage}\n`;
  
  return style;
}

function buildContextInfo(context: any) {
  let info = "Background & Interests:\n";
  info += `- Primary Use: ${context.primaryUseCase}\n`;
  info += `- Target Audience: ${context.targetAudience}\n`;
  info += `- Interests: ${context.interests.join(', ')}\n`;
  
  return info;
}

function getTraitDescription(trait: string, score: number) {
  const descriptions = {
    openness: {
      1: 'Very traditional, prefers routine',
      2: 'Somewhat traditional',
      3: 'Balanced between traditional and open',
      4: 'Somewhat open to new experiences',
      5: 'Very open to new experiences and ideas'
    },
    conscientiousness: {
      1: 'Very spontaneous, flexible',
      2: 'Somewhat spontaneous',
      3: 'Balanced between organized and flexible',
      4: 'Somewhat organized and disciplined',
      5: 'Very organized and disciplined'
    },
    extraversion: {
      1: 'Very introverted, prefers solitude',
      2: 'Somewhat introverted',
      3: 'Balanced between introverted and extroverted',
      4: 'Somewhat extroverted',
      5: 'Very extroverted, enjoys social interaction'
    },
    agreeableness: {
      1: 'Very competitive, skeptical',
      2: 'Somewhat competitive',
      3: 'Balanced between competitive and cooperative',
      4: 'Somewhat cooperative and trusting',
      5: 'Very cooperative and trusting'
    },
    neuroticism: {
      1: 'Very emotionally stable, calm',
      2: 'Somewhat stable',
      3: 'Balanced emotional stability',
      4: 'Somewhat sensitive to stress',
      5: 'Very sensitive to stress and emotions'
    }
  };
  
  return descriptions[trait as keyof typeof descriptions][score as keyof typeof descriptions[keyof typeof descriptions]] || 'Balanced';
}

function getFormalityDescription(score: number) {
  const descriptions = {
    1: 'Very casual and informal',
    2: 'Somewhat casual',
    3: 'Balanced formality',
    4: 'Somewhat formal',
    5: 'Very formal and professional'
  };
  return descriptions[score as keyof typeof descriptions] || 'Balanced';
}

function getHumorDescription(score: number) {
  const descriptions = {
    1: 'Rarely uses humor',
    2: 'Occasionally uses humor',
    3: 'Balanced use of humor',
    4: 'Frequently uses humor',
    5: 'Always incorporates humor'
  };
  return descriptions[score as keyof typeof descriptions] || 'Balanced';
}

function getDirectnessDescription(score: number) {
  const descriptions = {
    1: 'Very indirect and diplomatic',
    2: 'Somewhat indirect',
    3: 'Balanced directness',
    4: 'Somewhat direct',
    5: 'Very direct and straightforward'
  };
  return descriptions[score as keyof typeof descriptions] || 'Balanced';
}

async function createEnhancedStyleVector(data: any) {
  // Create a more sophisticated style vector based on all the collected data
  const styleVector = {
    // Basic personality traits
    personality: data.personality,
    
    // Communication preferences
    tone: data.tone,
    language: data.language,
    
    // Context information
    context: data.context,
    
    // Sample analysis (if provided)
    samples: data.samples.content.length > 0 ? {
      count: data.samples.content.length,
      categories: data.samples.categories,
      // In a real implementation, you would analyze the actual sample content here
      analysis: 'Enhanced analysis based on provided samples'
    } : null,
    
    // Metadata
    createdAt: new Date().toISOString(),
    version: '2.0' // Enhanced version
  };
  
  return styleVector;
}
