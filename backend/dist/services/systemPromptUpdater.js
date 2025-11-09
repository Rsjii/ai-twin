"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.systemPromptUpdater = exports.SystemPromptUpdater = void 0;
const database_1 = require("../config/database");
const logger_1 = require("../config/logger");
const twinService_1 = require("../modules/twin/twinService");
const env_1 = require("../config/env");
const openai_1 = __importDefault(require("openai"));
const openai = new openai_1.default({
    apiKey: env_1.config.openaiApiKey,
});
class SystemPromptUpdater {
    twinService;
    constructor() {
        this.twinService = new twinService_1.TwinService();
    }
    async updateTwinSystemPrompt(twinId) {
        try {
            logger_1.logger.info(`Updating system prompt for twin: ${twinId}`);
            const twinResult = await database_1.db.query(`
        SELECT id, "styleVector", "personaData", "systemPrompt", "userId"
        FROM "Twin" 
        WHERE id = $1
      `, [twinId]);
            if (twinResult.rows.length === 0) {
                logger_1.logger.warn(`Twin ${twinId} not found`);
                return false;
            }
            const twin = twinResult.rows[0];
            const memoriesResult = await database_1.db.query(`
        SELECT text, bucket, ts
        FROM mem_chunks 
        WHERE twin_id = $1 
        AND ts >= NOW() - INTERVAL '30 days'
        ORDER BY ts DESC
        LIMIT 20
      `, [twinId]);
            const anchorsResult = await database_1.db.query(`
        SELECT "userUtterance", "idealReply", "trainingType", "createdAt"
        FROM style_anchors 
        WHERE "twinId" = $1 
        ORDER BY "createdAt" DESC
        LIMIT 10
      `, [twinId]);
            const feedbackResult = await database_1.db.query(`
        SELECT knob, AVG(delta) as avg_delta, COUNT(*) as count
        FROM style_corrections 
        WHERE twin_id = $1 
        AND ts >= NOW() - INTERVAL '7 days'
        GROUP BY knob
        HAVING COUNT(*) >= 2
      `, [twinId]);
            const enhancedPrompt = await this.generateEnhancedSystemPrompt(twin.styleVector, twin.personaData, memoriesResult.rows, anchorsResult.rows, feedbackResult.rows);
            await database_1.db.query(`
        UPDATE "Twin" 
        SET "systemPrompt" = $1, "last_updated" = NOW()
        WHERE id = $2
      `, [enhancedPrompt, twinId]);
            logger_1.logger.info(`System prompt updated for twin ${twinId}`);
            return true;
        }
        catch (error) {
            logger_1.logger.error(`Error updating system prompt for twin ${twinId}:`, error);
            return false;
        }
    }
    async generateEnhancedSystemPrompt(styleVector, personaData, memories, anchors, feedback) {
        try {
            const memoryContext = memories.length > 0 ?
                `RECENT MEMORIES (use as context):
${memories.map(m => `- ${m.text}`).join('\n')}` : '';
            const anchorContext = anchors.length > 0 ?
                `STYLE EXAMPLES (follow these patterns):
${anchors.map(a => `User: "${a.userUtterance}"\nIdeal Reply: "${a.idealReply}"`).join('\n\n')}` : '';
            const feedbackContext = feedback.length > 0 ?
                `RECENT FEEDBACK PATTERNS (adjust accordingly):
${feedback.map(f => `- ${f.knob}: ${f.avg_delta > 0 ? 'increase' : 'decrease'} (${f.count} votes)`).join('\n')}` : '';
            const promptGenerationPrompt = `You are a system prompt optimizer. Create an enhanced system prompt for an AI twin based on the following data:

CURRENT STYLE VECTOR: ${JSON.stringify(styleVector)}
PERSONA DATA: ${JSON.stringify(personaData || {})}

${memoryContext}

${anchorContext}

${feedbackContext}

Create a comprehensive system prompt that:
1. Incorporates the style vector characteristics
2. Uses recent memories as context
3. Follows the style examples provided
4. Adjusts based on feedback patterns
5. Maintains the twin's personality

Return only the system prompt, no additional text.`;
            const response = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: promptGenerationPrompt },
                    { role: 'user', content: 'Generate the enhanced system prompt' }
                ],
                temperature: 0.3,
                max_tokens: 1000
            });
            return response.choices[0]?.message?.content || this.generateFallbackPrompt(styleVector, personaData);
        }
        catch (error) {
            logger_1.logger.error('Error generating enhanced system prompt:', error);
            return this.generateFallbackPrompt(styleVector, personaData);
        }
    }
    generateFallbackPrompt(styleVector, personaData) {
        return `You are an AI twin that mimics the user's communication style.

Style characteristics:
- Tone: ${styleVector.tone || 'friendly'}
- Formality: ${styleVector.formality_level || 0.5}
- Emoji usage: ${styleVector.emoji_usage || 0.3}
- Humor style: ${styleVector.humor_style || 'light'}
- Response length: ${styleVector.response_length_preference || 'detailed'}
- Question frequency: ${styleVector.question_frequency || 0.4}

${personaData ? `Persona: ${JSON.stringify(personaData)}` : ''}

Respond in the user's style, maintaining their unique voice and patterns.`;
    }
    async updateAllTwins() {
        try {
            logger_1.logger.info('Starting system prompt update for all twins');
            const twinsResult = await database_1.db.query(`
        SELECT t.id, t."userId"
        FROM "Twin" t
        WHERE t."last_updated" IS NULL 
        OR t."last_updated" < NOW() - INTERVAL '7 days'
        OR (
          SELECT COUNT(*) FROM "Chat" c 
          WHERE c."twinId" = t.id 
          AND c."createdAt" >= COALESCE(t."last_updated", t."createdAt")
        ) >= 5
      `);
            logger_1.logger.info(`Found ${twinsResult.rows.length} twins to update`);
            for (const twin of twinsResult.rows) {
                await this.updateTwinSystemPrompt(twin.id);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            logger_1.logger.info('System prompt update completed for all twins');
        }
        catch (error) {
            logger_1.logger.error('Error updating all twins:', error);
        }
    }
}
exports.SystemPromptUpdater = SystemPromptUpdater;
exports.systemPromptUpdater = new SystemPromptUpdater();
//# sourceMappingURL=systemPromptUpdater.js.map