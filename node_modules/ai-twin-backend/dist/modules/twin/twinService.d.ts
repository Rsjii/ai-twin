export interface StyleVector {
    tone: 'casual' | 'witty' | 'serious' | 'friendly' | 'professional';
    emoji_usage: number;
    hinglish_ratio: number;
    sentence_length: 'short' | 'medium' | 'long';
    signature_patterns: string[];
    formality_level?: number;
    humor_style?: 'none' | 'light' | 'moderate' | 'heavy';
    question_frequency?: number;
    exclamation_usage?: number;
    code_mixing_style?: 'minimal' | 'moderate' | 'heavy';
    response_length_preference?: 'brief' | 'detailed' | 'comprehensive';
    personality_traits?: string[];
    communication_style?: 'conversational' | 'informative' | 'questioning';
}
export declare class TwinService {
    extractStyle(samples: string): Promise<StyleVector>;
    generateSampleReply(styleVector: StyleVector): Promise<string>;
    generateDraft(styleVector: StyleVector, conversationHistory: string[]): Promise<string>;
    updateStyleVector(currentVector: StyleVector, newConversations: string[]): Promise<StyleVector>;
    generateDraftWithContext(context: {
        styleVector: StyleVector;
        personaData?: any;
        systemPrompt?: string;
        tokenLimit?: number;
        chatVector?: any;
        sessionMemory?: {
            summary: string;
            keyTopics: string[];
        } | null;
        chatMemory: Array<{
            content: string;
            sender: string;
            timestamp: Date;
        }>;
        currentMessages: string[];
        twinId?: string;
        isFirstMessage?: boolean;
    }): Promise<string | {
        response: string;
        title: string;
    }>;
    generatePersonaResponse(userMessage: string, personaData: any, systemPrompt: string, chatHistory?: any[], tokenLimit?: number, sessionMemory?: {
        summary: string;
        keyTopics: string[];
    } | null, longTermMemories?: Array<{
        key: string;
        value: string;
        category: string;
    }>, stylePatterns?: Array<{
        type: string;
        phrase?: string;
        userUtterance?: string;
        idealReply?: string;
        patternType?: string;
        context?: string;
    }>, isFirstMessage?: boolean): Promise<string | {
        response: string;
        title: string;
    }>;
    private generateFallbackResponse;
    private getDefaultStyleVector;
    generateChatVector(chatHistory: Array<{
        content: string;
        sender: string;
        timestamp: Date;
    }>): Promise<any>;
    updateChatVector(currentChatVector: any, newMessages: Array<{
        content: string;
        sender: string;
        timestamp: Date;
    }>): Promise<any>;
    private validateStyleVector;
    generateSystemPrompt(styleVector: StyleVector, personaData?: any): Promise<string>;
}
//# sourceMappingURL=twinService.d.ts.map