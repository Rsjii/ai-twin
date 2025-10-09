"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TwinService = void 0;
const openai_1 = __importDefault(require("openai"));
const env_1 = require("../../config/env");
const logger_1 = require("../../config/logger");
const security_1 = require("../../middleware/security");
const openai = new openai_1.default({
    apiKey: env_1.config.openaiApiKey,
});
class TwinService {
    async extractStyle(samples) {
        try {
            if (!(0, security_1.validateSamplesLength)(samples)) {
                throw new Error('Samples must be between 100-3000 characters');
            }
            const sanitizedSamples = (0, security_1.sanitizeText)(samples);
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
            const styleVector = JSON.parse(content);
            if (!this.validateStyleVector(styleVector)) {
                throw new Error('Invalid style vector format');
            }
            return styleVector;
        }
        catch (error) {
            logger_1.logger.error('Style extraction error:', error);
            throw error;
        }
    }
    async generateSampleReply(styleVector) {
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
        }
        catch (error) {
            logger_1.logger.error('Sample reply generation error:', error);
            throw error;
        }
    }
    async generateDraft(styleVector, conversationHistory) {
        try {
            const fullConversation = conversationHistory.join(' ');
            if ((0, security_1.checkBlacklist)(fullConversation)) {
                return '[not allowed]';
            }
            const systemPrompt = `Imitate user's style: ${JSON.stringify(styleVector)}. 
Reply in 1–2 short lines, casual, code-mixed Hinglish (~${styleVector.hinglish_ratio} ratio), light emojis if appropriate.
No politics, health, finance, or sensitive topics. If unsafe, say: '[not allowed]'`;
            const userPrompt = conversationHistory.slice(-4).join('\n');
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
        }
        catch (error) {
            logger_1.logger.error('Draft generation error:', error);
            throw error;
        }
    }
    async updateStyleVector(currentVector, newConversations) {
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
            const updatedVector = JSON.parse(content);
            if (!this.validateStyleVector(updatedVector)) {
                logger_1.logger.warn('Invalid updated style vector, returning current vector');
                return currentVector;
            }
            return updatedVector;
        }
        catch (error) {
            logger_1.logger.error('Style vector update error:', error);
            return currentVector;
        }
    }
    validateStyleVector(vector) {
        return (vector &&
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
            typeof vector.communication_style === 'string' && ['conversational', 'informative', 'questioning'].includes(vector.communication_style));
    }
}
exports.TwinService = TwinService;
//# sourceMappingURL=twinService.js.map