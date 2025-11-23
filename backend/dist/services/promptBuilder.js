"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.promptBuilder = exports.PromptBuilder = void 0;
const memoryService_1 = require("./memoryService");
const logger_1 = require("../config/logger");
const tiktoken_1 = require("tiktoken");
const database_1 = require("../config/database");
class PromptBuilder {
    countTokens(text) {
        try {
            const enc = (0, tiktoken_1.encoding_for_model)('gpt-4o-mini');
            return enc.encode(text).length;
        }
        catch (error) {
            logger_1.logger.warn('Token counting failed, using char estimate:', error);
            return Math.ceil(text.length / 4);
        }
    }
    truncateToTokenBudget(text, maxTokens) {
        const tokens = this.countTokens(text);
        if (tokens <= maxTokens)
            return text;
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
            }
            else {
                right = mid;
            }
        }
        return bestFit || text.substring(0, Math.floor(text.length * 0.8));
    }
    async buildSystemPrompt(context) {
        const { twinId, chatId, personaData, styleVector, chatVector, chatMemory, currentMessages, sessionMemory: providedSessionMemory, tokenLimit = 500 } = context;
        try {
            const MAX_PROMPT_TOKENS = 115000;
            const responseTokenReserve = tokenLimit;
            const tokenBudget = MAX_PROMPT_TOKENS - responseTokenReserve - 500;
            logger_1.logger.info('Token budget:', {
                maxPromptTokens: MAX_PROMPT_TOKENS,
                responseReserve: responseTokenReserve,
                availableBudget: tokenBudget
            });
            const sessionMemoryPromise = providedSessionMemory
                ? Promise.resolve(providedSessionMemory)
                : this.getSessionMemory(chatId);
            const [sessionMemory, longTermMemories, stylePatterns, feedbackContext] = await Promise.all([
                sessionMemoryPromise,
                this.getLongTermMemories(twinId, currentMessages.join(' ')),
                this.getStylePatterns(twinId, currentMessages.join(' ')),
                this.getFeedbackContext(twinId)
            ]);
            const personaSection = this.buildPersonaSection(personaData);
            const styleSection = this.buildStyleSection(styleVector);
            const styleAnchorSection = this.buildStyleAnchorSection(stylePatterns);
            const longTermMemorySection = this.buildLongTermMemorySection(longTermMemories);
            const sessionMemorySection = this.buildSessionMemorySection(sessionMemory);
            const chatContextSection = this.buildChatContextSection(chatVector, chatMemory);
            const instructionsSection = this.buildInstructionsSection(personaData, styleVector, tokenLimit);
            const userMessage = currentMessages.join(' ');
            const basePrompt = `You are an AI twin representing ${personaData?.basicInfo?.fullName || personaData?.name || 'the user'}. You MUST respond as if you are this person, using their exact communication style.\n\nCURRENT USER MESSAGE: "${userMessage}"\n\n`;
            const baseTokens = this.countTokens(basePrompt);
            const instructionsTokens = this.countTokens(instructionsSection);
            let availableBudget = tokenBudget - baseTokens - instructionsTokens;
            logger_1.logger.info('Base prompt tokens:', { baseTokens, instructionsTokens, availableBudget });
            const sections = [
                { name: 'feedback', content: feedbackContext, priority: 0 },
                { name: 'persona', content: personaSection, priority: 1 },
                { name: 'style', content: styleSection, priority: 2 },
                { name: 'anchors', content: styleAnchorSection, priority: 3 },
                { name: 'longTermMemories', content: longTermMemorySection, priority: 4 },
                { name: 'sessionMemory', content: sessionMemorySection, priority: 5 },
                { name: 'chatContext', content: chatContextSection, priority: 6 }
            ];
            let assembledSections = [];
            let remainingBudget = availableBudget;
            for (const section of sections) {
                if (!section.content || section.content.trim().length === 0) {
                    continue;
                }
                const sectionTokens = this.countTokens(section.content);
                if (sectionTokens <= remainingBudget) {
                    assembledSections.push(section.content);
                    remainingBudget -= sectionTokens;
                    logger_1.logger.debug(`Added full ${section.name} section (${sectionTokens} tokens, ${remainingBudget} remaining)`);
                }
                else if (remainingBudget > 100) {
                    const truncated = this.truncateToTokenBudget(section.content, remainingBudget);
                    const truncatedTokens = this.countTokens(truncated);
                    if (truncatedTokens > 50) {
                        assembledSections.push(truncated);
                        remainingBudget -= truncatedTokens;
                        logger_1.logger.warn(`Added truncated ${section.name} section (${truncatedTokens} tokens, ${remainingBudget} remaining)`);
                    }
                    else {
                        logger_1.logger.warn(`Skipping ${section.name} section - too large (${sectionTokens} tokens, only ${remainingBudget} available)`);
                    }
                }
                else {
                    logger_1.logger.warn(`Skipping ${section.name} section and lower priority - budget exhausted (${sectionTokens} tokens needed, ${remainingBudget} available)`);
                    break;
                }
            }
            const finalPrompt = basePrompt +
                assembledSections.join('\n\n') +
                '\n\n' +
                instructionsSection;
            const finalTokens = this.countTokens(finalPrompt);
            logger_1.logger.info('Final prompt token count:', { finalTokens, tokenBudget, underBudget: finalTokens <= tokenBudget });
            if (finalTokens > tokenBudget) {
                logger_1.logger.error('Prompt exceeds token budget even after truncation!', {
                    finalTokens,
                    tokenBudget,
                    exceededBy: finalTokens - tokenBudget
                });
                return this.truncateToTokenBudget(finalPrompt, tokenBudget);
            }
            return finalPrompt;
        }
        catch (error) {
            logger_1.logger.error('Error building system prompt:', error);
            return this.buildFallbackPrompt(personaData, styleVector, currentMessages.join(' '));
        }
    }
    async getSessionMemory(chatId) {
        if (!chatId)
            return null;
        try {
            return await memoryService_1.memoryService.getSessionMemory(chatId);
        }
        catch (error) {
            logger_1.logger.warn('Failed to retrieve session memory:', error);
            return null;
        }
    }
    async getLongTermMemories(twinId, userQuery) {
        if (!twinId)
            return [];
        try {
            if (userQuery && userQuery.trim().length > 0) {
                return await memoryService_1.memoryService.getRelevantLongTermMemories(twinId, userQuery, 7);
            }
            else {
                return await memoryService_1.memoryService.getLongTermMemories(twinId, undefined, 4);
            }
        }
        catch (error) {
            logger_1.logger.warn('Failed to retrieve long-term memories:', error);
            try {
                return await memoryService_1.memoryService.getLongTermMemories(twinId, undefined, 4);
            }
            catch (e) {
                logger_1.logger.error('Fallback long-term memory retrieval failed:', e);
                return [];
            }
        }
    }
    async getStylePatterns(twinId, userQuery) {
        if (!twinId || !userQuery || userQuery.trim().length === 0)
            return [];
        try {
            return await memoryService_1.memoryService.getRelevantStylePatterns(twinId, userQuery, 3);
        }
        catch (error) {
            logger_1.logger.warn('Failed to retrieve style patterns:', error);
            return [];
        }
    }
    async getFeedbackContext(twinId) {
        if (!twinId)
            return '';
        try {
            const feedbackResult = await database_1.db.query(`
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
                }
                else if (avgDelta < -0.3) {
                    return `Decrease ${f.knob} usage`;
                }
                return null;
            })
                .filter(Boolean);
            if (adjustments.length === 0) {
                return '';
            }
            return `\n## RECENT USER FEEDBACK (APPLY THESE ADJUSTMENTS):\n${adjustments.join('\n')}\n`;
        }
        catch (error) {
            logger_1.logger.warn('Failed to get feedback context:', error);
            return '';
        }
    }
    buildPersonaSection(personaData) {
        if (!personaData)
            return '';
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
    buildStyleSection(styleVector) {
        if (!styleVector)
            return '';
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
    buildStyleAnchorSection(stylePatterns) {
        if (!stylePatterns || stylePatterns.length === 0)
            return '';
        const patterns = stylePatterns
            .map((pattern, index) => {
            if (pattern.type === 'interaction' && pattern.userUtterance && pattern.idealReply) {
                return `Example ${index + 1}:
User says: "${pattern.userUtterance}"
You respond: "${pattern.idealReply}"`;
            }
            else if (pattern.type === 'phrase' && pattern.phrase) {
                return `Signature phrase ${index + 1}: "${pattern.phrase}"${pattern.context ? ` (use when: ${pattern.context})` : ''}`;
            }
            return '';
        })
            .filter(Boolean)
            .join('\n\n');
        if (!patterns)
            return '';
        return `
## STYLE PATTERNS (HOW TO RESPOND - FOLLOW THESE):
${patterns}

CRITICAL: When user's message is similar to examples above, match that response style. Use signature phrases naturally (not forced).
`;
    }
    buildLongTermMemorySection(longTermMemories) {
        if (!longTermMemories || longTermMemories.length === 0)
            return '';
        const memories = longTermMemories
            .map((mem, index) => {
            let prefix = '';
            if (mem.category === 'preference') {
                prefix = 'Preference: ';
            }
            else if (mem.category === 'fact') {
                prefix = 'Fact: ';
            }
            else if (mem.category === 'relationship') {
                prefix = 'Relationship: ';
            }
            else if (mem.category === 'interest') {
                prefix = 'Interest: ';
            }
            else {
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
    buildSessionMemorySection(sessionMemory) {
        if (!sessionMemory?.summary)
            return '';
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
    buildChatContextSection(chatVector, chatMemory) {
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
        }
        else if (chatMemory && chatMemory.length > 0) {
            return `CHAT HISTORY (IMPORTANT - REFERENCE THIS):
${chatMemory.map(msg => `${msg.sender === 'human' ? 'User' : 'AI'}: ${msg.content}`).join('\n')}`;
        }
        else {
            return 'CHAT HISTORY: This is the start of our conversation.';
        }
    }
    buildInstructionsSection(personaData, styleVector, tokenLimit = 500) {
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
    assemblePrompt(personaSection, styleSection, styleAnchorSection, longTermMemorySection, sessionMemorySection, chatContextSection, instructionsSection, userMessage, personaData) {
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
    buildFallbackPrompt(personaData, styleVector, userMessage = '') {
        const userName = personaData?.basicInfo?.fullName || personaData?.name || 'the user';
        return `You are an AI twin representing ${userName}. Respond naturally and authentically.

${userMessage ? `USER MESSAGE: "${userMessage}"` : ''}

Respond as ${userName}, maintaining their personality and communication style.`;
    }
    buildPersonaPrompt(systemPrompt, personaData, chatHistory, sessionMemory, longTermMemories, stylePatterns, tokenLimit = 500, userMessage) {
        const userName = personaData?.basicInfo?.fullName || personaData.name || 'the user';
        const chatContext = chatHistory
            .slice(-10)
            .map(msg => `${msg.sender === 'human' ? 'User' : 'AI'}: ${msg.content}`)
            .join('\n');
        const finalUserMessage = userMessage || chatHistory[chatHistory.length - 1]?.content || '';
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
exports.PromptBuilder = PromptBuilder;
exports.promptBuilder = new PromptBuilder();
//# sourceMappingURL=promptBuilder.js.map