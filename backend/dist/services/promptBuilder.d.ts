export interface PromptContext {
    twinId?: string;
    chatId?: string;
    personaData?: any;
    styleVector: any;
    chatVector?: any;
    chatMemory: Array<{
        content: string;
        sender: string;
        timestamp: Date;
    }>;
    currentMessages: string[];
    sessionMemory?: {
        summary: string;
        keyTopics: string[];
    } | null;
    tokenLimit?: number;
}
export interface StylePattern {
    type: string;
    phrase?: string;
    userUtterance?: string;
    idealReply?: string;
    patternType?: string;
    context?: string;
}
export declare class PromptBuilder {
    private countTokens;
    private truncateToTokenBudget;
    buildSystemPrompt(context: PromptContext): Promise<string>;
    private getSessionMemory;
    private getLongTermMemories;
    private getStylePatterns;
    private getFeedbackContext;
    private buildPersonaSection;
    private buildStyleSection;
    private buildStyleAnchorSection;
    private buildLongTermMemorySection;
    private buildSessionMemorySection;
    private buildChatContextSection;
    private buildInstructionsSection;
    private assemblePrompt;
    private buildFallbackPrompt;
    buildPersonaPrompt(systemPrompt: string, personaData: any, chatHistory: any[], sessionMemory?: {
        summary: string;
        keyTopics: string[];
    } | null, longTermMemories?: Array<{
        key: string;
        value: string;
        category: string;
    }>, stylePatterns?: StylePattern[], tokenLimit?: number, userMessage?: string): string;
}
export declare const promptBuilder: PromptBuilder;
//# sourceMappingURL=promptBuilder.d.ts.map