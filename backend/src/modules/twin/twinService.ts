import OpenAI from 'openai';
import { config } from '../../config/env';
import { logger } from '../../config/logger';
import { checkBlacklist, sanitizeText, validateSamplesLength } from '../../middleware/security';

const openai = new OpenAI({
  apiKey: config.openaiApiKey,
});

export interface StyleVector {
  // Basic characteristics
  tone: 'casual' | 'witty' | 'serious' | 'friendly' | 'professional';
  emoji_usage: number; // 0-1
  hinglish_ratio: number; // 0-1
  sentence_length: 'short' | 'medium' | 'long';
  signature_patterns: string[];
  
  // Enhanced characteristics
  formality_level: number; // 0-1 (0=casual, 1=formal)
  humor_style: 'none' | 'light' | 'moderate' | 'heavy';
  question_frequency: number; // 0-1 (how often asks questions)
  exclamation_usage: number; // 0-1
  code_mixing_style: 'minimal' | 'moderate' | 'heavy';
  response_length_preference: 'brief' | 'detailed' | 'comprehensive';
  personality_traits: string[]; // ['helpful', 'curious', 'direct']
  communication_style: 'conversational' | 'informative' | 'questioning';
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
     // if (checkBlacklist(sanitizedSamples)) {
       // throw new Error('Content contains restricted material');
      //}
      
      const systemPrompt = `You are a comprehensive style extractor. Analyze the given text samples and output **JSON only** with these exact keys:

BASIC CHARACTERISTICS:
- tone: one of 'casual', 'witty', 'serious', 'friendly', 'professional'
- emoji_usage: number between 0 and 1 (how often emojis are used)
- hinglish_ratio: number between 0 and 1 (mix of Hindi/English)
- sentence_length: one of 'short', 'medium', 'long'
- signature_patterns: array of 3-5 unique phrases or patterns from the text

ENHANCED CHARACTERISTICS:
- formality_level: number between 0 and 1 (0=casual, 1=formal)
- humor_style: one of 'none', 'light', 'moderate', 'heavy'
- question_frequency: number between 0 and 1 (how often asks questions)
- exclamation_usage: number between 0 and 1 (use of exclamation marks)
- code_mixing_style: one of 'minimal', 'moderate', 'heavy'
- response_length_preference: one of 'brief', 'detailed', 'comprehensive'
- personality_traits: array of traits like ['helpful', 'curious', 'direct', 'analytical', 'creative']
- communication_style: one of 'conversational', 'informative', 'questioning'

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

      const systemPrompt = `You are this person's AI Twin. Match their style exactly:

STYLE CHARACTERISTICS:
- Tone: ${styleVector.tone}
- Formality: ${styleVector.formality_level} (0=casual, 1=formal)
- Humor: ${styleVector.humor_style}
- Communication: ${styleVector.communication_style}
- Response length: ${styleVector.response_length_preference}
- Code mixing: ${styleVector.code_mixing_style} (${styleVector.hinglish_ratio} ratio)
- Emoji usage: ${styleVector.emoji_usage}
- Personality: ${styleVector.personality_traits.join(', ')}
- Signature patterns: ${styleVector.signature_patterns.join(', ')}

CONSTRAINTS:
- 1–2 short lines only
- Match their exact communication style
- Use their signature patterns naturally
- No politics, health, finance, or sensitive topics
- If restricted, reply: "[not allowed]"
- Keep replies friendly and personalized`;

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
      // Basic characteristics validation
      typeof vector.tone === 'string' && ['casual', 'witty', 'serious', 'friendly', 'professional'].includes(vector.tone) &&
      typeof vector.emoji_usage === 'number' && vector.emoji_usage >= 0 && vector.emoji_usage <= 1 &&
      typeof vector.hinglish_ratio === 'number' && vector.hinglish_ratio >= 0 && vector.hinglish_ratio <= 1 &&
      typeof vector.sentence_length === 'string' && ['short', 'medium', 'long'].includes(vector.sentence_length) &&
      Array.isArray(vector.signature_patterns) && vector.signature_patterns.length >= 3 &&
      
      // Enhanced characteristics validation
      typeof vector.formality_level === 'number' && vector.formality_level >= 0 && vector.formality_level <= 1 &&
      typeof vector.humor_style === 'string' && ['none', 'light', 'moderate', 'heavy'].includes(vector.humor_style) &&
      typeof vector.question_frequency === 'number' && vector.question_frequency >= 0 && vector.question_frequency <= 1 &&
      typeof vector.exclamation_usage === 'number' && vector.exclamation_usage >= 0 && vector.exclamation_usage <= 1 &&
      typeof vector.code_mixing_style === 'string' && ['minimal', 'moderate', 'heavy'].includes(vector.code_mixing_style) &&
      typeof vector.response_length_preference === 'string' && ['brief', 'detailed', 'comprehensive'].includes(vector.response_length_preference) &&
      Array.isArray(vector.personality_traits) && vector.personality_traits.length >= 1 &&
      typeof vector.communication_style === 'string' && ['conversational', 'informative', 'questioning'].includes(vector.communication_style)
    );
  }
}
