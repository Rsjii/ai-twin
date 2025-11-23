"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.llmClient = exports.LLMClient = void 0;
const env_1 = require("../config/env");
const logger_1 = require("../config/logger");
const openai_1 = __importDefault(require("openai"));
class LLMClient {
    groqApiKey;
    openaiApiKey;
    openai;
    constructor() {
        this.groqApiKey = env_1.config.groqApiKey || null;
        this.openaiApiKey = env_1.config.openaiApiKey || null;
        if (this.openaiApiKey) {
            this.openai = new openai_1.default({ apiKey: this.openaiApiKey });
        }
        else {
            this.openai = null;
        }
        if (!this.groqApiKey && !this.openaiApiKey) {
            logger_1.logger.warn('⚠️ No LLM API key configured. Set GROQ_API_KEY or OPENAI_API_KEY');
        }
        else if (this.groqApiKey) {
            logger_1.logger.info('✅ Using Groq API for LLM calls (OpenAI fallback available)');
        }
        else {
            logger_1.logger.info('✅ Using OpenAI API for LLM calls');
        }
    }
    async generateResponse(messages, options = {}) {
        if (this.groqApiKey) {
            try {
                return await this.callGroq(messages, options);
            }
            catch (error) {
                logger_1.logger.warn('⚠️ Groq API failed, falling back to OpenAI:', error instanceof Error ? error.message : String(error));
            }
        }
        if (this.openaiApiKey && this.openai) {
            try {
                return await this.callOpenAI(messages, options);
            }
            catch (error) {
                logger_1.logger.error('❌ OpenAI API also failed:', error instanceof Error ? error.message : String(error));
                throw error;
            }
        }
        throw new Error('No LLM API key configured. Set GROQ_API_KEY or OPENAI_API_KEY');
    }
    async callGroq(messages, options) {
        const supportedModels = [
            'llama-3.1-8b-instant',
            'meta-llama/llama-guard-4-12b',
            'meta-llama/llama-prompt-guard-2-22m',
            'meta-llama/llama-prompt-guard-2-86m',
            'llama-2-7b',
            'llama-3.3-70b-versatile'
        ];
        const modelToUse = options.model || supportedModels[0];
        let lastError = null;
        for (const model of [modelToUse, ...supportedModels.filter(m => m !== modelToUse)]) {
            try {
                logger_1.logger.info(`🔄 Trying Groq model: ${model}`);
                const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.groqApiKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: model,
                        messages: messages.map(m => ({ role: m.role, content: m.content })),
                        max_tokens: options.maxTokens || 512,
                        temperature: options.temperature || 0.7,
                        ...(options.responseFormat ? { response_format: options.responseFormat } : {})
                    })
                });
                if (!response.ok) {
                    const errorText = await response.text();
                    let errorData = {};
                    try {
                        errorData = JSON.parse(errorText);
                    }
                    catch (e) {
                    }
                    const isRateLimit = response.status === 429 ||
                        errorData.error?.code === 'rate_limit_exceeded' ||
                        errorData.error?.message?.toLowerCase().includes('rate limit') ||
                        errorData.error?.message?.toLowerCase().includes('quota exceeded') ||
                        errorData.error?.message?.toLowerCase().includes('requests per day') ||
                        errorData.error?.message?.toLowerCase().includes('tokens per day') ||
                        errorText.toLowerCase().includes('rate limit') ||
                        errorText.toLowerCase().includes('quota exceeded') ||
                        errorText.toLowerCase().includes('requests per day') ||
                        errorText.toLowerCase().includes('tokens per day');
                    const isDecommissioned = errorData.error?.code === 'model_decommissioned' ||
                        errorText.includes('decommissioned');
                    const isServerError = response.status === 500 || response.status === 502 || response.status === 503;
                    if (isRateLimit || isDecommissioned) {
                        const errorType = isRateLimit ? 'rate limit/quota exceeded' : 'decommissioned';
                        logger_1.logger.warn(`⚠️ Model ${model} ${errorType}, trying next model with separate quota...`);
                        lastError = new Error(`Model ${model} ${errorType}`);
                        continue;
                    }
                    if (isServerError) {
                        logger_1.logger.warn(`⚠️ Groq server error (${response.status}), will fallback to OpenAI`);
                        throw new Error(`Groq API server error: ${response.status}`);
                    }
                    logger_1.logger.error(`Groq API error: ${response.status} ${errorText.substring(0, 200)}`);
                    throw new Error(`Groq API error: ${response.status}`);
                }
                const data = await response.json();
                logger_1.logger.info(`✅ Successfully used Groq model: ${model}`);
                const responseObj = {
                    content: data.choices[0]?.message?.content?.trim() || '',
                    model: model
                };
                if (data.usage?.total_tokens) {
                    responseObj.tokensUsed = data.usage.total_tokens;
                }
                return responseObj;
            }
            catch (error) {
                const isRateLimit = error.message?.toLowerCase().includes('rate limit') ||
                    error.message?.toLowerCase().includes('quota exceeded') ||
                    error.message?.toLowerCase().includes('429') ||
                    error.message?.toLowerCase().includes('requests per day') ||
                    error.message?.toLowerCase().includes('tokens per day');
                const isDecommissioned = error.message?.includes('decommissioned') ||
                    error.message?.includes('model_decommissioned');
                const isServerError = error.message?.includes('500') ||
                    error.message?.includes('502') ||
                    error.message?.includes('503') ||
                    error.message?.includes('server error');
                if (isServerError) {
                    logger_1.logger.warn(`⚠️ Groq server error detected, will fallback to OpenAI`);
                    throw error;
                }
                if (isRateLimit || isDecommissioned) {
                    const errorType = isRateLimit ? 'rate limit exceeded' : 'decommissioned';
                    logger_1.logger.warn(`⚠️ Model ${model} ${errorType}, trying next model...`);
                    lastError = error;
                    continue;
                }
                throw error;
            }
        }
        logger_1.logger.error('❌ All Groq models failed');
        throw lastError || new Error('All Groq models failed');
    }
    async callOpenAI(messages, options) {
        if (!this.openai) {
            throw new Error('OpenAI client not initialized');
        }
        logger_1.logger.info('🔄 Using OpenAI API (fallback)');
        const completion = await this.openai.chat.completions.create({
            model: options.model || 'gpt-4o-mini',
            messages: messages.map(m => ({ role: m.role, content: m.content })),
            max_tokens: options.maxTokens || 512,
            temperature: options.temperature || 0.7,
            ...(options.responseFormat ? { response_format: options.responseFormat } : {})
        });
        logger_1.logger.info('✅ Successfully used OpenAI API');
        return {
            content: completion.choices[0]?.message?.content?.trim() || '',
            model: completion.model || 'gpt-4o-mini',
            tokensUsed: completion.usage?.total_tokens
        };
    }
}
exports.LLMClient = LLMClient;
exports.llmClient = new LLMClient();
//# sourceMappingURL=llmClient.js.map