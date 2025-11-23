"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEnhancedTwin = void 0;
const database_1 = require("../../config/database");
const logger_1 = require("../../config/logger");
const zod_1 = require("zod");
const eventLogger_1 = require("../../services/eventLogger");
const twinService_1 = require("../twin/twinService");
const featureFlags_1 = require("../../config/featureFlags");
const idGenerator_1 = require("../../utils/idGenerator");
const twinService = new twinService_1.TwinService();
const enhancedOnboardingSchema = zod_1.z.object({
    basicInfo: zod_1.z.object({
        fullName: zod_1.z.string().min(1, 'Full name is required'),
        username: zod_1.z.string().min(3, 'Username must be at least 3 characters'),
        bio: zod_1.z.string().min(50, 'Bio must be at least 50 characters').max(150, 'Bio must not exceed 150 characters'),
        primaryUseCase: zod_1.z.string().min(1, 'Primary use case is required')
    }),
    communicationStyle: zod_1.z.object({
        tone: zod_1.z.object({
            formalCasual: zod_1.z.number().min(0).max(100),
            seriousPlayful: zod_1.z.number().min(0).max(100),
            directDiplomatic: zod_1.z.number().min(0).max(100)
        }),
        language: zod_1.z.object({
            greetingStyle: zod_1.z.string().min(1, 'Greeting style is required'),
            closingStyle: zod_1.z.string().min(1, 'Closing style is required'),
            emojiUsage: zod_1.z.string().min(1, 'Emoji usage is required'),
            responseLength: zod_1.z.string().min(1, 'Response length is required'),
            commonPhrases: zod_1.z.string().optional()
        })
    }),
    context: zod_1.z.object({
        interests: zod_1.z.array(zod_1.z.string()).min(3, 'Please select at least 3 interests'),
        targetAudience: zod_1.z.string().min(1, 'Target audience is required'),
        topicsToAvoid: zod_1.z.string().optional()
    }),
    samples: zod_1.z.object({
        content: zod_1.z.array(zod_1.z.object({
            category: zod_1.z.string(),
            content: zod_1.z.string().min(20, 'Sample must be at least 20 characters')
        })).min(2, 'At least 2 text samples are required for accuracy')
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
        const twinId = idGenerator_1.generateId.twin();
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
            communicationStyle: data.communicationStyle,
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
        primaryUseCase: data.basicInfo.primaryUseCase,
        communicationStyle: data.communicationStyle,
        context: data.context,
        samples: data.samples,
        onboardingCompleted: data.onboardingCompleted,
        completedAt: data.completedAt
    };
}
function generateSystemPrompt(personaData) {
    const { name, bio, communicationStyle, context, samples } = personaData;
    const styleDesc = buildCommunicationStyle(communicationStyle);
    const contextInfo = buildContextInfo(context);
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
function buildCommunicationStyle(communicationStyle) {
    const { tone, language } = communicationStyle;
    let style = "Communication Preferences:\n";
    style += `- Formality Level: ${tone.formalCasual > 50 ? 'More formal' : 'More casual'} (${tone.formalCasual}/100)\n`;
    style += `- Tone: ${tone.seriousPlayful > 50 ? 'More serious' : 'More playful'} (${tone.seriousPlayful}/100)\n`;
    style += `- Approach: ${tone.directDiplomatic > 50 ? 'More direct' : 'More diplomatic'} (${tone.directDiplomatic}/100)\n`;
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
function buildContextInfo(context) {
    let info = "Background & Interests:\n";
    info += `- Target Audience: ${context.targetAudience}\n`;
    info += `- Interests: ${context.interests.join(', ')}\n`;
    if (context.topicsToAvoid) {
        info += `- Topics to Avoid: ${context.topicsToAvoid}\n`;
    }
    return info;
}
async function createEnhancedStyleVector(data) {
    const styleVector = {
        communicationStyle: data.communicationStyle,
        context: data.context,
        samples: data.samples.content.length > 0 ? {
            count: data.samples.content.length,
            categories: data.samples.content.map((s) => s.category),
            hasSamples: true
        } : null,
        createdAt: new Date().toISOString(),
        version: '3.0'
    };
    return styleVector;
}
//# sourceMappingURL=onboardingController.js.map