import { config } from '../config/env';
import { logger } from '../config/logger';
import OpenAI from 'openai';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  model: string;
  tokensUsed?: number;
  inputTokens?: number;  // ✅ ADD
  outputTokens?: number; // ✅ ADD
}

export class LLMClient {
  private groqApiKey: string | null; // For logged-in users
  private groqApiKeyAnonymous: string | null; // ✅ Free tier for anonymous users
  private openaiApiKey: string | null;
  private openai: OpenAI | null;

  constructor() {
    this.groqApiKey = config.groqApiKey || null;
    this.groqApiKeyAnonymous = config.groqApiKeyAnonymous || null; // ✅ ADD: Anonymous key
    this.openaiApiKey = config.openaiApiKey || null;
    
    if (this.openaiApiKey) {
      this.openai = new OpenAI({ apiKey: this.openaiApiKey });
    } else {
      this.openai = null;
    }
    
    if (!this.groqApiKey && !this.groqApiKeyAnonymous && !this.openaiApiKey) {
      logger.warn('⚠️ No LLM API key configured. Set GROQ_API_KEY, GROQ_API_KEY_ANONYMOUS, or OPENAI_API_KEY');
    } else {
      if (this.groqApiKeyAnonymous) {
        logger.info('✅ Using Groq API (anonymous free tier) for anonymous users');
      }
      if (this.groqApiKey) {
        logger.info('✅ Using Groq API (logged-in users) for authenticated users');
      }
      if (this.openaiApiKey) {
        logger.info('✅ OpenAI fallback available');
      }
    }
  }

  async generateResponse(
    messages: LLMMessage[],
    options: {
      model?: string;
      maxTokens?: number;
      temperature?: number;
      responseFormat?: { type: 'json_object' };
      isAnonymous?: boolean; // ✅ ADD: Flag for anonymous users
    } = {}
  ): Promise<LLMResponse> {
    // ✅ Use anonymous key for anonymous users, regular key for logged-in users
    const apiKeyToUse = options.isAnonymous && this.groqApiKeyAnonymous
      ? this.groqApiKeyAnonymous
      : this.groqApiKey;
    
    // ✅ Try Groq first if available
    if (apiKeyToUse) {
      try {
        return await this.callGroq(messages, options, apiKeyToUse);
      } catch (error) {
        logger.warn('⚠️ Groq API failed, falling back to OpenAI:', error instanceof Error ? error.message : String(error));
        // Fall through to OpenAI fallback
      }
    }
    
    // ✅ Fallback to OpenAI if Groq not available or failed
    if (this.openaiApiKey && this.openai) {
      try {
        return await this.callOpenAI(messages, options);
      } catch (error) {
        logger.error('❌ OpenAI API also failed:', error instanceof Error ? error.message : String(error));
        throw error;
      }
    }
    
    throw new Error('No LLM API key configured. Set GROQ_API_KEY, GROQ_API_KEY_ANONYMOUS, or OPENAI_API_KEY');
  }

  private async callGroq(
    messages: LLMMessage[],
    options: any,
    apiKey: string // ✅ ADD: Accept API key parameter
  ): Promise<LLMResponse> {
    // ✅ All models with HIGHEST limits (14.4K req/day each) + fallback
    const supportedModels = [
      'llama-3.1-8b-instant',                    // ✅ 14.4K req/day, 500K tokens/day
      'meta-llama/llama-guard-4-12b',            // ✅ 14.4K req/day, 500K tokens/day
      'meta-llama/llama-prompt-guard-2-22m',     // ✅ 14.4K req/day, 500K tokens/day
      'meta-llama/llama-prompt-guard-2-86m',     // ✅ 14.4K req/day, 500K tokens/day
      'llama-2-7b',                              // ✅ 7K req/day, 500K tokens/day
      'llama-3.3-70b-versatile'                  // ⚠️ LAST RESORT: 1K req/day (better quality)
    ];
    
    // Total potential: 14.4K × 4 + 7K = 64.6K requests/day! 🚀
    
    const modelToUse = options.model || supportedModels[0];
    let lastError: Error | null = null;

    // Try the requested/default model first
    for (const model of [modelToUse, ...supportedModels.filter(m => m !== modelToUse)]) {
      try {
        logger.info(`🔄 Trying Groq model: ${model}`);
        const startedAt = Date.now();
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`, // ✅ Use passed API key
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
          let errorData: any = {};
          try {
            errorData = JSON.parse(errorText);
          } catch (e) {
            // If JSON parse fails, use error text as is
          }
          
          // ✅ Check for rate limit/quota errors (429 = Too Many Requests)
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
          
          // ✅ Check for model decommissioned
          const isDecommissioned = errorData.error?.code === 'model_decommissioned' || 
                                  errorText.includes('decommissioned');
          
          // ✅ Check for 500/502/503 errors (server errors - should fallback to OpenAI)
          const isServerError = response.status === 500 || response.status === 502 || response.status === 503;
          
          // ✅ If rate limit or decommissioned, try next model (each has separate quota)
          if (isRateLimit || isDecommissioned) {
            const errorType = isRateLimit ? 'rate limit/quota exceeded' : 'decommissioned';
            logger.warn(`⚠️ Model ${model} ${errorType}, trying next model with separate quota...`);
            lastError = new Error(`Model ${model} ${errorType}`);
            continue; // Try next model (each has its own quota)
          }
          
          // ✅ If server error (500/502/503), throw to trigger OpenAI fallback
          if (isServerError) {
            logger.warn(`⚠️ Groq server error (${response.status}), will fallback to OpenAI`);
            throw new Error(`Groq API server error: ${response.status}`);
          }
          
          logger.error(`Groq API error: ${response.status} ${errorText.substring(0, 200)}`);
          throw new Error(`Groq API error: ${response.status}`);
        }

        const data = await response.json() as {
          choices: Array<{ message: { content: string } }>;
          usage?: { total_tokens?: number; prompt_tokens?: number; completion_tokens?: number };
        };
        
        const durationMs = Date.now() - startedAt;

        const responseObj: LLMResponse = {
          content: data.choices[0]?.message?.content?.trim() || '',
          model: model,
          tokensUsed: data.usage?.total_tokens || 0,
          // ✅ ADD: Store breakdown
          inputTokens: data.usage?.prompt_tokens || 0,
          outputTokens: data.usage?.completion_tokens || 0
        };

        // ✅ ADD: Log breakdown
        logger.info(`✅ Successfully used Groq model: ${model}`, {
          durationMs,
          usage: data.usage || null,
          breakdown: {
            input: data.usage?.prompt_tokens || 0,
            output: data.usage?.completion_tokens || 0,
            total: data.usage?.total_tokens || 0
          }
        });
        return responseObj;
      } catch (error: any) {
        // ✅ Check for rate limit in error message
        const isRateLimit = error.message?.toLowerCase().includes('rate limit') ||
                           error.message?.toLowerCase().includes('quota exceeded') ||
                           error.message?.toLowerCase().includes('429') ||
                           error.message?.toLowerCase().includes('requests per day') ||
                           error.message?.toLowerCase().includes('tokens per day');
        
        // ✅ Check for decommissioned
        const isDecommissioned = error.message?.includes('decommissioned') || 
                                error.message?.includes('model_decommissioned');
        
        // ✅ Check for server errors
        const isServerError = error.message?.includes('500') || 
                             error.message?.includes('502') || 
                             error.message?.includes('503') ||
                             error.message?.includes('server error');
        
        // ✅ If server error, throw immediately to trigger OpenAI fallback
        if (isServerError) {
          logger.warn(`⚠️ Groq server error detected, will fallback to OpenAI`);
          throw error;
        }
        
        // ✅ If rate limit or decommissioned, try next model
        if (isRateLimit || isDecommissioned) {
          const errorType = isRateLimit ? 'rate limit exceeded' : 'decommissioned';
          logger.warn(`⚠️ Model ${model} ${errorType}, trying next model...`);
          lastError = error;
          continue;
        }
        // For other errors, throw immediately to trigger OpenAI fallback
        throw error;
      }
    }

    // If all models failed
    logger.error('❌ All Groq models failed');
    throw lastError || new Error('All Groq models failed');
  }

  private async callOpenAI(
    messages: LLMMessage[],
    options: any
  ): Promise<LLMResponse> {
    if (!this.openai) {
      throw new Error('OpenAI client not initialized');
    }

    logger.info('🔄 Using OpenAI API (fallback)');
    const startedAt = Date.now();
    
    const completion = await this.openai.chat.completions.create({
      model: options.model || 'gpt-4o-mini',
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      max_tokens: options.maxTokens || 512,
      temperature: options.temperature || 0.7,
      ...(options.responseFormat ? { response_format: options.responseFormat } : {})
    });

    const durationMs = Date.now() - startedAt;

    logger.info('✅ Successfully used OpenAI API', {
      durationMs,
      usage: completion.usage || null,
      model: completion.model
    });
    
    return {
      content: completion.choices[0]?.message?.content?.trim() || '',
      model: completion.model || 'gpt-4o-mini',
      tokensUsed: completion.usage?.total_tokens || 0,
      // ✅ ADD: Actual breakdown
      inputTokens: completion.usage?.prompt_tokens || 0,
      outputTokens: completion.usage?.completion_tokens || 0
    };
  }
}

export const llmClient = new LLMClient();

