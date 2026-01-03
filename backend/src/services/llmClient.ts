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
  
  // ✅ ADD: Track current model index per API key (circular rotation)
  // Key: apiKey, Value: current model index in supportedModels array
  private currentModelIndexMap: Map<string, number> = new Map();

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
    // ✅ OPTIMIZED: Best models first (highest limits) - Free Tier Strategy
    // Priority order based on: requests/day, tokens/day, quality
    const supportedModels = [
      // Tier 1: Highest limits (14.4K req/day, 500K tokens/day each)
      'llama-3.1-8b-instant',                    // ✅ PRIMARY: Best balance of speed + quality
      'meta-llama/llama-guard-4-12b',            // ✅ Backup 1: 14.4K req/day, 500K tokens/day
      'meta-llama/llama-prompt-guard-2-86m',      // ✅ Backup 2: 14.4K req/day, 500K tokens/day
      'meta-llama/llama-prompt-guard-2-22m',     // ✅ Backup 3: 14.4K req/day, 500K tokens/day
      
      // Tier 2: Good limits (7K req/day, 500K tokens/day)
      'llama-2-7b',                              // ✅ 7K req/day, 500K tokens/day
      
      // Tier 3: High quality, lower requests (1K req/day, 500K tokens/day)
      'meta-llama/llama-4-scout-17b-16e-instruct', // ✅ Best quality: 1K req/day, 500K tokens/day, 30K tokens/min
      'meta-llama/llama-4-maverick-17b-128e-instruct', // ✅ 1K req/day, 500K tokens/day
      'qwen/qwen3-32b',                          // ✅ 1K req/day, 500K tokens/day
      
      // Tier 4: Special cases - Unlimited tokens (250 req/day, NO LIMIT tokens/day)
      'groq/compound-mini',                      // ✅ 250 req/day, UNLIMITED tokens/day (for high token usage)
      'groq/compound',                           // ✅ 250 req/day, UNLIMITED tokens/day
      
      // Tier 5: Lower limits (avoid if possible)
      'moonshotai/kimi-k2-instruct',             // ⚠️ 1K req/day, 300K tokens/day
      'moonshotai/kimi-k2-instruct-0905',       // ⚠️ 1K req/day, 300K tokens/day
      
      // Last resort (lowest limits)
      'llama-3.3-70b-versatile'                  // ⚠️ 1K req/day, 100K tokens/day (lowest token limit)
    ];
    
    // Total potential with rotation:
    // Tier 1: 14.4K × 4 = 57.6K requests/day, 500K × 4 = 2M tokens/day
    // Tier 2: 7K = 7K requests/day, 500K tokens/day
    // Tier 3: 1K × 3 = 3K requests/day, 500K × 3 = 1.5M tokens/day
    // Tier 4: 250 × 2 = 500 requests/day, UNLIMITED tokens
    // Total: ~68K requests/day, ~4M+ tokens/day! 🚀
    
    // ✅ CIRCULAR ROTATION LOGIC:
    // 1. Get current model index for this API key (default: 0)
    // 2. Start from current index
    // 3. If model fails, try next (circular: wrap around to 0 if at end)
    // 4. If model succeeds, save that index as current for next request
    let currentIndex = this.currentModelIndexMap.get(apiKey) ?? 0;
    let lastError: Error | null = null;
    let attempts = 0;
    const maxAttempts = supportedModels.length; // Try all models once

    // ✅ Circular loop: Start from current index, wrap around if needed
    while (attempts < maxAttempts) {
      const modelIndex = (currentIndex + attempts) % supportedModels.length;
      const model = supportedModels[modelIndex];
      attempts++;

      try {
        logger.info(`🔄 Trying Groq model ${attempts}/${maxAttempts}: ${model} (index ${modelIndex})`);
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
          
          // ✅ If rate limit or decommissioned, try next model (circular rotation)
          if (isRateLimit || isDecommissioned) {
            const errorType = isRateLimit ? 'rate limit/quota exceeded' : 'decommissioned';
            logger.warn(`⚠️ Model ${model} (index ${modelIndex}) ${errorType}, trying next model...`);
            lastError = new Error(`Model ${model} ${errorType}`);
            continue; // Try next model in circular loop
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

        // ✅ SUCCESS: Save this model index as current for next request
        this.currentModelIndexMap.set(apiKey, modelIndex);
        
        const responseObj: LLMResponse = {
          content: data.choices[0]?.message?.content?.trim() || '',
          model: model,
          tokensUsed: data.usage?.total_tokens || 0,
          inputTokens: data.usage?.prompt_tokens || 0,
          outputTokens: data.usage?.completion_tokens || 0
        };

        // ✅ Log breakdown
        logger.info(`✅ Successfully used Groq model: ${model} (saved as current, index ${modelIndex})`, {
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
        
        // ✅ If rate limit or decommissioned, try next model (circular rotation)
        if (isRateLimit || isDecommissioned) {
          const errorType = isRateLimit ? 'rate limit exceeded' : 'decommissioned';
          logger.warn(`⚠️ Model ${model} (index ${modelIndex}) ${errorType}, trying next model...`);
          lastError = error;
          continue; // Continue to next iteration in while loop
        }
        // For other errors, throw immediately to trigger OpenAI fallback
        throw error;
      }
    }

    // ✅ If all models failed, reset to start from beginning next time
    this.currentModelIndexMap.set(apiKey, 0);
    logger.error('❌ All Groq models failed, resetting to model 0 for next request');
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

