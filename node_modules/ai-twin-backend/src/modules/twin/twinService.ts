import OpenAI from 'openai';
import { config } from '../../config/env';
import { logger } from '../../config/logger';
import { checkBlacklist, sanitizeText, validateSamplesLength } from '../../middleware/security';

const openai = new OpenAI({
  apiKey: config.openaiApiKey,
});

export interface StyleVector {
  tone: 'casual' | 'witty' | 'serious' | 'friendly' | 'professional';
  emoji_usage: number; // 0-1
  hinglish_ratio: number; // 0-1
  sentence_length: 'short' | 'medium' | 'long';
  signature_patterns: string[];
  formality_level?: number; // 0-1
  humor_style?: 'none' | 'light' | 'moderate' | 'heavy';
  question_frequency?: number; // 0-1
  exclamation_usage?: number; // 0-1
  code_mixing_style?: 'minimal' | 'moderate' | 'heavy';
  response_length_preference?: 'brief' | 'detailed' | 'comprehensive';
  personality_traits?: string[];
  communication_style?: 'conversational' | 'informative' | 'questioning';
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
    personaData?: any;
    systemPrompt?: string;
    tokenLimit?: number;
    chatVector?: any; // Compressed chat history
    chatMemory: Array<{content: string, sender: string, timestamp: Date}>;
    currentMessages: string[];
  }): Promise<string> {
    try {
      const { styleVector, personaData, systemPrompt, tokenLimit, chatVector, chatMemory, currentMessages } = context;
      
      logger.info('TwinService generateDraftWithContext called with:', {
        styleVectorKeys: Object.keys(styleVector),
        hasPersonaData: !!personaData,
        hasSystemPrompt: !!systemPrompt,
        chatMemoryLength: chatMemory.length,
        currentMessagesLength: currentMessages.length,
        styleVector: JSON.stringify(styleVector, null, 2),
        personaData: JSON.stringify(personaData, null, 2),
        currentMessages: currentMessages
      });
      
      // Validate inputs
      if (!styleVector || !currentMessages || currentMessages.length === 0) {
        logger.error('Invalid context provided:', { styleVector, currentMessages });
        throw new Error('Invalid context provided');
      }
      
      // Use enhanced persona-based response if available
      if (personaData && systemPrompt) {
        logger.info('Using enhanced persona-based response');
        return await this.generatePersonaResponse(
          currentMessages.join('\n'),
          personaData,
          systemPrompt,
          chatMemory,
          tokenLimit || 500
        );
      }
      
      // If no persona data, still use styleVector with proper context
      logger.info('Using styleVector-based response with enhanced context');
      
      // Create comprehensive system prompt with ALL available data
      const userName = personaData?.basicInfo?.fullName || personaData?.name || 'the user';
      const userBio = personaData?.basicInfo?.bio || '';
      const userPersonality = personaData?.personality ? 
        `Personality: ${JSON.stringify(personaData.personality)}` : '';
      
      // Build comprehensive style information
      const styleInfo = `
COMMUNICATION STYLE (CRITICAL - USE THIS):
- Tone: ${styleVector.tone || 'casual'}
- Communication Style: ${styleVector.communication_style || 'conversational'}
- Emoji Usage: ${styleVector.emoji_usage || 0.3} (0=none, 1=heavy)
- Hinglish Ratio: ${styleVector.hinglish_ratio || 0.2} (0=English only, 1=mostly Hindi)
- Sentence Length: ${styleVector.sentence_length || 'medium'}
- Formality Level: ${styleVector.formality_level || 0.5} (0=casual, 1=formal)
- Humor Style: ${styleVector.humor_style || 'light'}
- Question Frequency: ${styleVector.question_frequency || 0.4}
- Exclamation Usage: ${styleVector.exclamation_usage || 0.3}
- Code Mixing: ${styleVector.code_mixing_style || 'minimal'}
- Response Length: ${styleVector.response_length_preference || 'detailed'}
- Signature Patterns: ${styleVector.signature_patterns?.join(', ') || 'none'}
- Personality Traits: ${styleVector.personality_traits?.join(', ') || 'helpful, curious'}
`;

      // Build chat history context with chatVector
      const chatContext = chatVector ? 
        `CHAT CONTEXT (COMPRESSED HISTORY):
Summary: ${chatVector.summary || 'No summary available'}
Topics Discussed: ${chatVector.topics?.join(', ') || 'None'}
Key Points: ${chatVector.keyPoints?.join(', ') || 'None'}
User Preferences: ${JSON.stringify(chatVector.userPreferences || {})}
Conversation Tone: ${chatVector.conversationTone || 'neutral'}
User Personality: ${JSON.stringify(chatVector.userPersonality || {})}
Important Context: ${chatVector.context || 'None'}

RECENT MESSAGES:
${chatMemory.map(msg => `${msg.sender === 'human' ? 'User' : 'AI'}: ${msg.content}`).join('\n')}` : 
        chatMemory.length > 0 ? 
        `CHAT HISTORY (IMPORTANT - REFERENCE THIS):
${chatMemory.map(msg => `${msg.sender === 'human' ? 'User' : 'AI'}: ${msg.content}`).join('\n')}` : 
        'CHAT HISTORY: This is the start of our conversation.';
      
      const enhancedSystemPrompt = `You are an AI twin representing ${userName}. You MUST respond as if you are this person, using their exact communication style.

${userBio ? `ABOUT ${userName.toUpperCase()}: ${userBio}` : ''}
${userPersonality}

${styleInfo}

${chatContext}

CURRENT USER MESSAGE: "${currentMessages.join(' ')}"

CRITICAL INSTRUCTIONS:
1. You ARE ${userName} - respond as them, not as an AI assistant
2. Use the EXACT communication style defined above
3. Reference the chat history to maintain context
4. If asked "what is my name" or "who am i", respond with "${userName}"
5. Be authentic to the personality and style defined above
6. Use appropriate emoji usage (${styleVector.emoji_usage || 0.3})
7. Mix Hindi/English as specified (${styleVector.hinglish_ratio || 0.2})
8. Use signature patterns: ${styleVector.signature_patterns?.join(', ') || 'none'}

RESPOND AS ${userName.toUpperCase()} - NO GENERIC RESPONSES ALLOWED!`;

      logger.info('Enhanced system prompt created, calling OpenAI...');
      logger.info('System prompt length:', enhancedSystemPrompt.length);
      logger.info('User message:', currentMessages.join('\n'));
      logger.info('OpenAI API Key present:', !!config.openaiApiKey);
      
      // Add timeout and better error handling
      const response = await Promise.race([
        openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: enhancedSystemPrompt },
            { role: 'user', content: currentMessages.join('\n') }
          ],
          max_tokens: tokenLimit || 500,
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
          currentMessages: context.currentMessages || []
        }
      });
      
      // Return a fallback response instead of throwing
      logger.error('OpenAI API failed, using fallback response');
      return this.generateFallbackResponse(context.currentMessages?.[0] || 'Hello', context.personaData || {});
    }
  }


  // Enhanced method to generate AI response using persona data
  async generatePersonaResponse(
    userMessage: string, 
    personaData: any, 
    systemPrompt: string, 
    chatHistory: any[] = [],
    tokenLimit: number = 500
  ): Promise<string> {
    try {
      // Build context from chat history
      const chatContext = chatHistory
        .slice(-10) // Last 10 messages for context
        .map(msg => `${msg.sender === 'human' ? 'User' : 'AI'}: ${msg.content}`)
        .join('\n');

      // Create the full prompt with explicit instructions
      const userName = personaData.basicInfo?.fullName || personaData.name || 'the user';
      const fullPrompt = `${systemPrompt}

CHAT HISTORY:
${chatContext}

USER MESSAGE: "${userMessage}"

CRITICAL INSTRUCTIONS:
- You ARE ${userName} - respond as them, not as an AI assistant
- You know the user's name is ${userName}
- Use your personality traits and communication style EXACTLY as defined
- Keep response under ${tokenLimit} tokens
- Be authentic to your persona - NO GENERIC RESPONSES
- Reference your interests and background when relevant
- If asked "what is my name" or "who am i", respond with "${userName}"
- Always remember who you are representing
- Use the communication style from your persona data

RESPOND AS ${userName.toUpperCase()} - NO GENERIC RESPONSES ALLOWED!`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: fullPrompt
          }
        ],
        max_tokens: tokenLimit,
        temperature: 0.7,
      });

      const response = completion.choices[0]?.message?.content?.trim() || '';
      
      if (!response) {
        throw new Error('No response generated');
      }

      return response;
    } catch (error) {
      logger.error('Error generating persona response:', error);
      logger.error('Persona data available:', !!personaData);
      logger.error('User message:', userMessage);
      
      // Try to provide a personalized fallback response
      const userName = personaData?.basicInfo?.fullName || personaData?.name || 'there';
      if (userMessage.toLowerCase().includes('what is my name') || userMessage.toLowerCase().includes('who am i')) {
        return `Your name is ${userName}! I know you well.`;
      }
      
      return this.generateFallbackResponse(userMessage, personaData);
    }
  }

  // Fallback response generator using persona data
  private generateFallbackResponse(userMessage: string, personaData: any): string {
    const name = personaData?.basicInfo?.fullName || personaData?.name || 'there';
    const personality = personaData?.personality || {};
    const tone = personaData?.tone || {};
    
    // Use personality traits to generate appropriate responses
    const isExtraverted = personality.ocean?.extraversion > 3;
    const isHumorous = personality.communicationStyle?.humor > 3;
    const isFormal = tone.sliders?.formalCasual > 50;
    
    const message = userMessage.toLowerCase();
    
    if (message.includes('hello') || message.includes('hi') || message.includes('hey')) {
      if (isFormal) {
        return `Hello ${name}! It's a pleasure to meet you. How may I assist you today?`;
      } else if (isExtraverted) {
        return `Hey ${name}! Great to meet you! What's going on?`;
      } else {
        return `Hi ${name}! How are you doing?`;
      }
    }
    
    if (message.includes('how are you')) {
      if (isHumorous) {
        return `I'm doing fantastic! Life's treating me well. How about you? What's the latest?`;
      } else if (isFormal) {
        return `I'm doing well, thank you for asking. I hope you're having a good day as well.`;
      } else {
        return `I'm doing great! Thanks for asking. How are you doing?`;
      }
    }
    
    if (message.includes('what is my name') || message.includes('who am i') || message.includes('my name')) {
      if (name && name !== 'there') {
        return `Your name is ${name}! I know you well.`;
      } else {
        return `I should know your name, but I'm having trouble accessing that information right now. Can you remind me?`;
      }
    }
    
    // Default responses based on personality
    const responses = isFormal ? [
      "That's an interesting point. I'd like to hear more about your perspective on this.",
      "I appreciate you sharing that with me. What are your thoughts on this matter?",
      "That's quite thoughtful. I'm curious about your experience with this."
    ] : isExtraverted ? [
      "That's awesome! Tell me more about that!",
      "Wow, that sounds really cool! I'd love to hear more!",
      "That's fascinating! What else can you tell me about it?"
    ] : [
      "That's interesting. I'd like to understand more about that.",
      "Thanks for sharing that. What's your take on this?",
      "That's a good point. I'm curious to hear more."
    ];
    
    return responses[Math.floor(Math.random() * responses.length)] || "That's interesting! Tell me more about that.";
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

  // Generate compressed chatVector from chat history
  async generateChatVector(chatHistory: Array<{content: string, sender: string, timestamp: Date}>): Promise<any> {
    try {
      if (!chatHistory || chatHistory.length === 0) {
        return {
          summary: 'New conversation started',
          topics: [],
          keyPoints: [],
          userPreferences: {},
          conversationTone: 'neutral'
        };
      }

      const conversationText = chatHistory
        .map(msg => `${msg.sender}: ${msg.content}`)
        .join('\n');

      const systemPrompt = `Analyze this conversation and create a compressed chatVector (JSON only) with:

1. summary: Brief 1-2 sentence summary of what was discussed
2. topics: Array of main topics discussed (max 5)
3. keyPoints: Array of important points or decisions made (max 5)
4. userPreferences: Object with user's expressed preferences, interests, likes/dislikes
5. conversationTone: Overall tone of conversation (casual, formal, friendly, etc.)
6. userPersonality: Any personality traits observed from user's messages
7. context: Important context that should be remembered for future messages

Conversation:
${conversationText}

Return only valid JSON, no other text.`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: 'Create chatVector for this conversation' }
        ],
        temperature: 0.3,
        max_tokens: 800,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      return JSON.parse(content);
    } catch (error) {
      logger.error('Chat vector generation error:', error);
      return {
        summary: 'Conversation context available',
        topics: [],
        keyPoints: [],
        userPreferences: {},
        conversationTone: 'neutral'
      };
    }
  }

  // Update existing chatVector with new messages
  async updateChatVector(currentChatVector: any, newMessages: Array<{content: string, sender: string, timestamp: Date}>): Promise<any> {
    try {
      if (!newMessages || newMessages.length === 0) {
        return currentChatVector;
      }

      const newConversationText = newMessages
        .map(msg => `${msg.sender}: ${msg.content}`)
        .join('\n');

      const systemPrompt = `Update this existing chatVector with new conversation data. Return the updated JSON.

Current chatVector: ${JSON.stringify(currentChatVector)}

New conversation:
${newConversationText}

Update the chatVector by:
1. Merging new topics with existing ones
2. Adding new key points
3. Updating user preferences based on new information
4. Adjusting conversation tone if changed
5. Adding new personality observations
6. Updating context with new important information

Return only valid JSON with the same structure, no other text.`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: 'Update chatVector with new conversation' }
        ],
        temperature: 0.3,
        max_tokens: 1000,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      return JSON.parse(content);
    } catch (error) {
      logger.error('Chat vector update error:', error);
      return currentChatVector;
    }
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
