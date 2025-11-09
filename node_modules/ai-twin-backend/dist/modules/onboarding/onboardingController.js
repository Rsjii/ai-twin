"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEnhancedTwin = void 0;
const database_1 = require("../../config/database");
const logger_1 = require("../../config/logger");
const zod_1 = require("zod");
const eventLogger_1 = require("../../services/eventLogger");
const twinService_1 = require("../twin/twinService");
const featureFlags_1 = require("../../config/featureFlags");
const twinService = new twinService_1.TwinService();
const enhancedOnboardingSchema = zod_1.z.object({
    basicInfo: zod_1.z.object({
        fullName: zod_1.z.string().min(1, 'Full name is required'),
        username: zod_1.z.string().min(3, 'Username must be at least 3 characters'),
        bio: zod_1.z.string().min(50, 'Bio must be at least 50 characters').max(150, 'Bio must not exceed 150 characters'),
        ageRange: zod_1.z.string().min(1, 'Age range is required'),
        profession: zod_1.z.string().min(1, 'Profession is required'),
        location: zod_1.z.string().min(1, 'Location is required')
    }),
    personality: zod_1.z.object({
        ocean: zod_1.z.object({
            openness: zod_1.z.number().min(1).max(5),
            conscientiousness: zod_1.z.number().min(1).max(5),
            extraversion: zod_1.z.number().min(1).max(5),
            agreeableness: zod_1.z.number().min(1).max(5),
            neuroticism: zod_1.z.number().min(1).max(5)
        }),
        communicationStyle: zod_1.z.object({
            formality: zod_1.z.number().min(1).max(5),
            casual: zod_1.z.number().min(1).max(5),
            humor: zod_1.z.number().min(1).max(5),
            directness: zod_1.z.number().min(1).max(5)
        })
    }),
    tone: zod_1.z.object({
        sliders: zod_1.z.object({
            formalCasual: zod_1.z.number().min(0).max(100),
            seriousPlayful: zod_1.z.number().min(0).max(100),
            directDiplomatic: zod_1.z.number().min(0).max(100),
            enthusiasticReserved: zod_1.z.number().min(0).max(100),
            technicalSimple: zod_1.z.number().min(0).max(100),
            warmProfessional: zod_1.z.number().min(0).max(100)
        }),
        scenarios: zod_1.z.object({
            greetingStyle: zod_1.z.string().optional(),
            badNewsStyle: zod_1.z.string().optional(),
            excitementStyle: zod_1.z.string().optional()
        })
    }),
    language: zod_1.z.object({
        greetingStyle: zod_1.z.string().min(1, 'Greeting style is required'),
        closingStyle: zod_1.z.string().min(1, 'Closing style is required'),
        punctuationStyle: zod_1.z.string().min(1, 'Punctuation style is required'),
        vocabularyLevel: zod_1.z.string().min(1, 'Vocabulary level is required'),
        slangUsage: zod_1.z.string().min(1, 'Slang usage is required')
    }),
    context: zod_1.z.object({
        interests: zod_1.z.array(zod_1.z.string()).min(3, 'Please select at least 3 interests'),
        primaryUseCase: zod_1.z.string().min(1, 'Primary use case is required'),
        targetAudience: zod_1.z.string().min(1, 'Target audience is required')
    }),
    samples: zod_1.z.object({
        categories: zod_1.z.array(zod_1.z.string()),
        content: zod_1.z.array(zod_1.z.object({
            category: zod_1.z.string(),
            content: zod_1.z.string()
        }))
    }),
    onboardingCompleted: zod_1.z.boolean(),
    completedAt: zod_1.z.string()
});
const createEnhancedTwin = async (req, res) => {
    try {
        console.log('=== ENHANCED TWIN CREATION ===');
        console.log('Request body:', JSON.stringify(req.body, null, 2));
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const validatedData = enhancedOnboardingSchema.parse(req.body);
        console.log('Validated data:', validatedData);
        const existingTwinQuery = `
      SELECT id, "createdAt" 
      FROM "Twin" 
      WHERE "userId" = $1 
      LIMIT 1
    `;
        const existingTwinResult = await database_1.db.query(existingTwinQuery, [req.user.id]);
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
        if (!featureFlags_1.featureFlags.ENABLE_AI_GENERATION) {
            return res.status(503).json({ error: 'AI generation is currently disabled' });
        }
        await updateUserProfile(req.user.id, validatedData);
        const personaData = createPersonaData(validatedData);
        console.log('Generated persona data:', personaData);
        const systemPrompt = generateSystemPrompt(personaData);
        console.log('Generated system prompt:', systemPrompt);
        const styleVector = await createEnhancedStyleVector(validatedData);
        console.log('Generated style vector:', styleVector);
        const sampleReply = await twinService.generateSampleReply(styleVector);
        const twinId = `twin_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        let insertQuery, insertParams;
        try {
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
                500,
                'free',
                new Date()
            ];
        }
        catch (error) {
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
        const result = await database_1.db.query(insertQuery, insertParams);
        await eventLogger_1.EventLogger.logUserEvent(req.user.id, 'enhanced_twin_created', {
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
    }
    catch (error) {
        logger_1.logger.error('Enhanced twin creation error:', error);
        if (req.user) {
            await eventLogger_1.EventLogger.logUserEvent(req.user.id, 'enhanced_twin_creation_failed', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: 'Invalid input', details: error.errors });
        }
        if (error instanceof Error) {
            return res.status(400).json({ error: error.message });
        }
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.createEnhancedTwin = createEnhancedTwin;
async function updateUserProfile(userId, data) {
    let updateQuery, updateParams;
    try {
        updateQuery = `
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
        updateParams = [
            data.basicInfo.fullName,
            data.basicInfo.username,
            data.basicInfo.bio,
            JSON.stringify(personaData),
            data.onboardingCompleted,
            new Date(),
            userId
        ];
    }
    catch (error) {
        updateQuery = `
      UPDATE "User" 
      SET 
        name = $1,
        handle = $2,
        bio = $3
      WHERE id = $4
    `;
        updateParams = [
            data.basicInfo.fullName,
            data.basicInfo.username,
            data.basicInfo.bio,
            userId
        ];
    }
    await database_1.db.query(updateQuery, updateParams);
}
function createPersonaData(data) {
    return {
        name: data.basicInfo.fullName,
        username: data.basicInfo.username,
        bio: data.basicInfo.bio,
        ageRange: data.basicInfo.ageRange,
        profession: data.basicInfo.profession,
        location: data.basicInfo.location,
        personality: {
            ocean: data.personality.ocean,
            communicationStyle: data.personality.communicationStyle
        },
        tone: data.tone,
        language: data.language,
        context: data.context,
        samples: data.samples,
        onboardingCompleted: data.onboardingCompleted,
        completedAt: data.completedAt
    };
}
function generateSystemPrompt(personaData) {
    const { name, bio, personality, tone, language, context } = personaData;
    const personalityDesc = buildPersonalityDescription(personality);
    const communicationStyle = buildCommunicationStyle(tone, language);
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
function buildPersonalityDescription(personality) {
    const { ocean, communicationStyle } = personality;
    let description = "Personality Traits:\n";
    description += `- Openness: ${getTraitDescription('openness', ocean.openness)}\n`;
    description += `- Conscientiousness: ${getTraitDescription('conscientiousness', ocean.conscientiousness)}\n`;
    description += `- Extraversion: ${getTraitDescription('extraversion', ocean.extraversion)}\n`;
    description += `- Agreeableness: ${getTraitDescription('agreeableness', ocean.agreeableness)}\n`;
    description += `- Neuroticism: ${getTraitDescription('neuroticism', ocean.neuroticism)}\n`;
    description += "\nCommunication Style:\n";
    description += `- Formality Level: ${getFormalityDescription(communicationStyle.formality)}\n`;
    description += `- Humor Usage: ${getHumorDescription(communicationStyle.humor)}\n`;
    description += `- Directness: ${getDirectnessDescription(communicationStyle.directness)}\n`;
    return description;
}
function buildCommunicationStyle(tone, language) {
    let style = "Communication Preferences:\n";
    style += `- Formality: ${tone.sliders.formalCasual > 50 ? 'More formal' : 'More casual'}\n`;
    style += `- Energy: ${tone.sliders.enthusiasticReserved > 50 ? 'More enthusiastic' : 'More reserved'}\n`;
    style += `- Approach: ${tone.sliders.directDiplomatic > 50 ? 'More direct' : 'More diplomatic'}\n`;
    style += `- Language: ${tone.sliders.technicalSimple > 50 ? 'More technical' : 'More simple'}\n`;
    style += `- Greeting Style: ${language.greetingStyle}\n`;
    style += `- Closing Style: ${language.closingStyle}\n`;
    style += `- Punctuation: ${language.punctuationStyle}\n`;
    style += `- Vocabulary: ${language.vocabularyLevel}\n`;
    style += `- Slang Usage: ${language.slangUsage}\n`;
    return style;
}
function buildContextInfo(context) {
    let info = "Background & Interests:\n";
    info += `- Primary Use: ${context.primaryUseCase}\n`;
    info += `- Target Audience: ${context.targetAudience}\n`;
    info += `- Interests: ${context.interests.join(', ')}\n`;
    return info;
}
function getTraitDescription(trait, score) {
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
    return descriptions[trait][score] || 'Balanced';
}
function getFormalityDescription(score) {
    const descriptions = {
        1: 'Very casual and informal',
        2: 'Somewhat casual',
        3: 'Balanced formality',
        4: 'Somewhat formal',
        5: 'Very formal and professional'
    };
    return descriptions[score] || 'Balanced';
}
function getHumorDescription(score) {
    const descriptions = {
        1: 'Rarely uses humor',
        2: 'Occasionally uses humor',
        3: 'Balanced use of humor',
        4: 'Frequently uses humor',
        5: 'Always incorporates humor'
    };
    return descriptions[score] || 'Balanced';
}
function getDirectnessDescription(score) {
    const descriptions = {
        1: 'Very indirect and diplomatic',
        2: 'Somewhat indirect',
        3: 'Balanced directness',
        4: 'Somewhat direct',
        5: 'Very direct and straightforward'
    };
    return descriptions[score] || 'Balanced';
}
async function createEnhancedStyleVector(data) {
    const styleVector = {
        personality: data.personality,
        tone: data.tone,
        language: data.language,
        context: data.context,
        samples: data.samples.content.length > 0 ? {
            count: data.samples.content.length,
            categories: data.samples.categories,
            analysis: 'Enhanced analysis based on provided samples'
        } : null,
        createdAt: new Date().toISOString(),
        version: '2.0'
    };
    return styleVector;
}
//# sourceMappingURL=onboardingController.js.map