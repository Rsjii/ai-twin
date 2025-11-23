import { db } from '../config/database';
import { logger } from '../config/logger';
import { TwinService } from '../modules/twin/twinService';
import { config } from '../config/env';
// COMMENTED OUT: OpenAI - Now using Groq via llmClient
// import OpenAI from 'openai';

// const openai = new OpenAI({
//   apiKey: config.openaiApiKey,
// });

// NEW: Import llmClient
import { llmClient } from './llmClient';

export class SystemPromptUpdater {
  private twinService: TwinService;

  constructor() {
    this.twinService = new TwinService();
  }

  /**
   * Update system prompt for a specific twin
   */
  async updateTwinSystemPrompt(twinId: string): Promise<boolean> {
    try {
      logger.info(`Updating system prompt for twin: ${twinId}`);

      // Get twin data
      const twinResult = await db.query(`
        SELECT id, "styleVector", "personaData", "systemPrompt", "userId"
        FROM "Twin" 
        WHERE id = $1
      `, [twinId]);

      if (twinResult.rows.length === 0) {
        logger.warn(`Twin ${twinId} not found`);
        return false;
      }

      const twin = twinResult.rows[0];

// Get from both MemoryLongTerm and StyleAnchors
const [longTermMemories, styleAnchors] = await Promise.all([
  db.query(`
    SELECT value as text, category as bucket, "updatedAt" as ts
    FROM "MemoryLongTerm"
    WHERE "twinId" = $1 
    AND "updatedAt" >= NOW() - INTERVAL '30 days'
    ORDER BY "updatedAt" DESC
    LIMIT 10
  `, [twinId]),
  db.query(`
    SELECT phrase as text, 'voice' as bucket, created_at as ts
    FROM "style_anchors"
    WHERE twin_id = $1 
    AND type = 'phrase'
    AND created_at >= NOW() - INTERVAL '30 days'
    ORDER BY created_at DESC
    LIMIT 10
  `, [twinId])
]);

const memoriesResult = {
  rows: [
    ...longTermMemories.rows,
    ...styleAnchors.rows
  ].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime()).slice(0, 20)
};      

// Get top style anchors - use correct column names
const anchorsResult = await db.query(`
  SELECT user_utterance, ideal_reply, tags, created_at
  FROM "style_anchors" 
  WHERE twin_id = $1 
  ORDER BY created_at DESC
  LIMIT 10
`, [twinId]);      

      // Get recent feedback patterns - FIXED: use correct column names
      const feedbackResult = await db.query(`
        SELECT knob, AVG(delta) as avg_delta, COUNT(*) as count
        FROM style_corrections 
        WHERE twin_id = $1 
        AND ts >= NOW() - INTERVAL '7 days'
        GROUP BY knob
        HAVING COUNT(*) >= 2
      `, [twinId]);

      // Generate enhanced system prompt
      const enhancedPrompt = await this.generateEnhancedSystemPrompt(
        twin.styleVector,
        twin.personaData,
        memoriesResult.rows,
        anchorsResult.rows,
        feedbackResult.rows
      );

      // Update twin with new system prompt
      const utcTimestamp = new Date().toISOString();
      await db.query(`
        UPDATE "Twin" 
        SET "systemPrompt" = $1, "last_updated" = $2::timestamptz
        WHERE id = $3
      `, [enhancedPrompt, utcTimestamp, twinId]);

      logger.info(`System prompt updated for twin ${twinId}`);
      return true;

    } catch (error) {
      logger.error(`Error updating system prompt for twin ${twinId}:`, error);
      return false;
    }
  }

  /**
   * Generate enhanced system prompt based on learning data
   */
  private async generateEnhancedSystemPrompt(
    styleVector: any,
    personaData: any,
    memories: any[],
    anchors: any[],
    feedback: any[]
  ): Promise<string> {
    try {
      // Build memory context - FIXED: use 'text' instead of 'content'
      const memoryContext = memories.length > 0 ? 
        `RECENT MEMORIES (use as context):
${memories.map(m => `- ${m.text}`).join('\n')}` : '';

// Build style anchor context
const anchorContext = anchors.length > 0 ?
  `STYLE EXAMPLES (follow these patterns):
${anchors.map(a => `User: "${a.user_utterance}"\nIdeal Reply: "${a.ideal_reply}"`).join('\n\n')}` : '';

      // Build feedback context
      const feedbackContext = feedback.length > 0 ?
        `RECENT FEEDBACK PATTERNS (adjust accordingly):
${feedback.map(f => `- ${f.knob}: ${f.avg_delta > 0 ? 'increase' : 'decrease'} (${f.count} votes)`).join('\n')}` : '';

      // Generate enhanced prompt using OpenAI - FIXED: use global openai instance
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

      // COMMENTED OUT: OpenAI call - Now using Groq via llmClient
      // const response = await openai.chat.completions.create({
      //   model: 'gpt-4o-mini',
      //   messages: [
      //     { role: 'system', content: promptGenerationPrompt },
      //     { role: 'user', content: 'Generate the enhanced system prompt' }
      //   ],
      //   temperature: 0.3,
      //   max_tokens: 1000
      // });

      // NEW: Using Groq via llmClient
      const llmResponse = await llmClient.generateResponse([
        { role: 'system', content: promptGenerationPrompt },
        { role: 'user', content: 'Generate the enhanced system prompt' }
      ], {
        temperature: 0.3,
        maxTokens: 1000
      });

      return llmResponse.content || this.generateFallbackPrompt(styleVector, personaData);

    } catch (error) {
      logger.error('Error generating enhanced system prompt:', error);
      return this.generateFallbackPrompt(styleVector, personaData);
    }
  }

  /**
   * Generate fallback prompt if AI generation fails
   */
  private generateFallbackPrompt(styleVector: any, personaData: any): string {
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

  /**
   * Update system prompts for all twins that need it
   */
  async updateAllTwins(): Promise<void> {
    try {
      logger.info('Starting system prompt update for all twins');

      // Get twins that need system prompt updates
      const twinsResult = await db.query(`
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

      logger.info(`Found ${twinsResult.rows.length} twins to update`);

      for (const twin of twinsResult.rows) {
        await this.updateTwinSystemPrompt(twin.id);
        // Small delay to avoid overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      logger.info('System prompt update completed for all twins');

    } catch (error) {
      logger.error('Error updating all twins:', error);
    }
  }
}

export const systemPromptUpdater = new SystemPromptUpdater();