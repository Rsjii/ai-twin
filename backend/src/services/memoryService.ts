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
 * Pinned facts structure (persists for entire chat session)
 */
type PinnedFacts = {
  name?: string;
  likes?: string[];
  hobbies?: string[];
  extras?: string[]; // ✅ NEW: Everything else (locations, trips, etc.)
};

/**
 * Helper: Merge unique items into array (case-insensitive, capped)
 */
function mergeUnique(prev: string[] = [], add: string[] = [], max = 10): string[] {
  const out: string[] = [...prev];
  const set = new Set(out.map(s => s.toLowerCase()));
  for (const v of add) {
    const t = (v || '').trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (!set.has(k)) {
      set.add(k);
      out.push(t);
    }
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Memory Service - Handles session and long-term memory management
 */
export class MemoryService {
  
  /**
   * Create or update session memory for a chat
   * Supports incremental updates (delta mode) for cost optimization
   */
  async createOrUpdateSessionMemory(
    chatId: string,
    messages: Array<{content: string, sender: string, timestamp: Date}>,
    options?: { mode?: 'full' | 'delta'; pinnedFactsDelta?: Partial<PinnedFacts> }
  ): Promise<void> {
    try {
      const mode = options?.mode ?? 'full';

      // Get existing session memory (including vector for lastUpdated)
      const existingResult = await db.query(
        'SELECT id, summary, "keyTopics", "messageCount", vector FROM "MemorySession" WHERE "chatId" = $1',
        [chatId]
      );

      const existing = existingResult.rows.length > 0 ? existingResult.rows[0] : null;

      // Parse previous pinnedFacts from vector
      let prevPinnedFacts: PinnedFacts = {};
      if (existing?.vector) {
        try {
          const vec = typeof existing.vector === 'string' ? JSON.parse(existing.vector) : existing.vector;
          prevPinnedFacts = (vec?.pinnedFacts || {}) as PinnedFacts;
        } catch {
          prevPinnedFacts = {};
        }
      }

      const pinnedDelta = (options?.pinnedFactsDelta || {}) as Partial<PinnedFacts>;

      // Merge rules:
      // - name: overwrite if provided
      // - likes/hobbies/extras: add unique items, cap size
      const mergedPinnedFacts: PinnedFacts = {
        ...prevPinnedFacts,
        ...(pinnedDelta.name ? { name: pinnedDelta.name } : {}),
        likes: mergeUnique(prevPinnedFacts.likes || [], pinnedDelta.likes || []),
        hobbies: mergeUnique(prevPinnedFacts.hobbies || [], pinnedDelta.hobbies || []),
        extras: mergeUnique(prevPinnedFacts.extras || [], pinnedDelta.extras || []), // ✅ NEW
      };

      if (pinnedDelta.name || pinnedDelta.likes?.length || pinnedDelta.hobbies?.length || pinnedDelta.extras?.length) {
        console.log('[MEMORY_SERVICE] [PINNED_FACTS] Merging pinned facts:', {
          chatId,
          delta: pinnedDelta,
          previous: prevPinnedFacts,
          merged: mergedPinnedFacts,
        });
      }

      const prevSummary: string = (existing?.summary || '').toString();
      const prevTopics: string[] = Array.isArray(existing?.keyTopics) ? existing.keyTopics : [];
      const prevCount: number = typeof existing?.messageCount === 'number' ? existing.messageCount : 0;

      const utcNow = new Date().toISOString();

      let summary: string;
      let keyTopics: string[];

      if (mode === 'delta' && existing) {
        // Incremental: update previous summary with new messages only
        console.log('[MEMORY_SERVICE] [HYP-H] Incremental summary update (delta mode):', {
          chatId,
          prevSummaryLength: prevSummary.length,
          newMessagesCount: messages.length
        });
        summary = await this.generateSessionSummaryIncremental(prevSummary, messages);
        const deltaTopics = await this.extractKeyTopics(messages);
        keyTopics = this.mergeTopics(prevTopics, deltaTopics, 12);
        console.log('[MEMORY_SERVICE] [HYP-H] Delta summary generated:', {
          newSummaryLength: summary.length,
          keyTopicsCount: keyTopics.length
        });
      } else {
        // Full: regenerate from all messages
        console.log('[MEMORY_SERVICE] [HYP-C] Full summary generation (no existing summary):', {
          chatId,
          messagesCount: messages.length
        });
        summary = await this.generateSessionSummary(messages);
        keyTopics = await this.extractKeyTopics(messages);
        console.log('[MEMORY_SERVICE] [HYP-C] Full summary generated:', {
          summaryLength: summary.length,
          keyTopicsCount: keyTopics.length
        });
      }

      const messageCount = mode === 'delta' && existing ? (prevCount + messages.length) : messages.length;

      const sessionVector = {
        summary,
        keyTopics,
        messageCount,
        lastUpdated: utcNow,
        pinnedFacts: mergedPinnedFacts, // ✅ Part 1 (persists for whole chat)
      };

      if (existing) {
        // Update existing (using id instead of chatId to ensure single row update)
        await db.query(
          `UPDATE "MemorySession" 
           SET summary = $1, "keyTopics" = $2, vector = $3, "messageCount" = $4, "lastUpdated" = $5::timestamptz
           WHERE id = $6`,
          [summary, keyTopics, JSON.stringify(sessionVector), messageCount, utcNow, existing.id]
        );
        logger.info(`Updated session memory for chat: ${chatId} (${mode})`);
      } else {
        // Create new
        const id = generateId.memSess();
        await db.query(
          `INSERT INTO "MemorySession" (id, "chatId", summary, "keyTopics", vector, "messageCount", "lastUpdated")
           VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz)`,
          [id, chatId, summary, keyTopics, JSON.stringify(sessionVector), messageCount, utcNow]
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
   * Create or update PUBLIC session memory for a chat
   * Supports incremental updates (delta mode) for cost optimization
   */
  async createOrUpdatePublicSessionMemory(
    chatId: string,
    messages: Array<{content: string, sender: string, timestamp: Date}>,
    options?: { mode?: 'full' | 'delta'; pinnedFactsDelta?: Partial<PinnedFacts> }
  ): Promise<void> {
    try {
      const mode = options?.mode ?? 'full';

      // Get existing session memory (including vector for lastUpdated)
      const existingResult = await db.query(
        'SELECT id, summary, "keyTopics", "messageCount", vector FROM "MemorySessionPublic" WHERE "chatId" = $1',
        [chatId]
      );

      const existing = existingResult.rows.length > 0 ? existingResult.rows[0] : null;

      // Parse previous pinnedFacts from vector
      let prevPinnedFacts: PinnedFacts = {};
      if (existing?.vector) {
        try {
          const vec = typeof existing.vector === 'string' ? JSON.parse(existing.vector) : existing.vector;
          prevPinnedFacts = (vec?.pinnedFacts || {}) as PinnedFacts;
        } catch {
          prevPinnedFacts = {};
        }
      }

      const pinnedDelta = (options?.pinnedFactsDelta || {}) as Partial<PinnedFacts>;

      // Merge rules:
      // - name: overwrite if provided
      // - likes/hobbies/extras: add unique items, cap size
      const mergedPinnedFacts: PinnedFacts = {
        ...prevPinnedFacts,
        ...(pinnedDelta.name ? { name: pinnedDelta.name } : {}),
        likes: mergeUnique(prevPinnedFacts.likes || [], pinnedDelta.likes || []),
        hobbies: mergeUnique(prevPinnedFacts.hobbies || [], pinnedDelta.hobbies || []),
        extras: mergeUnique(prevPinnedFacts.extras || [], pinnedDelta.extras || []), // ✅ NEW
      };

      if (pinnedDelta.name || pinnedDelta.likes?.length || pinnedDelta.hobbies?.length || pinnedDelta.extras?.length) {
        console.log('[MEMORY_SERVICE] [PINNED_FACTS] [PUBLIC] Merging pinned facts:', {
          chatId,
          delta: pinnedDelta,
          previous: prevPinnedFacts,
          merged: mergedPinnedFacts,
        });
      }

      const prevSummary: string = (existing?.summary || '').toString();
      const prevTopics: string[] = Array.isArray(existing?.keyTopics) ? existing.keyTopics : [];
      const prevCount: number = typeof existing?.messageCount === 'number' ? existing.messageCount : 0;

      const utcNow = new Date().toISOString();

      let summary: string;
      let keyTopics: string[];

      if (mode === 'delta' && existing) {
        summary = await this.generateSessionSummaryIncremental(prevSummary, messages);
        const deltaTopics = await this.extractKeyTopics(messages);
        keyTopics = this.mergeTopics(prevTopics, deltaTopics, 12);
        console.log('[MEMORY_SERVICE] [PUBLIC] Incremental summary generated:', {
          chatId,
          prevLength: prevSummary.length,
          newLength: summary.length,
          deltaMessages: messages.length
        });
      } else {
        summary = await this.generateSessionSummary(messages);
        keyTopics = await this.extractKeyTopics(messages);
        console.log('[MEMORY_SERVICE] [PUBLIC] Full summary generated:', {
          chatId,
          summaryLength: summary.length,
          messageCount: messages.length
        });
      }

      const messageCount = mode === 'delta' && existing ? (prevCount + messages.length) : messages.length;

      const sessionVector = {
        summary,
        keyTopics,
        messageCount,
        lastUpdated: utcNow,
        pinnedFacts: mergedPinnedFacts,
      };

      if (existing) {
        await db.query(
          `UPDATE "MemorySessionPublic"
           SET summary = $1, "keyTopics" = $2, vector = $3, "messageCount" = $4, "lastUpdated" = $5::timestamptz
           WHERE id = $6`,
          [summary, keyTopics, JSON.stringify(sessionVector), messageCount, utcNow, existing.id]
        );
        logger.info(`Updated PUBLIC session memory for chat: ${chatId} (${mode})`);
        console.log('[MEMORY_SERVICE] [PUBLIC] Session memory updated:', { chatId, mode });
      } else {
        // Create new
        const id = generateId.memSess();
        await db.query(
          `INSERT INTO "MemorySessionPublic" (id, "chatId", summary, "keyTopics", vector, "messageCount", "lastUpdated")
           VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz)`,
          [id, chatId, summary, keyTopics, JSON.stringify(sessionVector), messageCount, utcNow]
        );
        logger.info(`Created PUBLIC session memory for chat: ${chatId}`);
        console.log('[MEMORY_SERVICE] [PUBLIC] Session memory created:', { chatId, id });
      }
    } catch (error) {
      logger.error('Error creating PUBLIC session memory:', error);
      console.error('[MEMORY_SERVICE] [PUBLIC] Error creating/updating session memory:', error);
      throw error;
    }
  }

  /**
   * Get PUBLIC session memory for a chat
   */
  async getPublicSessionMemory(chatId: string): Promise<any | null> {
    try {
      const result = await db.query(
        'SELECT summary, "keyTopics", vector FROM "MemorySessionPublic" WHERE "chatId" = $1',
        [chatId]
      );
      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      logger.error('Error getting PUBLIC session memory:', error);
      return null;
    }
  }

  /**
   * Extract long-term facts from session summary
   */
  async extractLongTermFacts(twinId: string, sessionSummary: string): Promise<void> {
    try {
      console.log('[MEMORY_SERVICE] [HYP-D] Extracting long-term facts:', {
        twinId,
        summaryLength: sessionSummary.length
      });
      const facts = await this.identifyFactsFromSummary(sessionSummary);
      console.log('[MEMORY_SERVICE] [HYP-D] Facts identified:', facts.length);
      
      for (const fact of facts) {
        await this.storeLongTermMemory(twinId, fact.key, fact.value, fact.category);
        console.log('[MEMORY_SERVICE] [HYP-D] Fact stored:', { key: fact.key, category: fact.category });
      }
      
      logger.info(`Extracted ${facts.length} facts for twin: ${twinId}`);
      console.log('[MEMORY_SERVICE] [HYP-D] Long-term memory update completed:', facts.length, 'facts');
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
    limit: number = 10,
    visibility: 'owner' | 'public_twin' | 'all' = 'all'
  ): Promise<Array<{key: string, value: string, category: string, visibility: string}>> {
    try {
      let query = 'SELECT key, value, category, visibility FROM "MemoryLongTerm" WHERE "twinId" = $1';
      const params: any[] = [twinId];
      
      if (visibility !== 'all') {
        // ✅ FIX: owner can see owner + public_twin + public + all (enhanced/private sees everything), public_twin can see public_twin + public + all
        // Include 'public' for backward compatibility with legacy rows
        query += ` AND visibility = ANY($${params.length + 1}::text[])`;
        params.push(visibility === 'owner' ? ['owner', 'public_twin', 'public', 'all'] : ['public_twin', 'public', 'all']);
      }

      if (category) {
        query += ` AND category = $${params.length + 1}`;
        params.push(category);
      }
      
      query += ` ORDER BY "updatedAt" DESC LIMIT $${params.length + 1}`;
      params.push(limit);
      
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
    limit: number = 10,
    category?: string,
    visibility: 'owner' | 'public_twin' | 'all' = 'all'
  ): Promise<Array<{key: string, value: string, category: string, visibility?: string}>> {
    try {
      console.log('[MEMORY_SERVICE] [GET_RELEVANT] Starting retrieval:', {
        twinId,
        userMessageLength: userMessage?.length || 0,
        limit,
        category,
        visibility
      });
      
      // LAYER 1: Always get top 5 most recent memories (common/cached)
      const commonMemories = await this.getLongTermMemories(twinId, category, 5, visibility);
      console.log('[MEMORY_SERVICE] [GET_RELEVANT] Common memories retrieved:', commonMemories.length);
      
      // If no user message, just return common memories
      if (!userMessage || userMessage.trim().length === 0) {
        return commonMemories.slice(0, limit);
      }
      
      // LAYER 2: Extract keywords from user message
      const keywords = this.extractMemoryKeywords(userMessage);
      
      logger.info(`Extracted keywords from user message: ${keywords.join(', ')}`);
      
      // LAYER 3: Get query-specific memories
      let queryMemories: Array<{key: string, value: string, category: string, visibility?: string}> = [];
      
      if (keywords.length > 0) {
        // OPTIMIZED: Single query with PostgreSQL array operators instead of loop
        const topKeywords = keywords.slice(0, 3); // Limit to top 3 keywords
        
        // ✅ FIX: Expand keywords using synonyms (e.g., "preference" → ["preference", "like", "favorite", "pasand", ...])
        const mapping = this.getKeywordMapping();
        const expandedTerms = topKeywords
          .flatMap(k => [k, ...(mapping.get(k) || [])])
          .map(s => String(s).toLowerCase().trim())
          .filter(s => s.length >= 3);
        
        const uniqueTerms = Array.from(new Set(expandedTerms)).slice(0, 12);
        const searchPatterns = uniqueTerms.map(t => `%${t}%`);
        
        console.log('[MEMORY_SERVICE] [GET_RELEVANT] Expanded search terms:', { keywords: topKeywords, expanded: uniqueTerms });
        
        // Strategy A: Match by memory KEY using single query with ANY()
        try {
          const params: any[] = [twinId, topKeywords, searchPatterns];
          let sql = `
            SELECT DISTINCT ON (key) key, value, category, visibility
            FROM "MemoryLongTerm" 
            WHERE "twinId" = $1
          `;

          if (category) {
            sql += ` AND category = $${params.length + 1}`;
            params.push(category);
          }

          if (visibility !== 'all') {
            // ✅ FIX: owner can see owner + public_twin + public + all (enhanced/private sees everything), public_twin can see public_twin + public + all
            // Include 'public' for backward compatibility with legacy rows
            sql += ` AND visibility = ANY($${params.length + 1}::text[])`;
            params.push(visibility === 'owner' ? ['owner', 'public_twin', 'public', 'all'] : ['public_twin', 'public', 'all']);
            console.log('[MEMORY_SERVICE] [GET_RELEVANT] Filtering by visibility:', visibility, '(inclusive: includes "all", "public_twin", and "public" for backward compatibility)');
          }

          sql += `
            AND (
              key = ANY($2::text[]) OR
              key ILIKE ANY($3::text[]) OR
              value ILIKE ANY($3::text[])
            )
            ORDER BY key, "updatedAt" DESC 
            LIMIT 5`;

          const keyMatches = await db.query(sql, params);
          console.log('[MEMORY_SERVICE] [GET_RELEVANT] Query matches found:', keyMatches.rows.length);
          
          queryMemories.push(...keyMatches.rows.map(r => ({
            key: r.key,
            value: r.value,
            category: r.category,
            visibility: r.visibility
          })));
        } catch (error) {
          logger.warn('Optimized memory query failed, falling back to simple search:', error);
          // Fallback: simpler query
          const params: any[] = [twinId];
          let sql = `SELECT key, value, category, visibility FROM "MemoryLongTerm" WHERE "twinId" = $1`;
          
          if (category) {
            sql += ` AND category = $${params.length + 1}`;
            params.push(category);
          }

          if (visibility !== 'all') {
            // ✅ FIX: owner can see owner + public_twin + public + all (enhanced/private sees everything), public_twin can see public_twin + public + all
            // Include 'public' for backward compatibility with legacy rows
            sql += ` AND visibility = ANY($${params.length + 1}::text[])`;
            params.push(visibility === 'owner' ? ['owner', 'public_twin', 'public', 'all'] : ['public_twin', 'public', 'all']);
          }
          sql += ` ORDER BY "updatedAt" DESC LIMIT 5`;

          const fallbackQuery = await db.query(sql, params);
          queryMemories.push(...fallbackQuery.rows.map(r => ({
            key: r.key,
            value: r.value,
            category: r.category,
            visibility: r.visibility
          })));
        }
        
        // Strategy B: Match by category (only when caller did NOT force a category)
        if (!category) {
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
            .map(category => this.getLongTermMemories(twinId, category, 3, visibility));
          
          if (categoryPromises.length > 0) {
            const categoryResults = await Promise.all(categoryPromises);
            categoryResults.forEach(memories => {
              queryMemories.push(...memories);
            });
          }
        }
      }
      
      // Combine and deduplicate by key
      const allMemories = [...commonMemories, ...queryMemories];
      const uniqueMap = new Map<string, {key: string, value: string, category: string, visibility?: string}>();
      
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
      console.log('[MEMORY_SERVICE] [GET_RELEVANT] ✅ Final memories returned:', {
        total: result.length,
        common: commonMemories.length,
        query: queryMemories.length,
        category,
        visibility,
        memoryKeys: result.map(m => m.key).slice(0, 5)
      });
      
      return result;
      
    } catch (error) {
      logger.error('Error getting relevant long-term memories:', error);
      // Fallback: return common memories only
      try {
        // ✅ FIX: Use 'category' instead of 'undefined' so fallbacks stay in their tab
        return await this.getLongTermMemories(twinId, category, Math.min(limit, 5), visibility);
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
    source: string = 'session',
    visibility?: 'owner' | 'public_twin' | 'all' | 'public'
  ): Promise<void> {
    try {
      const id = generateId.memLt();
      const utcTimestamp = new Date().toISOString();
      
      // ✅ FIX: Normalize and validate visibility
      let normalizedVisibility: 'owner' | 'public_twin' | 'all' | null = null;
      
      if (visibility !== undefined && visibility !== null) {
        const v = String(visibility).trim().toLowerCase();
        if (v === 'owner') {
          normalizedVisibility = 'owner';
        } else if (v === 'public' || v === 'public_twin') {
          normalizedVisibility = 'public_twin';
        } else if (v === 'all') {
          normalizedVisibility = 'all';
        }
        // Invalid values → null → defaults to 'owner' via COALESCE
      }
      
      // ✅ Auto-infer public_twin if key starts with 'shared_' or category is 'shared'
      if (!normalizedVisibility && (key.startsWith('shared_') || category.toLowerCase() === 'shared')) {
        normalizedVisibility = 'public_twin';
      }
      
      await db.query(
        `INSERT INTO "MemoryLongTerm" (id, "twinId", key, value, category, source, visibility, "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 'owner'), $8::timestamptz)
         ON CONFLICT ("twinId", key) 
         DO UPDATE SET 
            value = EXCLUDED.value, 
            category = EXCLUDED.category, 
            "updatedAt" = $8::timestamptz,
            visibility = COALESCE($7, "MemoryLongTerm".visibility)`,
        [id, twinId, key, value, category, source, normalizedVisibility, utcTimestamp]
      );
      
      logger.info(`Stored long-term memory for twin ${twinId}: ${key}`, {
        visibility: normalizedVisibility || 'owner',
        category
      });
    } catch (error) {
      logger.error('Error storing long-term memory:', error);
      throw error;
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
   * Generate incremental session summary (rolling update)
   * Updates previous summary with new messages, maintaining recency bias
   */
  private async generateSessionSummaryIncremental(
    previousSummary: string,
    deltaMessages: Array<{content: string, sender: string, timestamp: Date}>
  ): Promise<string> {
    if (!deltaMessages.length) return previousSummary || 'No conversation yet.';

    const deltaText = deltaMessages
      .map(m => `${m.sender === 'human' ? 'User' : 'AI'}: ${m.content}`)
      .join('\n');

    const prompt = `You maintain a rolling conversation state for an AI twin.

PREVIOUS STATE (may be empty):
${previousSummary || '(none)'}

NEW MESSAGES:
${deltaText}

Update the state. STRICT RULES:
- ALWAYS preserve the user's CURRENT REQUEST / ACTIVE TASK if any.
- ALWAYS preserve PROGRESS (e.g. quiz question count, score so far).
- NEVER introduce new topics the user did not request.
- Ignore greetings/smalltalk unless it changes the active task.
- Output ONLY 3-5 short lines in this exact format:

ACTIVE_TASK: <one line>
PROGRESS: <one line>
CONSTRAINTS: <one line or "none">
NOTES: <one line or "none">`;

    try {
      const llmResponse = await llmClient.generateResponse(
        [
          { role: 'system', content: 'You output a strict 4-line conversation STATE (ACTIVE_TASK/PROGRESS/CONSTRAINTS/NOTES). Follow the rules exactly.' },
          { role: 'user', content: prompt },
        ],
        { temperature: 0.2, maxTokens: 200 }  // ✅ Reduced from 220 (4-line STATE format is fixed length)
      );

      return llmResponse.content?.trim() || previousSummary || 'Conversation summary unavailable.';
    } catch (error) {
      logger.error('Error generating incremental session summary:', error);
      return previousSummary || 'No conversation yet.';
    }
  }

  /**
   * Extract pinned facts from messages using LLM (intelligent extraction)
   * Handles typos, context, and smart categorization
   */
  async extractPinnedFactsFromMessages(
    messages: Array<{content: string, sender: string, timestamp: Date}>
  ): Promise<{ name?: string; likes?: string[]; hobbies?: string[]; extras?: string[] }> {
    if (!messages.length) return {};

    // Only human messages (limit to last 5 for token efficiency)
    const humanMessages = messages
      .filter(m => m.sender === 'human')
      .map(m => m.content)
      .join('\n');

    if (!humanMessages.trim()) return {};

    const prompt = `Extract facts from messages. Return JSON only:
    - name: string or null
    - likes: string[] (max 10)
    - hobbies: string[] (max 10)
    - extras: string[] (max 10) - FULL phrases like "i am going to china", not just "china"
    
    Rules:
    - ONLY extract facts the user states about themselves (profile/preferences/plans).
    - NEVER store questions or requests as facts, not even in the extras.
    - "i am going to delhi" → extras: ["i am going to delhi"]
    - "my name is Raj" → name: "Raj"
    - "i like cricket" → likes: ["cricket"]
    - Handle typos, only extract if clear
    - If the message is only a question, return empty arrays and name=null
    
    Messages:
    ${humanMessages}
    
    JSON only: {"name": null, "likes": [], "hobbies": [], "extras": []}`;

try {
  const llmResponse = await llmClient.generateResponse(
    [
      { role: 'system', content: 'You extract structured facts from user messages. Return ONLY valid JSON, no other text.' },
      { role: 'user', content: prompt },
    ],
    { temperature: 0.2, maxTokens: 270 }  // ✅ Reduced from 300 (JSON responses are small)
  );

  const content = llmResponse.content?.trim() || '{}';
  console.log('[MEMORY_SERVICE] [PINNED_FACTS] LLM raw response:', content);
  
  // Remove markdown code blocks if present
  let jsonStr = content.replace(/on\n?/g, '').replace(/```\n?/g, '').trim();
  
  // Try to extract JSON if wrapped in text
  const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    jsonStr = jsonMatch[0];
  }
  
  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (parseError) {
    console.error('[MEMORY_SERVICE] [PINNED_FACTS] JSON parse error:', parseError);
    console.error('[MEMORY_SERVICE] [PINNED_FACTS] Failed to parse:', jsonStr);
    // Return safe default structure instead of empty object
    return {
      name: undefined,
      likes: undefined,
      hobbies: undefined,
      extras: undefined,
    };
  }
  
  return {
    name: parsed.name || undefined,
    likes: Array.isArray(parsed.likes) ? parsed.likes.filter(Boolean).slice(0, 10) : undefined,
    hobbies: Array.isArray(parsed.hobbies) ? parsed.hobbies.filter(Boolean).slice(0, 10) : undefined,
    extras: Array.isArray(parsed.extras) ? parsed.extras.filter(Boolean).slice(0, 10) : undefined,
  };
} catch (error) {
  logger.error('Error extracting pinned facts via LLM:', error);
  console.error('[MEMORY_SERVICE] [PINNED_FACTS] Full error details:', error);
  return {}; // Fallback to empty
}    
  }

  /**
   * Merge topic arrays, prioritizing new topics, deduplicating
   */
  private mergeTopics(prev: string[], next: string[], max: number = 12): string[] {
    const out: string[] = [];
    for (const t of [...next, ...prev]) {
      const v = (t || '').toString().trim();
      if (!v) continue;
      if (!out.some(x => x.toLowerCase() === v.toLowerCase())) {
        out.push(v);
      }
      if (out.length >= max) break;
    }
    return out;
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

      const prompt = `Summarize this conversation as a short STATE for continuity.

Conversation:
${conversationText}

Output ONLY 3-5 short lines in this exact format:

ACTIVE_TASK: <one line>
PROGRESS: <one line>
CONSTRAINTS: <one line or "none">
NOTES: <one line or "none">

Rules:
- Treat USER messages as the source of truth for ACTIVE_TASK.
- If the assistant went off-topic, do NOT adopt that as ACTIVE_TASK.
- If the user requested a multi-step task (like "ask 10 questions"), ACTIVE_TASK must include it.
- PROGRESS must reflect what has already happened (e.g. 2/5 answered, score 2/2).
- Do not add unrelated topics unless the user explicitly asked.`;

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
        maxTokens: 180  // ✅ Reduced from 200 (4-line STATE format is fixed length)
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

      const conversationText = messages//try to get last 10 msg only
        .filter(m => m.sender === 'human') // focus on user intent; ignore assistant tangents
        .map(msg => msg.content)
        .join('\n');

      const prompt = `Extract the main topics the USER asked for (ignore assistant tangents).
Return a JSON array of 3-5 topics.

USER MESSAGES:
${conversationText}

Return only JSON array, example: ["Math quiz", "Multiplication", "Score tracking"]`;

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
      const prompt = `Analyze the text and extract important facts that should be remembered long-term.

Return a JSON array of objects with:
- key: short stable identifier (snake_case preferred)
- value: a FULL, self-contained sentence in plain English that preserves the user's meaning.
        IMPORTANT: value must NOT be a single keyword like "dada" or "cricket".
        Examples:
          - "User's name is Dada."
          - "User loves cricket."
          - "User's favorite color is blue."

Categories: 'fact', 'preference', 'relationship', 'context', 'interest'

TEXT:
${summary}

Return only valid JSON array, example:
[
  {"key":"user_name","value":"User's name is Dada.","category":"fact"},
  {"key":"favorite_color","value":"User's favorite color is blue.","category":"preference"}
]

If no important facts, return [].`;

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
        { role: 'system', content: 'You extract facts from summaries. Return only valid JSON arrays. Always use full sentences for values, never single keywords.' },
        { role: 'user', content: prompt }
      ], {
        temperature: 0.3,
        maxTokens: 250  // ✅ Reduced from 300 (JSON responses are typically small)
      });

      const content = llmResponse.content.trim();
      if (content) {
        const parsed = JSON.parse(content);
        
        // ✅ Safety-net: Normalize low-signal values for name-like facts
        return (Array.isArray(parsed) ? parsed : []).map((f: any) => {
          const key = String(f?.key || '').trim();
          const category = String(f?.category || 'fact').trim();
          let value = String(f?.value || '').trim();

          // If key is name-related and value is a single word (no spaces), expand it
          if (key.toLowerCase().includes('name') && value && !/\s/.test(value)) {
            value = `User's name is ${value}.`;
          }

          return { key, value, category };
        });
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