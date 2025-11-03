import { memoryService } from './memoryService';
import { logger } from '../config/logger';

export interface PromptContext {
  twinId?: string;
  chatId?: string;
  personaData?: any;
  styleVector: any;
  chatVector?: any;
  chatMemory: Array<{content: string, sender: string, timestamp: Date}>;
  currentMessages: string[];
  sessionMemory?: {
    summary: string;
    keyTopics: string[];
  } | null;
  tokenLimit?: number;
}

export interface StylePattern {
  type: string;
  phrase?: string;
  userUtterance?: string;
  idealReply?: string;
  patternType?: string;
  context?: string;
}

/**
 * PromptBuilder - Modular prompt construction service
 * Extracts prompt building logic from twinService for reusability and maintainability
 */
export class PromptBuilder {
  /**
   * Build complete system prompt with all contexts
   */
  async buildSystemPrompt(context: PromptContext): Promise<string> {
    const {
      twinId,
      chatId,
      personaData,
      styleVector,
      chatVector,
      chatMemory,
      currentMessages,
      sessionMemory: providedSessionMemory,
      tokenLimit = 500
    } = context;

    try {
      // 1. Retrieve all memory contexts in parallel
      // If sessionMemory not provided but chatId is, retrieve it
      const sessionMemoryPromise = providedSessionMemory 
        ? Promise.resolve(providedSessionMemory)
        : this.getSessionMemory(chatId);
      
      const [sessionMemory, longTermMemories, stylePatterns] = await Promise.all([
        sessionMemoryPromise,
        this.getLongTermMemories(twinId, currentMessages.join(' ')),
        this.getStylePatterns(twinId, currentMessages.join(' '))
      ]);

      // 2. Build individual context sections
      const personaSection = this.buildPersonaSection(personaData);
      const styleSection = this.buildStyleSection(styleVector);
      const styleAnchorSection = this.buildStyleAnchorSection(stylePatterns);
      const longTermMemorySection = this.buildLongTermMemorySection(longTermMemories);
      const sessionMemorySection = this.buildSessionMemorySection(sessionMemory);
      const chatContextSection = this.buildChatContextSection(chatVector, chatMemory);
      const instructionsSection = this.buildInstructionsSection(personaData, styleVector, tokenLimit);

      // 3. Assemble final prompt
      return this.assemblePrompt(
        personaSection,
        styleSection,
        styleAnchorSection,
        longTermMemorySection,
        sessionMemorySection,
        chatContextSection,
        instructionsSection,
        currentMessages.join(' '),
        personaData
      );
    } catch (error) {
      logger.error('Error building system prompt:', error);
      // Return basic fallback prompt
      return this.buildFallbackPrompt(personaData, styleVector, currentMessages.join(' '));
    }
  }

  /**
   * Retrieve session memory (if chatId provided)
   */
  private async getSessionMemory(chatId?: string): Promise<{summary: string; keyTopics: string[]} | null> {
    if (!chatId) return null;
    try {
      return await memoryService.getSessionMemory(chatId);
    } catch (error) {
      logger.warn('Failed to retrieve session memory:', error);
      return null;
    }
  }

  /**
   * Retrieve long-term memories (smart hybrid approach)
   */
  private async getLongTermMemories(
    twinId?: string, 
    userQuery?: string
  ): Promise<Array<{key: string, value: string, category: string}>> {
    if (!twinId) return [];
    
    try {
      if (userQuery && userQuery.trim().length > 0) {
        // Use smart hybrid retrieval
        return await memoryService.getRelevantLongTermMemories(twinId, userQuery, 10);
      } else {
        // Get common memories only
        return await memoryService.getLongTermMemories(twinId, undefined, 5);
      }
    } catch (error) {
      logger.warn('Failed to retrieve long-term memories:', error);
      // Fallback: Get at least common memories
      try {
        return await memoryService.getLongTermMemories(twinId, undefined, 5);
      } catch (e) {
        logger.error('Fallback long-term memory retrieval failed:', e);
        return [];
      }
    }
  }

  /**
   * Retrieve style patterns (interactions + phrases)
   */
  private async getStylePatterns(
    twinId?: string,
    userQuery?: string
  ): Promise<StylePattern[]> {
    if (!twinId || !userQuery || userQuery.trim().length === 0) return [];
    
    try {
      return await memoryService.getRelevantStylePatterns(twinId, userQuery, 3);
    } catch (error) {
      logger.warn('Failed to retrieve style patterns:', error);
      return [];
    }
  }

  /**
   * Build persona section (bio, personality)
   */
  private buildPersonaSection(personaData?: any): string {
    if (!personaData) return '';
    
    const userName = personaData.basicInfo?.fullName || personaData.name || 'the user';
    const userBio = personaData.basicInfo?.bio || '';
    const userPersonality = personaData.personality ? 
      `Personality: ${JSON.stringify(personaData.personality)}` : '';
    
    let section = '';
    if (userBio) {
      section += `ABOUT ${userName.toUpperCase()}: ${userBio}\n`;
    }
    if (userPersonality) {
      section += `${userPersonality}\n`;
    }
    
    return section;
  }

  /**
   * Build style section (communication style parameters)
   */
  private buildStyleSection(styleVector: any): string {
    if (!styleVector) return '';
    
    return `
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
  }

  /**
   * Build style anchor section (behavioral patterns)
   */
  private buildStyleAnchorSection(stylePatterns: StylePattern[]): string {
    if (!stylePatterns || stylePatterns.length === 0) return '';
    
    const patterns = stylePatterns
      .map((pattern, index) => {
        if (pattern.type === 'interaction' && pattern.userUtterance && pattern.idealReply) {
          return `Example ${index + 1}:
User says: "${pattern.userUtterance}"
You respond: "${pattern.idealReply}"`;
        } else if (pattern.type === 'phrase' && pattern.phrase) {
          return `Signature phrase ${index + 1}: "${pattern.phrase}"${pattern.context ? ` (use when: ${pattern.context})` : ''}`;
        }
        return '';
      })
      .filter(Boolean)
      .join('\n\n');
    
    if (!patterns) return '';
    
    return `
## STYLE PATTERNS (HOW TO RESPOND - FOLLOW THESE):
${patterns}

CRITICAL: When user's message is similar to examples above, match that response style. Use signature phrases naturally (not forced).
`;
  }

  /**
   * Build long-term memory section (permanent facts)
   */
  private buildLongTermMemorySection(
    longTermMemories: Array<{key: string, value: string, category: string}>
  ): string {
    if (!longTermMemories || longTermMemories.length === 0) return '';
    
    const memories = longTermMemories
      .map((mem, index) => {
        let prefix = '';
        if (mem.category === 'preference') {
          prefix = 'Preference: ';
        } else if (mem.category === 'fact') {
          prefix = 'Fact: ';
        } else if (mem.category === 'relationship') {
          prefix = 'Relationship: ';
        } else if (mem.category === 'interest') {
          prefix = 'Interest: ';
        } else {
          prefix = `${mem.key}: `;
        }
        
        return `${index + 1}. ${prefix}${mem.value}`;
      })
      .join('\n');
    
    return `
## LONG-TERM MEMORIES (PERMANENT FACTS - ALWAYS REMEMBER):
These are important facts about the user that persist across ALL conversations:

${memories}

CRITICAL: Reference these memories naturally when relevant. Don't repeat them unless asked. Use them to maintain consistency across all conversations. These are permanent facts that don't change.
`;
  }

  /**
   * Build session memory section (chat summary)
   */
  private buildSessionMemorySection(
    sessionMemory?: {summary: string; keyTopics: string[]} | null
  ): string {
    if (!sessionMemory?.summary) return '';
    
    const topicsSection = sessionMemory.keyTopics?.length > 0 
      ? `## KEY TOPICS DISCUSSED:\n${sessionMemory.keyTopics.join(', ')}\n` 
      : '';
    
    return `
## PREVIOUS CONVERSATION SUMMARY:
${sessionMemory.summary}

${topicsSection}
Use this summary to maintain continuity and reference previous discussions naturally.
`;
  }

  /**
   * Build chat context section (chatVector or chat history)
   */
  private buildChatContextSection(
    chatVector?: any,
    chatMemory?: Array<{content: string, sender: string, timestamp: Date}>
  ): string {
    if (chatVector) {
      const recentMessages = chatMemory 
        ? chatMemory.map(msg => `${msg.sender === 'human' ? 'User' : 'AI'}: ${msg.content}`).join('\n')
        : '';
      
      return `CHAT CONTEXT (COMPRESSED HISTORY):
Summary: ${chatVector.summary || 'No summary available'}
Topics Discussed: ${chatVector.topics?.join(', ') || 'None'}
Key Points: ${chatVector.keyPoints?.join(', ') || 'None'}
User Preferences: ${JSON.stringify(chatVector.userPreferences || {})}
Conversation Tone: ${chatVector.conversationTone || 'neutral'}
User Personality: ${JSON.stringify(chatVector.userPersonality || {})}
Important Context: ${chatVector.context || 'None'}

RECENT MESSAGES:
${recentMessages}`;
    } else if (chatMemory && chatMemory.length > 0) {
      return `CHAT HISTORY (IMPORTANT - REFERENCE THIS):
${chatMemory.map(msg => `${msg.sender === 'human' ? 'User' : 'AI'}: ${msg.content}`).join('\n')}`;
    } else {
      return 'CHAT HISTORY: This is the start of our conversation.';
    }
  }

  /**
   * Build instructions section
   */
  private buildInstructionsSection(
    personaData?: any,
    styleVector?: any,
    tokenLimit: number = 500
  ): string {
    const userName = personaData?.basicInfo?.fullName || personaData?.name || 'the user';
    
    return `CRITICAL INSTRUCTIONS:
1. You ARE ${userName} - respond as them, not as an AI assistant
2. Use the EXACT communication style defined above
3. Reference the chat history to maintain context
4. If asked "what is my name" or "who am i", respond with "${userName}"
5. Be authentic to the personality and style defined above
6. Use appropriate emoji usage (${styleVector?.emoji_usage || 0.3})
7. Mix Hindi/English as specified (${styleVector?.hinglish_ratio || 0.2})
8. Use signature patterns: ${styleVector?.signature_patterns?.join(', ') || 'none'}

RESPOND AS ${userName.toUpperCase()} - NO GENERIC RESPONSES ALLOWED!`;
  }

  /**
   * Assemble final prompt from all sections
   */
  private assemblePrompt(
    personaSection: string,
    styleSection: string,
    styleAnchorSection: string,
    longTermMemorySection: string,
    sessionMemorySection: string,
    chatContextSection: string,
    instructionsSection: string,
    userMessage: string,
    personaData?: any
  ): string {
    const userName = personaData?.basicInfo?.fullName || personaData?.name || 'the user';
    
    return `You are an AI twin representing ${userName}. You MUST respond as if you are this person, using their exact communication style.

${personaSection}

${styleSection}

${styleAnchorSection}

${longTermMemorySection}

${sessionMemorySection}

${chatContextSection}

CURRENT USER MESSAGE: "${userMessage}"

${instructionsSection}`;
  }

  /**
   * Build fallback prompt if main builder fails
   */
  private buildFallbackPrompt(
    personaData?: any,
    styleVector?: any,
    userMessage: string = ''
  ): string {
    const userName = personaData?.basicInfo?.fullName || personaData?.name || 'the user';
    
    return `You are an AI twin representing ${userName}. Respond naturally and authentically.

${userMessage ? `USER MESSAGE: "${userMessage}"` : ''}

Respond as ${userName}, maintaining their personality and communication style.`;
  }

  /**
   * Build prompt for persona response (used in generatePersonaResponse)
   */
  buildPersonaPrompt(
    systemPrompt: string,
    personaData: any,
    chatHistory: any[],
    sessionMemory?: {summary: string; keyTopics: string[]} | null,
    longTermMemories?: Array<{key: string, value: string, category: string}>,
    stylePatterns?: StylePattern[],
    tokenLimit: number = 500,
    userMessage?: string
  ): string {
    const userName = personaData?.basicInfo?.fullName || personaData.name || 'the user';
    
    // Build chat context
    const chatContext = chatHistory
      .slice(-10)
      .map(msg => `${msg.sender === 'human' ? 'User' : 'AI'}: ${msg.content}`)
      .join('\n');
    
    // Get user message from parameter or chat history
    const finalUserMessage = userMessage || chatHistory[chatHistory.length - 1]?.content || '';
    
    // Build sections
    const longTermMemorySection = this.buildLongTermMemorySection(longTermMemories || []);
    const styleAnchorSection = this.buildStyleAnchorSection(stylePatterns || []);
    const sessionMemorySection = this.buildSessionMemorySection(sessionMemory || null);
    
    return `${systemPrompt}

${styleAnchorSection}

${longTermMemorySection}

${sessionMemorySection}

CHAT HISTORY:
${chatContext}

USER MESSAGE: "${finalUserMessage}"

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
  }
}

export const promptBuilder = new PromptBuilder();

