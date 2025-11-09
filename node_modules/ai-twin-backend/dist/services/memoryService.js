"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.memoryService = exports.MemoryService = void 0;
const database_1 = require("../config/database");
const logger_1 = require("../config/logger");
const env_1 = require("../config/env");
const openai_1 = __importDefault(require("openai"));
const openai = new openai_1.default({
    apiKey: env_1.config.openaiApiKey,
});
class MemoryService {
    async createOrUpdateSessionMemory(chatId, messages) {
        try {
            const existingResult = await database_1.db.query('SELECT id, summary, "keyTopics", "messageCount" FROM "MemorySession" WHERE "chatId" = $1', [chatId]);
            const summary = await this.generateSessionSummary(messages);
            const keyTopics = await this.extractKeyTopics(messages);
            const sessionVector = {
                summary,
                keyTopics,
                messageCount: messages.length,
                lastUpdated: new Date().toISOString()
            };
            if (existingResult.rows.length > 0) {
                await database_1.db.query(`UPDATE "MemorySession" 
           SET summary = $1, "keyTopics" = $2, vector = $3, "messageCount" = $4, "lastUpdated" = NOW()
           WHERE "chatId" = $5`, [summary, keyTopics, JSON.stringify(sessionVector), messages.length, chatId]);
                logger_1.logger.info(`Updated session memory for chat: ${chatId}`);
            }
            else {
                const id = `mem_sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                await database_1.db.query(`INSERT INTO "MemorySession" (id, "chatId", summary, "keyTopics", vector, "messageCount", "lastUpdated")
           VALUES ($1, $2, $3, $4, $5, $6, NOW())`, [id, chatId, summary, keyTopics, JSON.stringify(sessionVector), messages.length]);
                logger_1.logger.info(`Created session memory for chat: ${chatId}`);
            }
        }
        catch (error) {
            logger_1.logger.error('Error creating session memory:', error);
            throw error;
        }
    }
    async getSessionMemory(chatId) {
        try {
            const result = await database_1.db.query('SELECT summary, "keyTopics", vector FROM "MemorySession" WHERE "chatId" = $1', [chatId]);
            return result.rows.length > 0 ? result.rows[0] : null;
        }
        catch (error) {
            logger_1.logger.error('Error getting session memory:', error);
            return null;
        }
    }
    async extractLongTermFacts(twinId, sessionSummary) {
        try {
            const facts = await this.identifyFactsFromSummary(sessionSummary);
            for (const fact of facts) {
                await this.storeLongTermMemory(twinId, fact.key, fact.value, fact.category);
            }
            logger_1.logger.info(`Extracted ${facts.length} facts for twin: ${twinId}`);
        }
        catch (error) {
            logger_1.logger.error('Error extracting long-term facts:', error);
        }
    }
    async getLongTermMemories(twinId, category, limit = 10) {
        try {
            let query = 'SELECT key, value, category FROM "MemoryLongTerm" WHERE "twinId" = $1';
            const params = [twinId];
            if (category) {
                query += ' AND category = $2';
                params.push(category);
                query += ' ORDER BY "updatedAt" DESC LIMIT $3';
                params.push(limit);
            }
            else {
                query += ' ORDER BY "updatedAt" DESC LIMIT $2';
                params.push(limit);
            }
            const result = await database_1.db.query(query, params);
            return result.rows;
        }
        catch (error) {
            logger_1.logger.error('Error getting long-term memories:', error);
            return [];
        }
    }
    getKeywordMapping() {
        return new Map([
            ['name', ['name', 'naam', 'who am i', 'mera naam', 'what is my name', 'my name', 'apka naam', 'your name', 'identity']],
            ['age', ['age', 'umar', 'how old', 'kitne saal', 'birthday', 'janam din', 'born', 'date of birth']],
            ['job', ['job', 'kaam', 'work', 'profession', 'occupation', 'kya karte ho', 'what do you do', 'career', 'business']],
            ['city', ['city', 'sheher', 'where', 'kahan', 'location', 'place', 'address', 'live', 'rahte']],
            ['preference', ['favorite', 'pasand', 'like', 'prefer', 'preference', 'achha lagta', 'best', 'favourite']],
            ['interest', ['hobby', 'interest', 'shauk', 'pasand', 'kya pasand hai', 'enjoy', 'love doing']],
            ['relationship', ['family', 'parivar', 'relative', 'relationship', 'sibling', 'brother', 'sister', 'father', 'mother', 'parent']],
            ['fact', ['fact', 'know', 'remember', 'tell me about', 'information', 'details']],
        ]);
    }
    extractMemoryKeywords(userMessage) {
        const text = userMessage.toLowerCase().trim();
        const mapping = this.getKeywordMapping();
        const matchedKeys = [];
        for (const [key, synonyms] of mapping.entries()) {
            const matched = synonyms.some(synonym => {
                return text.includes(synonym.toLowerCase()) ||
                    new RegExp(`\\b${synonym}\\b`, 'i').test(text);
            });
            if (matched) {
                matchedKeys.push(key);
            }
        }
        if (text.includes('prefer') || text.includes('like') || text.includes('favorite') || text.includes('pasand')) {
            matchedKeys.push('preference');
        }
        if (text.includes('fact') || text.includes('know') || text.includes('remember') || text.includes('about')) {
            matchedKeys.push('fact');
        }
        if (text.includes('friend') || text.includes('family') || text.includes('relationship') || text.includes('relative')) {
            matchedKeys.push('relationship');
        }
        return [...new Set(matchedKeys)];
    }
    async getRelevantLongTermMemories(twinId, userMessage, limit = 10) {
        try {
            const commonMemories = await this.getLongTermMemories(twinId, undefined, 5);
            if (!userMessage || userMessage.trim().length === 0) {
                return commonMemories.slice(0, limit);
            }
            const keywords = this.extractMemoryKeywords(userMessage);
            logger_1.logger.info(`Extracted keywords from user message: ${keywords.join(', ')}`);
            let queryMemories = [];
            if (keywords.length > 0) {
                const topKeywords = keywords.slice(0, 3);
                const searchPatterns = topKeywords.map(k => `%${k}%`);
                try {
                    const keyMatches = await database_1.db.query(`SELECT DISTINCT ON (key) key, value, category 
             FROM "MemoryLongTerm" 
             WHERE "twinId" = $1 
             AND (
               key = ANY($2::text[]) OR
               key ILIKE ANY($3::text[]) OR
               value ILIKE ANY($3::text[])
             )
             ORDER BY key, "updatedAt" DESC 
             LIMIT 5`, [twinId, topKeywords, searchPatterns]);
                    queryMemories.push(...keyMatches.rows.map(r => ({
                        key: r.key,
                        value: r.value,
                        category: r.category
                    })));
                }
                catch (error) {
                    logger_1.logger.warn('Optimized memory query failed, falling back to simple search:', error);
                    const fallbackQuery = await database_1.db.query(`SELECT key, value, category 
             FROM "MemoryLongTerm" 
             WHERE "twinId" = $1 
             ORDER BY "updatedAt" DESC 
             LIMIT 5`, [twinId]);
                    queryMemories.push(...fallbackQuery.rows.map(r => ({
                        key: r.key,
                        value: r.value,
                        category: r.category
                    })));
                }
                const categoryMap = {
                    'preference': 'preference',
                    'interest': 'interest',
                    'relationship': 'relationship',
                    'fact': 'fact',
                    'context': 'context'
                };
                const categoryPromises = keywords
                    .map(keyword => categoryMap[keyword])
                    .filter((cat, idx, arr) => cat && arr.indexOf(cat) === idx)
                    .map(category => this.getLongTermMemories(twinId, category, 3));
                if (categoryPromises.length > 0) {
                    const categoryResults = await Promise.all(categoryPromises);
                    categoryResults.forEach(memories => {
                        queryMemories.push(...memories);
                    });
                }
            }
            const allMemories = [...commonMemories, ...queryMemories];
            const uniqueMap = new Map();
            commonMemories.forEach(mem => {
                uniqueMap.set(mem.key, mem);
            });
            queryMemories.forEach(mem => {
                if (!uniqueMap.has(mem.key)) {
                    uniqueMap.set(mem.key, mem);
                }
            });
            const uniqueMemories = Array.from(uniqueMap.values());
            const result = uniqueMemories.slice(0, limit);
            logger_1.logger.info(`Retrieved ${result.length} relevant long-term memories (${commonMemories.length} common + ${queryMemories.length} query-specific)`);
            return result;
        }
        catch (error) {
            logger_1.logger.error('Error getting relevant long-term memories:', error);
            try {
                return await this.getLongTermMemories(twinId, undefined, Math.min(limit, 5));
            }
            catch (fallbackError) {
                logger_1.logger.error('Fallback memory retrieval also failed:', fallbackError);
                return [];
            }
        }
    }
    async storeLongTermMemory(twinId, key, value, category = 'fact', source = 'session') {
        try {
            const id = `mem_lt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            await database_1.db.query(`INSERT INTO "MemoryLongTerm" (id, "twinId", key, value, category, source, "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT ("twinId", key) 
         DO UPDATE SET value = EXCLUDED.value, category = EXCLUDED.category, "updatedAt" = NOW()`, [id, twinId, key, value, category, source]);
            logger_1.logger.info(`Stored long-term memory for twin ${twinId}: ${key}`);
        }
        catch (error) {
            logger_1.logger.error('Error storing long-term memory:', error);
        }
    }
    async storeStylePattern(twinId, pattern, type = 'phrase', patternType, context) {
        try {
            const { styleAnchorsQueries } = await Promise.resolve().then(() => __importStar(require('../config/database')));
            if (type === 'phrase') {
                await styleAnchorsQueries.create(twinId, '', '', ['phrase', 'auto'], 'phrase', pattern, undefined, context);
                logger_1.logger.info(`Stored style phrase for twin ${twinId}: ${pattern}`);
            }
            else {
                await styleAnchorsQueries.create(twinId, pattern, '', ['pattern', 'auto'], 'pattern', undefined, patternType, context);
                logger_1.logger.info(`Stored style pattern for twin ${twinId}: ${pattern} (${patternType})`);
            }
        }
        catch (error) {
            logger_1.logger.error('Error storing style pattern:', error);
            throw error;
        }
    }
    async getRelevantStylePatterns(twinId, userMessage, limit = 3) {
        try {
            const { styleAnchorsQueries } = await Promise.resolve().then(() => __importStar(require('../config/database')));
            const interactionAnchors = await styleAnchorsQueries.findByTwinAndSimilarity(twinId, userMessage, 2, 'interaction');
            const phraseAnchors = await styleAnchorsQueries.findPhrasesByTwinId(twinId, 2);
            const results = [];
            interactionAnchors.forEach(a => {
                results.push({
                    type: 'interaction',
                    userUtterance: a.user_utterance,
                    idealReply: a.ideal_reply
                });
            });
            phraseAnchors.forEach(p => {
                results.push({
                    type: 'phrase',
                    phrase: p.phrase,
                    context: p.context || undefined
                });
            });
            return results.slice(0, limit);
        }
        catch (error) {
            logger_1.logger.error('Error getting style patterns:', error);
            return [];
        }
    }
    async generateSessionSummary(messages) {
        try {
            if (messages.length === 0)
                return 'No conversation yet.';
            const conversationText = messages
                .map(msg => `${msg.sender === 'human' ? 'User' : 'AI'}: ${msg.content}`)
                .join('\n');
            const prompt = `Summarize this conversation in 2-3 sentences. Focus on key topics, decisions, and important context:

${conversationText}

Provide a concise summary:`;
            const response = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: 'You are a conversation summarizer. Create concise summaries.' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.3,
                max_tokens: 200,
            });
            return response.choices[0]?.message?.content?.trim() || 'Conversation summary unavailable.';
        }
        catch (error) {
            logger_1.logger.error('Error generating session summary:', error);
            return 'Summary generation failed.';
        }
    }
    async extractKeyTopics(messages) {
        try {
            if (messages.length === 0)
                return [];
            const conversationText = messages
                .map(msg => msg.content)
                .join('\n');
            const prompt = `Extract the main topics discussed in this conversation. Return a JSON array of 3-5 topics:

${conversationText}

Return only JSON array, example: ["topic1", "topic2", "topic3"]`;
            const response = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: 'You extract topics from conversations. Return only JSON arrays.' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.3,
                max_tokens: 100,
            });
            const content = response.choices[0]?.message?.content?.trim();
            if (content) {
                return JSON.parse(content);
            }
            return [];
        }
        catch (error) {
            logger_1.logger.error('Error extracting topics:', error);
            return [];
        }
    }
    async identifyFactsFromSummary(summary) {
        try {
            const prompt = `Analyze this conversation summary and extract important facts that should be remembered long-term. 
Return a JSON array with objects containing: key, value, category.

Categories: 'fact', 'preference', 'relationship', 'context', 'interest'

Summary: ${summary}

Return only valid JSON array, example:
[{"key": "favorite_color", "value": "blue", "category": "preference"}, {"key": "birthday", "value": "March 15", "category": "fact"}]

If no important facts, return empty array [].`;
            const response = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: 'You extract facts from summaries. Return only valid JSON arrays.' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.3,
                max_tokens: 300,
            });
            const content = response.choices[0]?.message?.content?.trim();
            if (content) {
                return JSON.parse(content);
            }
            return [];
        }
        catch (error) {
            logger_1.logger.error('Error identifying facts:', error);
            return [];
        }
    }
    async cleanupOldSessionMemories(daysOld = 30) {
        try {
            const result = await database_1.db.query('DELETE FROM "MemorySession" WHERE "lastUpdated" < NOW() - INTERVAL \'${daysOld} days\'');
            logger_1.logger.info(`Cleaned up ${result.rowCount} old session memories`);
        }
        catch (error) {
            logger_1.logger.error('Error cleaning up session memories:', error);
        }
    }
}
exports.MemoryService = MemoryService;
exports.memoryService = new MemoryService();
//# sourceMappingURL=memoryService.js.map