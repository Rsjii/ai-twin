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
     // if (checkBlacklist(sanitizedSamples)) {
       // throw new Error('Content contains restricted material');
      //}
      
      const systemPrompt = `You are a comprehensive style extractor. Analyze the given text samples and output **JSON only** with these exact keys:

Basic characteristics:
- tone: one of 'casual', 'witty', 'serious', 'friendly', 'professional'
- emoji_usage: number between 0 and 1 (how often emojis are used)
- hinglish_ratio: number between 0 and 1 (mix of Hindi/English)
- sentence_length: one of 'short', 'medium', 'long'
- signature_patterns: array of 3-5 unique phrases or patterns from the text

Enhanced characteristics:
- formality_level: number between 0 and 1 (0=casual, 1=formal)
- humor_style: one of 'none', 'light', 'moderate', 'heavy'
- question_frequency: number between 0 and 1 (how often asks questions)
- exclamation_usage: number between 0 and 1 (how often uses exclamations)
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
        logger.warn('Style vector validation failed, using fallback:', styleVector);
        // Return a default style vector if validation fails
        return this.getDefaultStyleVector();
      }

      return styleVector;
    } catch (error) {
      logger.error('Style extraction error:', error);
      // If there's an error, return default style vector instead of throwing
      logger.warn('Using default style vector due to error');
      return this.getDefaultStyleVector();
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

  async updateStyleVector(currentVector: StyleVector, newConversations: string[]): Promise<StyleVector> {
    try {
      if (!newConversations || newConversations.length === 0) {
        return currentVector;
      }

      const combinedNewText = newConversations.join('\n---\n');
      
      const systemPrompt = `You are a style vector updater. Given the current style vector and new conversation data, update the style characteristics to reflect the user's evolving communication patterns.

Current style vector: ${JSON.stringify(currentVector)}

New conversation data: ${combinedNewText}

Update the style vector by analyzing the new conversations and adjusting the characteristics accordingly. Return the updated JSON with the same structure as the current vector.

Focus on:
- Tone shifts (casual to professional, etc.)
- Emoji usage patterns
- Hinglish ratio changes
- Sentence length preferences
- New signature patterns
- Formality level adjustments
- Humor style evolution
- Question frequency changes
- Personality trait development
- Communication style shifts

Return only valid JSON, no other text.`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Update the style vector based on new conversations: ${combinedNewText}` }
        ],
        temperature: 0.3,
        max_tokens: 800,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      const updatedVector = JSON.parse(content) as StyleVector;
      
      // Validate the updated vector
      if (!this.validateStyleVector(updatedVector)) {
        logger.warn('Invalid updated style vector, returning current vector');
        return currentVector;
      }

      return updatedVector;
    } catch (error) {
      logger.error('Style vector update error:', error);
      // Return current vector if update fails
      return currentVector;
    }
  }

  async generateDraftWithContext(context: {
    styleVector: StyleVector;
    chatMemory: Array<{content: string, sender: string, timestamp: Date}>;
    currentMessages: string[];
  }): Promise<string> {
    try {
      const { styleVector, chatMemory, currentMessages } = context;
      
      logger.info('TwinService generateDraftWithContext called with:', {
        styleVectorKeys: Object.keys(styleVector),
        chatMemoryLength: chatMemory.length,
        currentMessagesLength: currentMessages.length,
        styleVector: JSON.stringify(styleVector, null, 2),
        currentMessages: currentMessages
      });
      
      // Validate inputs
      if (!styleVector || !currentMessages || currentMessages.length === 0) {
        logger.error('Invalid context provided:', { styleVector, currentMessages });
        throw new Error('Invalid context provided');
      }
      
      // Create system prompt similar to twin creation
      const systemPrompt = `You are an AI twin that mimics the user's communication style. 

User's style:
- Tone: ${styleVector.tone || 'casual'}
- Communication: ${styleVector.communication_style || 'conversational'}

Previous conversation:
${chatMemory.map(msg => `${msg.sender}: ${msg.content}`).join('\n')}

Respond as the user's AI twin. Keep it natural and conversational. Return only the response, no other text.`;

      logger.info('System prompt created, calling OpenAI...');
      logger.info('System prompt length:', systemPrompt.length);
      logger.info('User message:', currentMessages.join('\n'));
      logger.info('OpenAI API Key present:', !!config.openaiApiKey);
      
      // Add timeout and better error handling
      const response = await Promise.race([
        openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: currentMessages.join('\n') }
          ],
          max_tokens: 500,
          temperature: 0.7
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('OpenAI API timeout')), 30000)
        )
      ]) as any;

      logger.info('OpenAI response object:', {
        choices: response.choices?.length,
        usage: response.usage
      });

      const result = response.choices[0]?.message?.content;
      logger.info('OpenAI response received:', result?.substring(0, 100));
      
      if (!result || result.trim().length === 0) {
        logger.error('Empty response from OpenAI');
        return 'Sorry, I couldn\'t generate a response.';
      }
      
      return result;
    } catch (error) {
      logger.error('Generate draft with context error:', error);
      logger.error('Error details:', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        context: {
          styleVector: context.styleVector,
          chatMemoryLength: context.chatMemory?.length,
          currentMessages: context.currentMessages
        }
      });
      
      // Return a fallback response instead of throwing
      logger.error('OpenAI API failed, using fallback response');
      return this.generateFallbackResponse(currentMessages[0]);
    }
  }

  private generateFallbackResponse(userMessage: string): string {
    const responses = [
      "Hey! That's interesting. Tell me more about it!",
      "I see what you mean. What do you think about that?",
      "That's a good point! I'm curious to hear more.",
      "Interesting! I'd love to know more about your thoughts on this.",
      "That sounds cool! Can you elaborate on that?",
      "I'm following you! What's your take on this?",
      "That's fascinating! I'd like to understand better.",
      "Good question! What made you think of that?",
      "I hear you! That's definitely worth discussing.",
      "That's interesting! I'm curious about your perspective."
    ];
    
    // Simple keyword-based responses
    const message = userMessage.toLowerCase();
    if (message.includes('hello') || message.includes('hi') || message.includes('hey')) {
      return "Hey there! How's it going?";
    }
    if (message.includes('how are you') || message.includes('how are you doing')) {
      return "I'm doing great! Thanks for asking. How about you?";
    }
    if (message.includes('what') && message.includes('doing')) {
      return "Just chatting with you! What about you? What's keeping you busy?";
    }
    if (message.includes('?')) {
      return "That's a great question! I'm thinking about it. What's your take on this?";
    }
    
    // Random response
    return responses[Math.floor(Math.random() * responses.length)];
  }

  private getDefaultStyleVector(): StyleVector {
    return {
      tone: 'casual',
      emoji_usage: 0.3,
      hinglish_ratio: 0.2,
      sentence_length: 'medium',
      signature_patterns: ['Hey!', 'What do you think?', 'Let me know'],
      formality_level: 0.5,
      humor_style: 'light',
      question_frequency: 0.4,
      exclamation_usage: 0.3,
      code_mixing_style: 'minimal',
      response_length_preference: 'detailed',
      personality_traits: ['helpful', 'curious'],
      communication_style: 'conversational'
    };
  }

  private validateStyleVector(vector: any): vector is StyleVector {
    return (
      vector &&
      typeof vector.tone === 'string' && ['casual', 'witty', 'serious', 'friendly', 'professional'].includes(vector.tone) &&
      typeof vector.emoji_usage === 'number' && vector.emoji_usage >= 0 && vector.emoji_usage <= 1 &&
      typeof vector.hinglish_ratio === 'number' && vector.hinglish_ratio >= 0 && vector.hinglish_ratio <= 1 &&
      typeof vector.sentence_length === 'string' && ['short', 'medium', 'long'].includes(vector.sentence_length) &&
      Array.isArray(vector.signature_patterns) && vector.signature_patterns.length >= 3 &&
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
