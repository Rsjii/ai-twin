"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TwinService = void 0;
const openai_1 = __importDefault(require("openai"));
const env_1 = require("../../config/env");
const logger_1 = require("../../config/logger");
const safety_1 = require("../../utils/safety");
const openai = new openai_1.default({
    apiKey: env_1.config.openaiApiKey,
});
class TwinService {
    async extractStyle(samples) {
        try {
            const samplesArray = samples.split('\n---\n');
            const validation = (0, safety_1.validateTwinSamples)(samplesArray);
            if (!validation.valid) {
                throw new Error(validation.errors.join(', '));
            }
            const sanitizedSamples = (0, safety_1.sanitizeText)(samples);
            const safetyCheck = (0, safety_1.isContentSafe)(sanitizedSamples);
            if (!safetyCheck.safe) {
                throw new Error('Content safety check failed: ' + safetyCheck.reasons.join(', '));
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
            const safetyCheck = (0, safety_1.isContentSafe)(fullConversation);
            if (!safetyCheck.safe) {
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
    validateStyleVector(vector) {
        return (vector &&
            typeof vector.tone === 'string' && ['casual', 'witty', 'serious'].includes(vector.tone) &&
            typeof vector.emoji_usage === 'number' && vector.emoji_usage >= 0 && vector.emoji_usage <= 1 &&
            typeof vector.hinglish_ratio === 'number' && vector.hinglish_ratio >= 0 && vector.hinglish_ratio <= 1 &&
            typeof vector.sentence_length === 'string' && ['short', 'medium', 'long'].includes(vector.sentence_length) &&
            Array.isArray(vector.signature_patterns) && vector.signature_patterns.length >= 3);
    }
}
exports.TwinService = TwinService;
//# sourceMappingURL=twinService.js.map