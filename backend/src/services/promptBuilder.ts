import { memoryService } from './memoryService';
import { logger } from '../config/logger';
import { encoding_for_model } from 'tiktoken';  
import { db } from '../config/database';

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
  memoryVisibility?: 'none' | 'owner' | 'public_twin' | 'all';
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
   * Count tokens in text using tiktoken
   */
  private countTokens(text: string): number {
    try {
      // Use gpt-4o-mini encoding (closest to what we're using)
      const enc = encoding_for_model('gpt-4o-mini');
      return enc.encode(text).length;
    } catch (error) {
      // Fallback: rough estimate (4 chars ≈ 1 token)
      logger.warn('Token counting failed, using char estimate:', error);
      return Math.ceil(text.length / 4);
    }
  }

  /**
   * Truncate text to fit within token budget
   */
  private truncateToTokenBudget(text: string, maxTokens: number): string {
    const tokens = this.countTokens(text);
    if (tokens <= maxTokens) return text;
    
    // Binary search for optimal truncation point
    let left = 0;
    let right = text.length;
    let bestFit = '';
    
    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      const testText = text.substring(0, mid);
      const testTokens = this.countTokens(testText);
      
      if (testTokens <= maxTokens) {
        bestFit = testText;
        left = mid + 1;
      } else {
        right = mid;
      }
    }
    
    return bestFit || text.substring(0, Math.floor(text.length * 0.8));
  }

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
      // Token budget calculation
      // gpt-4o-mini context window: 128k tokens
      // Reserve 90% for system prompt, 10% for response
      const MAX_PROMPT_TOKENS = 115000; // Safe limit (90% of 128k)
      const responseTokenReserve = tokenLimit;
      const tokenBudget = MAX_PROMPT_TOKENS - responseTokenReserve - 500; // 500 token buffer
      
      logger.info('Token budget:', { 
        maxPromptTokens: MAX_PROMPT_TOKENS, 
        responseReserve: responseTokenReserve,
        availableBudget: tokenBudget 
      });
      console.log('[PROMPT_BUILDER] [HYP-I] Token budget calculation:', {
        maxPromptTokens: MAX_PROMPT_TOKENS,
        responseReserve: responseTokenReserve,
        availableBudget: tokenBudget
      });

      // ✅ Check if memory is enabled before loading long-term memories
      // Use personaData.settings from context (single source of truth - no duplicate storage)
      const memoryEnabled = personaData?.settings?.memory?.enabled !== false; // Default true
      
      // ✅ Determine memory visibility from context
      const memoryVisibility = context.memoryVisibility || 'owner'; // Default to 'owner' for private chat
      const effectiveVisibility = memoryEnabled && memoryVisibility !== 'none' 
        ? memoryVisibility 
        : 'none';

      // OPTIMIZED: Retrieve all memory contexts in parallel (including feedback)
      const sessionMemoryPromise = providedSessionMemory 
        ? Promise.resolve(providedSessionMemory)
        : this.getSessionMemory(chatId);
      
      const [sessionMemory, longTermMemories, stylePatterns, feedbackContext] = await Promise.all([
        sessionMemoryPromise,
        memoryEnabled && effectiveVisibility !== 'none' 
          ? this.getLongTermMemories(twinId, currentMessages.join(' '), effectiveVisibility) 
          : Promise.resolve([]), // ✅ PASS visibility
        this.getStylePatterns(twinId, currentMessages.join(' ')),
        this.getFeedbackContext(twinId) // ✅ Now parallel instead of sequential
      ]);
      console.log('[PROMPT_BUILDER] [HYP-C] Memory contexts retrieved:', {
        hasSessionMemory: !!sessionMemory,
        sessionMemorySummaryLength: sessionMemory?.summary?.length || 0,
        longTermMemoriesCount: longTermMemories.length,
        stylePatternsCount: stylePatterns.length,
        memoryEnabled
      });

      // 2. Build individual context sections
      const personaSection = this.buildPersonaSection(personaData);
      const styleSection = this.buildStyleSection(personaData, styleVector);
      const styleAnchorSection = this.buildStyleAnchorSection(stylePatterns);
      const longTermMemorySection = this.buildLongTermMemorySection(longTermMemories);
      const sessionMemorySection = this.buildSessionMemorySection(sessionMemory);
      const chatContextSection = this.buildChatContextSection(chatVector, chatMemory);
      const instructionsSection = this.buildInstructionsSection(personaData, styleVector, tokenLimit);
      const userMessage = currentMessages.join(' ');

      // 3. Calculate base prompt size (mandatory parts)
      const basePrompt = `You are the user's AI twin chatting with the human user.
CRITICAL:
- You are NOT the human user.
- Do NOT claim you solved the user's messages.
- If AUTHORITATIVE STATE (session memory) contains an ACTIVE_TASK, continue it until the user changes it.

CURRENT HUMAN MESSAGE: "${userMessage}"\n\n`;
      const baseTokens = this.countTokens(basePrompt);
      const instructionsTokens = this.countTokens(instructionsSection);
      
      // Available budget for optional sections
      let availableBudget = tokenBudget - baseTokens - instructionsTokens;
      
      logger.info('Base prompt tokens:', { baseTokens, instructionsTokens, availableBudget });

      // Priority order: persona > style > anchors > long-term memories > session > chat context
      const sections: Array<{name: string, content: string, priority: number}> = [
        { name: 'feedback', content: feedbackContext, priority: 0 },  // Highest priority - recent user feedback
        { name: 'persona', content: personaSection, priority: 1 },
        { name: 'style', content: styleSection, priority: 2 },
        { name: 'anchors', content: styleAnchorSection, priority: 3 },
        { name: 'longTermMemories', content: longTermMemorySection, priority: 4 },
        { name: 'sessionMemory', content: sessionMemorySection, priority: 5 },
        { name: 'chatContext', content: chatContextSection, priority: 6 }
      ];

      let assembledSections: string[] = [];
      let remainingBudget = availableBudget;

      for (const section of sections) {
        if (!section.content || section.content.trim().length === 0) {
          continue; // Skip empty sections
        }

        const sectionTokens = this.countTokens(section.content);
        
        if (sectionTokens <= remainingBudget) {
          // Full section fits
          assembledSections.push(section.content);
          remainingBudget -= sectionTokens;
          logger.debug(`Added full ${section.name} section (${sectionTokens} tokens, ${remainingBudget} remaining)`);
        } else if (remainingBudget > 100) {
          // Truncate section to fit (only if we have meaningful budget left)
          const truncated = this.truncateToTokenBudget(section.content, remainingBudget);
          const truncatedTokens = this.countTokens(truncated);
          if (truncatedTokens > 50) { // Only add if meaningful content
            assembledSections.push(truncated);
            remainingBudget -= truncatedTokens;
            logger.warn(`Added truncated ${section.name} section (${truncatedTokens} tokens, ${remainingBudget} remaining)`);
          } else {
            logger.warn(`Skipping ${section.name} section - too large (${sectionTokens} tokens, only ${remainingBudget} available)`);
          }
        } else {
          // Budget exhausted, skip this and lower priority sections
          logger.warn(`Skipping ${section.name} section and lower priority - budget exhausted (${sectionTokens} tokens needed, ${remainingBudget} available)`);
          break;
        }
      }

      // 5. Assemble final prompt
      const finalPrompt = basePrompt + 
        assembledSections.join('\n\n') + 
        '\n\n' + 
        instructionsSection;

      const finalTokens = this.countTokens(finalPrompt);
      logger.info('Final prompt token count:', { finalTokens, tokenBudget, underBudget: finalTokens <= tokenBudget });
      console.log('[PROMPT_BUILDER] [HYP-I] Final prompt assembly:', {
        finalTokens,
        tokenBudget,
        underBudget: finalTokens <= tokenBudget,
        sectionsIncluded: assembledSections.length,
        hasSessionMemory: !!sessionMemory,
        hasChatMemory: chatMemory.length > 0,
        chatMemoryCount: chatMemory.length,
        note: 'Only summary + recent messages included, NOT full history'
      });

      // Safety check: if still over budget, return truncated version
      if (finalTokens > tokenBudget) {
        logger.error('Prompt exceeds token budget even after truncation!', { 
          finalTokens, 
          tokenBudget,
          exceededBy: finalTokens - tokenBudget 
        });
        return this.truncateToTokenBudget(finalPrompt, tokenBudget);
      }

      return finalPrompt;
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
    userQuery?: string,
    visibility?: 'owner' | 'public_twin' | 'all' // ✅ ADD parameter
  ): Promise<Array<{key: string, value: string, category: string}>> {
    if (!twinId) return [];
    
    try {
      if (userQuery && userQuery.trim().length > 0) {
        // ✅ Use smart hybrid retrieval - gets MOST RELEVANT memories
        // Reduced from 10 to 7 (still good quality, 30% token savings)
        return await memoryService.getRelevantLongTermMemories(
          twinId, 
          userQuery, 
          7,
          undefined, // category
          visibility || 'all' // ✅ PASS visibility parameter
        );
      } else {
        // ✅ Get common memories only (reduced from 5 to 4)
        return await memoryService.getLongTermMemories(
          twinId, 
          undefined, 
          4,
          visibility || 'all' // ✅ PASS visibility parameter
        );
      }
    } catch (error) {
      logger.warn('Failed to retrieve long-term memories:', error);
      // Fallback: Get at least common memories
      try {
        return await memoryService.getLongTermMemories(
          twinId, 
          undefined, 
          4,
          visibility || 'all' // ✅ PASS visibility parameter
        );
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
      // ✅ Keep 3 style patterns (necessary for user-like responses)
      // Don't reduce - style patterns are critical for quality
      return await memoryService.getRelevantStylePatterns(twinId, userQuery, 3);
    } catch (error) {
      logger.warn('Failed to retrieve style patterns:', error);
      return [];
    }
  }
  
  /**
   * Get feedback context from recent style corrections
   * Aggregates feedback from last 7 days and returns adjustments
   */
  private async getFeedbackContext(twinId?: string): Promise<string> {
    if (!twinId) return '';
    
    try {
      const feedbackResult = await db.query(`
        SELECT knob, AVG(delta::float) as avg_delta, COUNT(*) as count
        FROM style_corrections
        WHERE twin_id = $1 AND ts >= NOW() - INTERVAL '7 days'
        GROUP BY knob
        HAVING COUNT(*) >= 2 AND ABS(AVG(delta::float)) > 0.3
      `, [twinId]);
      
      if (feedbackResult.rows.length === 0) {
        return '';
      }
      
      const adjustments = feedbackResult.rows
        .map(f => {
          const avgDelta = parseFloat(f.avg_delta);
          if (avgDelta > 0.3) {
            return `Increase ${f.knob} usage`;
          } else if (avgDelta < -0.3) {
            return `Decrease ${f.knob} usage`;
          }
          return null;
        })
        .filter(Boolean);
      
      if (adjustments.length === 0) {
        return '';
      }
      
      return `\n## RECENT USER FEEDBACK (APPLY THESE ADJUSTMENTS):\n${adjustments.join('\n')}\n`;
    } catch (error) {
      logger.warn('Failed to get feedback context:', error);
      return '';
    }
  }    

  /**
   * Build persona section (bio, personality)
   */
  private buildPersonaSection(personaData?: any): string {
    if (!personaData) return '';

    const basic = personaData.basicInfo || {};
    const userName =
      basic.name ||
      basic.fullName || // legacy fallback
      personaData.name ||
      'the user';

    const oneLineBio =
      basic.oneLineBio ||
      basic.bio || // legacy fallback
      '';

    const role = basic.role || '';
    const purpose = basic.purpose || '';
    const language = basic.language || '';

    const userPersonality = personaData.personality
      ? `Personality: ${JSON.stringify(personaData.personality)}`
      : '';

    let section = '';
    if (oneLineBio) section += `ABOUT ${String(userName).toUpperCase()}: ${oneLineBio}\n`;
    if (role) section += `ROLE: ${role}\n`;
    if (purpose) section += `PURPOSE: ${purpose}\n`;
    if (language) section += `DEFAULT LANGUAGE: ${language}\n`;
    if (userPersonality) section += `${userPersonality}\n`;

    return section;
  }

  /**
   * Build style section (communication style parameters)
   */
  private buildStyleSection(personaData?: any, _styleVector?: any): string {
    // MVP (personaData-only): Build style guidance from personaData, not styleVector.
    if (!personaData) return '';

    const rules = personaData.rules || {};
    const comm = personaData.communicationStyle || {};
    const lang = comm.language || {};
    const tone = comm.tone || {};
    const prefs = personaData.preferences || {};
    const ctx = personaData.context || {};

    const responseLen = lang.responseLength || rules.replySize || 'normal';
    const emojiPref = lang.emojiUsage || prefs.emojiPref || 'medium';
    const toneStyle = prefs.toneStyle || 'normal';
    const commonPhrases = lang.commonPhrases || '';

    return `
COMMUNICATION STYLE (FROM personaData - USE THIS):
- Response length: ${responseLen}
- Emoji preference: ${emojiPref}
- Tone style: ${toneStyle}
- Tone sliders: formalCasual=${tone.formalCasual ?? 'n/a'}, seriousPlayful=${tone.seriousPlayful ?? 'n/a'}, directDiplomatic=${tone.directDiplomatic ?? 'n/a'}
- Common phrases (use naturally, not forced): ${commonPhrases || 'none'}
- Target audience: ${ctx.targetAudience || 'general'}
- Topics to avoid: ${ctx.topicsToAvoid || 'none'}
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

CRITICAL:
- Use these memories ONLY when relevant.
- Do NOT say "I remember", "from memory", "I saved", or mention the memory system.
- Do NOT info-dump; answer the user's question naturally.
- Do not repeat memories unless the user asks.
`;
  }

  /**
   * Build session memory section (chat summary)
   */
  private buildSessionMemorySection(
    sessionMemory?: {summary: string; keyTopics: string[]; pinnedFacts?: { name?: string; likes?: string[]; hobbies?: string[]; extras?: string[] } } | null
  ): string {
    // Part 1: Pinned Facts (high priority, persists for whole chat)
    const pf = sessionMemory?.pinnedFacts || {};
    const pinnedLines: string[] = [];
    if (pf.name) pinnedLines.push(`- Name: ${pf.name}`);
    if (pf.likes?.length) pinnedLines.push(`- Likes: ${pf.likes.join(', ')}`);
    if (pf.hobbies?.length) pinnedLines.push(`- Hobbies: ${pf.hobbies.join(', ')}`);
    if (pf.extras?.length) pinnedLines.push(`- Extras: ${pf.extras.join(', ')}`); // ✅ NEW

    if (pinnedLines.length > 0) {
      console.log('[PROMPT_BUILDER] [PINNED_FACTS] Including pinned facts in prompt:', {
        name: pf.name || null,
        likes: pf.likes || [],
        hobbies: pf.hobbies || [],
        extras: pf.extras || [], // ✅ NEW
      });
    }

    const pinnedSection = pinnedLines.length
      ? `## PINNED FACTS (THIS CHAT ONLY — HIGH PRIORITY, AUTHORITATIVE):\n${pinnedLines.join('\n')}\n\n`
      : '';

    // ✅ Show pinned facts even if summary is empty
    if (!sessionMemory?.summary) {
      return pinnedSection || '';
    }
    
    // Part 2: Rolling State (ACTIVE_TASK/PROGRESS/CONSTRAINTS/NOTES)
    const topicsSection = sessionMemory.keyTopics?.length > 0 
      ? `## KEY TOPICS DISCUSSED:\n${sessionMemory.keyTopics.join(', ')}\n` 
      : '';
    
    return `
${pinnedSection}## PREVIOUS CONVERSATION SUMMARY (AUTHORITATIVE STATE):
${sessionMemory.summary}

${topicsSection}
CRITICAL: Treat this as the current state. Continue the ACTIVE_TASK and PROGRESS from it.
DO NOT switch topics unless the user explicitly changes the task.
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
        ? chatMemory.map(msg => `${msg.sender === 'human' ? 'Human' : 'Twin'}: ${msg.content}`).join('\n')
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
${chatMemory.map(msg => `${msg.sender === 'human' ? 'Human' : 'Twin'}: ${msg.content}`).join('\n')}`;
    } else {
      return 'CHAT HISTORY: This is the start of our conversation.';
    }
  }

  /**
   * Build instructions section
   */
  private buildInstructionsSection(
    personaData?: any,
    _styleVector?: any,
    tokenLimit: number = 500
  ): string {
    const userName =
      personaData?.basicInfo?.name ||
      personaData?.basicInfo?.fullName || // legacy
      personaData?.name ||
      'the user';
    const rules = personaData?.rules || {};
    const comm = personaData?.communicationStyle || {};
    const lang = comm.language || {};
    const prefs = personaData?.preferences || {};
    
    return `CRITICAL INSTRUCTIONS:
1. You are an AI twin chatting with the human user. You are NOT the user.
2. Do NOT greet the user by name (no "hi ${userName}") unless the user asks or it’s naturally needed.
3. Follow the user's LATEST explicit instruction as highest priority.
4. If a multi-step task is active (quiz/steps), continue it until completion unless the user cancels.
5. Never ask the human to “ask the next question” when the human requested YOU to ask questions. You must ask the next question yourself.
6. Keep tone respectful; no insults.
7. Be authentic to the personality and style defined above
8. Emoji preference: ${lang.emojiUsage || prefs.emojiPref || 'medium'}
9. Response length: ${lang.responseLength || rules.replySize || 'normal'}`;
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
    const userName =
      personaData?.basicInfo?.name ||
      personaData?.basicInfo?.fullName || // legacy
      personaData?.name ||
      'the user';
    
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
    const userName =
      personaData?.basicInfo?.name ||
      personaData?.basicInfo?.fullName || // legacy
      personaData?.name ||
      'the user';
    
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
    sessionMemory?: {summary: string; keyTopics: string[]; pinnedFacts?: { name?: string; likes?: string[]; hobbies?: string[]; extras?: string[] } } | null,
    longTermMemories?: Array<{key: string, value: string, category: string}>,
    stylePatterns?: StylePattern[],
    tokenLimit: number = 500,
    userMessage?: string
  ): string {
    const userName =
      personaData?.basicInfo?.name ||
      personaData?.basicInfo?.fullName || // legacy
      personaData?.name ||
      'the user';
    
    // Build chat context
    const chatContext = chatHistory
      .slice(-10)
      .map(msg => `${msg.sender === 'human' ? 'Human' : 'Twin'}: ${msg.content}`)
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

CRITICAL INSTRUCTIONS (OVERRIDE ANY CONFLICT ABOVE):
- You are the user's AI twin. You are NOT the human user.
- The HUMAN's latest instruction is highest priority. Do NOT replace it with your own topic.
- Do NOT refuse benign requests. If the request is safe, comply. If unclear, ask 1 short clarifying question.
- Do NOT mention “startup”, “MVP”, “topper”, or any personal goal unless the human explicitly asks about it.
- If the human asks for math questions, ask math questions (not business questions).
- When grading math: show the computed correct answer briefly and say "Correct" or "Wrong" clearly.
- Do NOT greet the user by name unless asked.
- Keep response under ${tokenLimit} tokens.
- Keep tone respectful; no insults.
- Use the communication style from persona data, but NEVER at the cost of ignoring the user's request.`;
  }
}

export const promptBuilder = new PromptBuilder();

