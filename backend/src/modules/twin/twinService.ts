import OpenAI from 'openai';
import { config } from '../../config/env';
import { logger } from '../../config/logger';
import { checkBlacklist, sanitizeText, validateSamplesLength } from '../../middleware/security';

const openai = new OpenAI({
  apiKey: config.openaiApiKey,
});

export interface StyleVector {
  tone: 'casual' | 'witty' | 'serious';
  emoji_usage: number; // 0-1
  hinglish_ratio: number; // 0-1
  sentence_length: 'short' | 'medium' | 'long';
  signature_patterns: string[];
}

export class TwinService {
  async extractStyle(samples: string): Promise<StyleVector> {
    try {
      // Validate and sanitize input
      if (!validateSamplesLength(samples)) {
        throw new Error('Samples must be between 100-3000 characters');
      }
      
      const sanitizedSamples = sanitizeText(samples);
      
      // Check blacklist
      if (checkBlacklist(sanitizedSamples)) {
        throw new Error('Content contains restricted material');
      }
      
      const systemPrompt = `You are a style extractor. Analyze the given text samples and output **JSON only** with these exact keys:
- tone: one of 'casual', 'witty', 'serious'
- emoji_usage: number between 0 and 1 (how often emojis are used)
- hinglish_ratio: number between 0 and 1 (mix of Hindi/English)
- sentence_length: one of 'short', 'medium', 'long'
- signature_patterns: array of 3-5 unique phrases or patterns from the text

Return only valid JSON, no other text.`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: sanitizedSamples }
        ],
        temperature: 0.3,
        max_tokens: 500,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      const styleVector = JSON.parse(content) as StyleVector;
      
      // Validate the response structure
      if (!this.validateStyleVector(styleVector)) {
        throw new Error('Invalid style vector format');
      }

      return styleVector;
    } catch (error) {
      logger.error('Style extraction error:', error);
      throw error;
    }
  }

  async generateSampleReply(styleVector: StyleVector): Promise<string> {
    try {
      const systemPrompt = `Imitate the user's style based on this style vector: ${JSON.stringify(styleVector)}. 
Reply in 1 line, casual, code-mixed Hinglish (~${styleVector.hinglish_ratio} ratio), light emojis if appropriate, safe topics only.
If the content would be unsafe or inappropriate, respond with: '[not allowed]'`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: 'Say hello in the user\'s style' }
        ],
        temperature: 0.7,
        max_tokens: 100,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      return content.trim();
    } catch (error) {
      logger.error('Sample reply generation error:', error);
      throw error;
    }
  }

  async generateDraft(styleVector: StyleVector, conversationHistory: string[]): Promise<string> {
    try {
      // Check conversation for blacklisted content
      const fullConversation = conversationHistory.join(' ');
      if (checkBlacklist(fullConversation)) {
        return '[not allowed]';
      }

      const systemPrompt = `Imitate user's style: ${JSON.stringify(styleVector)}. 
Reply in 1–2 short lines, casual, code-mixed Hinglish (~${styleVector.hinglish_ratio} ratio), light emojis if appropriate.
No politics, health, finance, or sensitive topics. If unsafe, say: '[not allowed]'`;

      const userPrompt = conversationHistory.slice(-4).join('\n'); // Last 4 messages

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.8,
        max_tokens: 150,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      return content.trim();
    } catch (error) {
      logger.error('Draft generation error:', error);
      throw error;
    }
  }

  private validateStyleVector(vector: any): vector is StyleVector {
    return (
      vector &&
      typeof vector.tone === 'string' && ['casual', 'witty', 'serious'].includes(vector.tone) &&
      typeof vector.emoji_usage === 'number' && vector.emoji_usage >= 0 && vector.emoji_usage <= 1 &&
      typeof vector.hinglish_ratio === 'number' && vector.hinglish_ratio >= 0 && vector.hinglish_ratio <= 1 &&
      typeof vector.sentence_length === 'string' && ['short', 'medium', 'long'].includes(vector.sentence_length) &&
      Array.isArray(vector.signature_patterns) && vector.signature_patterns.length >= 3
    );
  }
}
