import { config } from '../config/env';
import { logger } from '../config/logger';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  model: string;
  tokensUsed?: number;
}

export class LLMClient {
  private groqApiKey: string | null;

  constructor() {
    this.groqApiKey = config.groqApiKey || null;
    
    if (!this.groqApiKey) {
      logger.warn('⚠️ No Groq API key configured. Set GROQ_API_KEY');
    } else {
      logger.info('✅ Using Groq API for LLM calls');
    }
  }

  async generateResponse(
    messages: LLMMessage[],
    options: {
      model?: string;
      maxTokens?: number;
      temperature?: number;
      responseFormat?: { type: 'json_object' };
    } = {}
  ): Promise<LLMResponse> {
    if (!this.groqApiKey) {
      throw new Error('Groq API key not configured. Set GROQ_API_KEY');
    }
    return this.callGroq(messages, options);
  }

  private async callGroq(
    messages: LLMMessage[],
    options: any
  ): Promise<LLMResponse> {
    // ✅ List of supported Groq models (try in order if one fails)
    const supportedModels = [
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant',
      'llama-3.1-70b-versatile',
      'llama-3-groq-70b-tool-use'
    ];
    
    const modelToUse = options.model || supportedModels[0];
    let lastError: Error | null = null;

    // Try the requested/default model first
    for (const model of [modelToUse, ...supportedModels.filter(m => m !== modelToUse)]) {
      try {
        logger.info(`🔄 Trying Groq model: ${model}`);
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
            // ✅ FIX: Convert responseFormat to response_format for Groq API (OpenAI-compatible)
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
          
          // If model is decommissioned, try next model
          if (errorData.error?.code === 'model_decommissioned' || errorText.includes('decommissioned')) {
            logger.warn(`⚠️ Model ${model} is decommissioned, trying next model...`);
            lastError = new Error(`Model ${model} decommissioned`);
            continue; // Try next model
          }
          
          logger.error(`Groq API error: ${response.status} ${errorText}`);
          throw new Error(`Groq API error: ${response.status} ${errorText}`);
        }

        const data = await response.json() as {
          choices: Array<{ message: { content: string } }>;
          usage?: { total_tokens: number };
        };
        
        logger.info(`✅ Successfully used Groq model: ${model}`);
        const responseObj: LLMResponse = {
          content: data.choices[0]?.message?.content?.trim() || '',
          model: model
        };
        if (data.usage?.total_tokens) {
          responseObj.tokensUsed = data.usage.total_tokens;
        }
        return responseObj;
      } catch (error: any) {
        // If it's a model decommissioned error, try next model
        if (error.message?.includes('decommissioned') || error.message?.includes('model_decommissioned')) {
          logger.warn(`⚠️ Model ${model} failed, trying next model...`);
          lastError = error;
          continue;
        }
        // For other errors, throw immediately
        throw error;
      }
    }

    // If all models failed
    logger.error('❌ All Groq models failed');
    throw lastError || new Error('All Groq models failed. Please check Groq API status.');
  }
}

export const llmClient = new LLMClient();

