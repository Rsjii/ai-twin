export declare class MemoryService {
    createOrUpdateSessionMemory(chatId: string, messages: Array<{
        content: string;
        sender: string;
        timestamp: Date;
    }>): Promise<void>;
    getSessionMemory(chatId: string): Promise<any | null>;
    extractLongTermFacts(twinId: string, sessionSummary: string): Promise<void>;
    getLongTermMemories(twinId: string, category?: string, limit?: number): Promise<Array<{
        key: string;
        value: string;
        category: string;
    }>>;
    private getKeywordMapping;
    private extractMemoryKeywords;
    getRelevantLongTermMemories(twinId: string, userMessage: string, limit?: number): Promise<Array<{
        key: string;
        value: string;
        category: string;
    }>>;
    storeLongTermMemory(twinId: string, key: string, value: string, category?: string, source?: string): Promise<void>;
    storeStylePattern(twinId: string, pattern: string, type?: 'phrase' | 'pattern', patternType?: 'greeting' | 'agreement' | 'disagreement' | 'question', context?: string): Promise<void>;
    getRelevantStylePatterns(twinId: string, userMessage: string, limit?: number): Promise<Array<{
        type: string;
        phrase?: string;
        userUtterance?: string;
        idealReply?: string;
        patternType?: string;
        context?: string;
    }>>;
    private generateSessionSummary;
    private extractKeyTopics;
    private identifyFactsFromSummary;
    cleanupOldSessionMemories(daysOld?: number): Promise<void>;
}
export declare const memoryService: MemoryService;
//# sourceMappingURL=memoryService.d.ts.map