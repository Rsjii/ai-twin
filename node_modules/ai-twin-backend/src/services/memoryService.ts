import { db } from '../config/database';
import { logger } from '../config/logger';
import { generateId } from '../utils/idGenerator';
// COMMENTED OUT: OpenAI - Now using Groq via llmClient
// import OpenAI from 'openai';

// const openai = new OpenAI({
//   apiKey: config.openaiApiKey,
// });

// NEW: Import llmClient
import { llmClient } from './llmClient';
/**
 * Memory Service - Handles session and long-term memory management
 */
export class MemoryService {
  
  /**
   * Create or update session memory for a chat
   */
  async createOrUpdateSessionMemory(
    chatId: string,
    messages: Array<{content: string, sender: string, timestamp: Date}>
  ): Promise<void> {
    try {
      // Get existing session memory
      const existingResult = await db.query(
        'SELECT id, summary, "keyTopics", "messageCount" FROM "MemorySession" WHERE "chatId" = $1',
        [chatId]
      );

      // Generate summary from messages
      const summary = await this.generateSessionSummary(messages);
      const keyTopics = await this.extractKeyTopics(messages);

      const sessionVector = {
        summary,
        keyTopics,
        messageCount: messages.length,
        lastUpdated: new Date().toISOString()
      };

      if (existingResult.rows.length > 0) {
        // Update existing
        const utcTimestamp = new Date().toISOString();
        await db.query(
          `UPDATE "MemorySession" 
           SET summary = $1, "keyTopics" = $2, vector = $3, "messageCount" = $4, "lastUpdated" = $5::timestamptz
           WHERE "chatId" = $5`,
          [summary, keyTopics, JSON.stringify(sessionVector), messages.length, utcTimestamp, chatId]
        );
        logger.info(`Updated session memory for chat: ${chatId}`);
      } else {
        // Create new
        const id = generateId.memSess();
        const utcTimestamp = new Date().toISOString();
        await db.query(
          `INSERT INTO "MemorySession" (id, "chatId", summary, "keyTopics", vector, "messageCount", "lastUpdated")
           VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz)`,
          [id, chatId, summary, keyTopics, JSON.stringify(sessionVector), messages.length, utcTimestamp]
        );
        logger.info(`Created session memory for chat: ${chatId}`);
      }
    } catch (error) {
      logger.error('Error creating session memory:', error);
      throw error;
    }
  }

  /**
   * Get session memory for a chat
   */
  async getSessionMemory(chatId: string): Promise<any | null> {
    try {
      const result = await db.query(
        'SELECT summary, "keyTopics", vector FROM "MemorySession" WHERE "chatId" = $1',
        [chatId]
      );
      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      logger.error('Error getting session memory:', error);
      return null;
    }
  }

  /**
   * Extract long-term facts from session summary
   */
  async extractLongTermFacts(twinId: string, sessionSummary: string): Promise<void> {
    try {
      const facts = await this.identifyFactsFromSummary(sessionSummary);
      
      for (const fact of facts) {
        await this.storeLongTermMemory(twinId, fact.key, fact.value, fact.category);
      }
      
      logger.info(`Extracted ${facts.length} facts for twin: ${twinId}`);
    } catch (error) {
      logger.error('Error extracting long-term facts:', error);
    }
  }

  /**
   * Get long-term memories for a twin
   */
  async getLongTermMemories(
    twinId: string, 
    category?: string,
    limit: number = 10
  ): Promise<Array<{key: string, value: string, category: string}>> {
    try {
      let query = 'SELECT key, value, category FROM "MemoryLongTerm" WHERE "twinId" = $1';
      const params: any[] = [twinId];
      
      if (category) {
        query += ' AND category = $2';
        params.push(category);
        query += ' ORDER BY "updatedAt" DESC LIMIT $3';
        params.push(limit);
      } else {
        query += ' ORDER BY "updatedAt" DESC LIMIT $2';
        params.push(limit);
      }
      
      const result = await db.query(query, params);
      return result.rows;
    } catch (error) {
      logger.error('Error getting long-term memories:', error);
      return [];
    }
  }

  /**
 * Keyword synonyms mapping for flexible memory retrieval
 * Maps common query patterns to memory keys
 */
private getKeywordMapping(): Map<string, string[]> {
    return new Map([
      // Name-related queries
      ['name', ['name', 'naam', 'who am i', 'mera naam', 'what is my name', 'my name', 'apka naam', 'your name', 'identity']],
      
      // Age/Date related
      ['age', ['age', 'umar', 'how old', 'kitne saal', 'birthday', 'janam din', 'born', 'date of birth']],
      
      // Job/Work related
      ['job', ['job', 'kaam', 'work', 'profession', 'occupation', 'kya karte ho', 'what do you do', 'career', 'business']],
      
      // Location related
      ['city', ['city', 'sheher', 'where', 'kahan', 'location', 'place', 'address', 'live', 'rahte']],
      
      // Preference related
      ['preference', ['favorite', 'pasand', 'like', 'prefer', 'preference', 'achha lagta', 'best', 'favourite']],
      
      // Hobby/Interest related
      ['interest', ['hobby', 'interest', 'shauk', 'pasand', 'kya pasand hai', 'enjoy', 'love doing']],
      
      // Family/Relationship related
      ['relationship', ['family', 'parivar', 'relative', 'relationship', 'sibling', 'brother', 'sister', 'father', 'mother', 'parent']],
      
      // General facts
      ['fact', ['fact', 'know', 'remember', 'tell me about', 'information', 'details']],
    ]);
  }
  
  /**
   * Extract relevant keywords from user message
   * Returns array of memory keys that match the query
   */
  private extractMemoryKeywords(userMessage: string): string[] {
    const text = userMessage.toLowerCase().trim();
    const mapping = this.getKeywordMapping();
    const matchedKeys: string[] = [];
    
    // Check for keyword matches in message
    for (const [key, synonyms] of mapping.entries()) {
      // Check if any synonym appears in message
      const matched = synonyms.some(synonym => {
        // Exact word match or phrase match
        return text.includes(synonym.toLowerCase()) || 
               new RegExp(`\\b${synonym}\\b`, 'i').test(text);
      });
      
      if (matched) {
        matchedKeys.push(key);
      }
    }
    
    // Also detect category keywords directly
    if (text.includes('prefer') || text.includes('like') || text.includes('favorite') || text.includes('pasand')) {
      matchedKeys.push('preference');
    }
    if (text.includes('fact') || text.includes('know') || text.includes('remember') || text.includes('about')) {
      matchedKeys.push('fact');
    }
    if (text.includes('friend') || text.includes('family') || text.includes('relationship') || text.includes('relative')) {
      matchedKeys.push('relationship');
    }
    
    // Remove duplicates
    return [...new Set(matchedKeys)];
  }

  /**
 * Get relevant long-term memories (SMART HYBRID APPROACH)
 * Strategy:
 * 1. Always include top 5 most recent/common memories
 * 2. Add query-specific memories based on keyword matching (up to 5 more)
 * 3. Total max: 10 memories
 * 
 * @param twinId - Twin ID
 * @param userMessage - User's current message for context matching
 * @param limit - Maximum memories to return (default: 10)
 */
async getRelevantLongTermMemories(
    twinId: string,
    userMessage: string,
    limit: number = 10
  ): Promise<Array<{key: string, value: string, category: string}>> {
    try {
      // LAYER 1: Always get top 5 most recent memories (common/cached)
      const commonMemories = await this.getLongTermMemories(twinId, undefined, 5);
      
      // If no user message, just return common memories
      if (!userMessage || userMessage.trim().length === 0) {
        return commonMemories.slice(0, limit);
      }
      
      // LAYER 2: Extract keywords from user message
      const keywords = this.extractMemoryKeywords(userMessage);
      
      logger.info(`Extracted keywords from user message: ${keywords.join(', ')}`);
      
      // LAYER 3: Get query-specific memories
      let queryMemories: Array<{key: string, value: string, category: string}> = [];
      
      if (keywords.length > 0) {
        // OPTIMIZED: Single query with PostgreSQL array operators instead of loop
        const topKeywords = keywords.slice(0, 3); // Limit to top 3 keywords
        const searchPatterns = topKeywords.map(k => `%${k}%`);
        
        // Strategy A: Match by memory KEY using single query with ANY()
        try {
          const keyMatches = await db.query(
            `SELECT DISTINCT ON (key) key, value, category 
             FROM "MemoryLongTerm" 
             WHERE "twinId" = $1 
             AND (
               key = ANY($2::text[]) OR
               key ILIKE ANY($3::text[]) OR
               value ILIKE ANY($3::text[])
             )
             ORDER BY key, "updatedAt" DESC 
             LIMIT 5`,
            [twinId, topKeywords, searchPatterns]
          );
          
          queryMemories.push(...keyMatches.rows.map(r => ({
            key: r.key,
            value: r.value,
            category: r.category
          })));
        } catch (error) {
          logger.warn('Optimized memory query failed, falling back to simple search:', error);
          // Fallback: simpler query
          const fallbackQuery = await db.query(
            `SELECT key, value, category 
             FROM "MemoryLongTerm" 
             WHERE "twinId" = $1 
             ORDER BY "updatedAt" DESC 
             LIMIT 5`,
            [twinId]
          );
          queryMemories.push(...fallbackQuery.rows.map(r => ({
            key: r.key,
            value: r.value,
            category: r.category
          })));
        }
        
        // Strategy B: Match by category (if keyword matches a category)
        const categoryMap: {[key: string]: string} = {
          'preference': 'preference',
          'interest': 'interest',
          'relationship': 'relationship',
          'fact': 'fact',
          'context': 'context'
        };
        
        // Get category memories in parallel if multiple categories match
        const categoryPromises = keywords
          .map(keyword => categoryMap[keyword])
          .filter((cat, idx, arr) => cat && arr.indexOf(cat) === idx) // Unique categories
          .map(category => this.getLongTermMemories(twinId, category, 3));
        
        if (categoryPromises.length > 0) {
          const categoryResults = await Promise.all(categoryPromises);
          categoryResults.forEach(memories => {
            queryMemories.push(...memories);
          });
        }
      }
      
      // Combine and deduplicate by key
      const allMemories = [...commonMemories, ...queryMemories];
      const uniqueMap = new Map<string, {key: string, value: string, category: string}>();
      
      // Add common memories first (priority)
      commonMemories.forEach(mem => {
        uniqueMap.set(mem.key, mem);
      });
      
      // Add query memories (don't overwrite common ones)
      queryMemories.forEach(mem => {
        if (!uniqueMap.has(mem.key)) {
          uniqueMap.set(mem.key, mem);
        }
      });
      
      const uniqueMemories = Array.from(uniqueMap.values());
      
      // Limit to requested amount
      const result = uniqueMemories.slice(0, limit);
      
      logger.info(`Retrieved ${result.length} relevant long-term memories (${commonMemories.length} common + ${queryMemories.length} query-specific)`);
      
      return result;
      
    } catch (error) {
      logger.error('Error getting relevant long-term memories:', error);
      // Fallback: return common memories only
      try {
        return await this.getLongTermMemories(twinId, undefined, Math.min(limit, 5));
      } catch (fallbackError) {
        logger.error('Fallback memory retrieval also failed:', fallbackError);
        return [];
      }
    }
  }

  /**
   * Store a long-term memory
   */
  async storeLongTermMemory(
    twinId: string,
    key: string,
    value: string,
    category: string = 'fact',
    source: string = 'session'
  ): Promise<void> {
    try {
      const id = generateId.memLt();
      const utcTimestamp = new Date().toISOString();
      await db.query(
        `INSERT INTO "MemoryLongTerm" (id, "twinId", key, value, category, source, "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz)
         ON CONFLICT ("twinId", key) 
         DO UPDATE SET value = EXCLUDED.value, category = EXCLUDED.category, "updatedAt" = $7::timestamptz)`,
        [id, twinId, key, value, category, source, utcTimestamp]
      );
      
      logger.info(`Stored long-term memory for twin ${twinId}: ${key}`);
    } catch (error) {
      logger.error('Error storing long-term memory:', error);
    }
  }

    /**
   * Store style pattern (phrase or pattern)
   * Converts voice patterns to style anchors
   */
    async storeStylePattern(
        twinId: string,
        pattern: string,
        type: 'phrase' | 'pattern' = 'phrase',
        patternType?: 'greeting' | 'agreement' | 'disagreement' | 'question',
        context?: string
      ): Promise<void> {
        try {
          const { styleAnchorsQueries } = await import('../config/database');
          
          if (type === 'phrase') {
            // Store as phrase
            await styleAnchorsQueries.create(
              twinId,
              '', // No user utterance for phrases
              '', // No ideal reply for phrases
              ['phrase', 'auto'], // Tags
              'phrase',
              pattern,
              undefined,
              context
            );
            
            logger.info(`Stored style phrase for twin ${twinId}: ${pattern}`);
          } else {
            // Store as pattern
            await styleAnchorsQueries.create(
              twinId,
              pattern, // Pattern examples go here
              '', // No ideal reply needed
              ['pattern', 'auto'],
              'pattern',
              undefined,
              patternType,
              context
            );
            
            logger.info(`Stored style pattern for twin ${twinId}: ${pattern} (${patternType})`);
          }
        } catch (error) {
          logger.error('Error storing style pattern:', error);
          throw error;
        }
      }
    
      /**
       * Get relevant style patterns for a query
       */
      async getRelevantStylePatterns(
        twinId: string,
        userMessage: string,
        limit: number = 3
      ): Promise<Array<{
        type: string;
        phrase?: string;
        userUtterance?: string;
        idealReply?: string;
        patternType?: string;
        context?: string;
      }>> {
        try {
          const { styleAnchorsQueries } = await import('../config/database');
          
          // Get most similar interaction anchors (top 2)
          const interactionAnchors = await styleAnchorsQueries.findByTwinAndSimilarity(
            twinId,
            userMessage,
            2, // Max 2 interactions
            'interaction'
          );
          
          // Get common phrases (top 2)
          const phraseAnchors = await styleAnchorsQueries.findPhrasesByTwinId(twinId, 2);
          
          // Combine results
          const results: Array<{
            type: string;
            phrase?: string;
            userUtterance?: string;
            idealReply?: string;
            patternType?: string;
            context?: string;
          }> = [];
          
          // Add interaction anchors
          interactionAnchors.forEach(a => {
            results.push({
              type: 'interaction',
              userUtterance: a.user_utterance,
              idealReply: a.ideal_reply
            });
          });
          
          // Add phrases
          phraseAnchors.forEach(p => {
            results.push({
              type: 'phrase',
              phrase: p.phrase,
              context: p.context || undefined
            });
          });
          
          // Limit to requested amount
          return results.slice(0, limit);
        } catch (error) {
          logger.error('Error getting style patterns:', error);
          return [];
        }
      }

  /**
   * Generate session summary using OpenAI
   */
  private async generateSessionSummary(
    messages: Array<{content: string, sender: string, timestamp: Date}>
  ): Promise<string> {
    try {
      if (messages.length === 0) return 'No conversation yet.';

      const conversationText = messages
        .map(msg => `${msg.sender === 'human' ? 'User' : 'AI'}: ${msg.content}`)
        .join('\n');

      const prompt = `Summarize this conversation in 2-3 sentences. Focus on key topics, decisions, and important context:

${conversationText}

Provide a concise summary:`;

      // COMMENTED OUT: OpenAI call - Now using Groq via llmClient
      // const response = await openai.chat.completions.create({
      //   model: 'gpt-4o-mini',
      //   messages: [
      //     { role: 'system', content: 'You are a conversation summarizer. Create concise summaries.' },
      //     { role: 'user', content: prompt }
      //   ],
      //   temperature: 0.3,
      //   max_tokens: 200,
      // });

      // NEW: Using Groq via llmClient
      const llmResponse = await llmClient.generateResponse([
        { role: 'system', content: 'You are a conversation summarizer. Create concise summaries.' },
        { role: 'user', content: prompt }
      ], {
        temperature: 0.3,
        maxTokens: 200
      });

      return llmResponse.content.trim() || 'Conversation summary unavailable.';
    } catch (error) {
      logger.error('Error generating session summary:', error);
      return 'Summary generation failed.';
    }
  }

  /**
   * Extract key topics from messages
   */
  private async extractKeyTopics(
    messages: Array<{content: string, sender: string, timestamp: Date}>
  ): Promise<string[]> {
    try {
      if (messages.length === 0) return [];

      const conversationText = messages
        .map(msg => msg.content)
        .join('\n');

      const prompt = `Extract the main topics discussed in this conversation. Return a JSON array of 3-5 topics:

${conversationText}

Return only JSON array, example: ["topic1", "topic2", "topic3"]`;

      // COMMENTED OUT: OpenAI call - Now using Groq via llmClient
      // const response = await openai.chat.completions.create({
      //   model: 'gpt-4o-mini',
      //   messages: [
      //     { role: 'system', content: 'You extract topics from conversations. Return only JSON arrays.' },
      //     { role: 'user', content: prompt }
      //   ],
      //   temperature: 0.3,
      //   max_tokens: 100,
      // });

      // NEW: Using Groq via llmClient
      const llmResponse = await llmClient.generateResponse([
        { role: 'system', content: 'You extract topics from conversations. Return only JSON arrays.' },
        { role: 'user', content: prompt }
      ], {
        temperature: 0.3,
        maxTokens: 100
      });

      const content = llmResponse.content.trim();
      if (content) {
        return JSON.parse(content);
      }
      return [];
    } catch (error) {
      logger.error('Error extracting topics:', error);
      return [];
    }
  }

  /**
   * Identify facts from summary that should be stored long-term
   */
  private async identifyFactsFromSummary(summary: string): Promise<Array<{key: string, value: string, category: string}>> {
    try {
      const prompt = `Analyze this conversation summary and extract important facts that should be remembered long-term. 
Return a JSON array with objects containing: key, value, category.

Categories: 'fact', 'preference', 'relationship', 'context', 'interest'

Summary: ${summary}

Return only valid JSON array, example:
[{"key": "favorite_color", "value": "blue", "category": "preference"}, {"key": "birthday", "value": "March 15", "category": "fact"}]

If no important facts, return empty array [].`;

      // COMMENTED OUT: OpenAI call - Now using Groq via llmClient
      // const response = await openai.chat.completions.create({
      //   model: 'gpt-4o-mini',
      //   messages: [
      //     { role: 'system', content: 'You extract facts from summaries. Return only valid JSON arrays.' },
      //     { role: 'user', content: prompt }
      //   ],
      //   temperature: 0.3,
      //   max_tokens: 300,
      // });

      // NEW: Using Groq via llmClient
      const llmResponse = await llmClient.generateResponse([
        { role: 'system', content: 'You extract facts from summaries. Return only valid JSON arrays.' },
        { role: 'user', content: prompt }
      ], {
        temperature: 0.3,
        maxTokens: 300
      });

      const content = llmResponse.content.trim();
      if (content) {
        return JSON.parse(content);
      }
      return [];
    } catch (error) {
      logger.error('Error identifying facts:', error);
      return [];
    }
  }

  /**
   * Delete old session memories (cleanup)
   */
  async cleanupOldSessionMemories(daysOld: number = 30): Promise<void> {
    try {
      const result = await db.query(
        'DELETE FROM "MemorySession" WHERE "lastUpdated" < NOW() - INTERVAL \'${daysOld} days\''
      );
      logger.info(`Cleaned up ${result.rowCount} old session memories`);
    } catch (error) {
      logger.error('Error cleaning up session memories:', error);
    }
  }
}

export const memoryService = new MemoryService();