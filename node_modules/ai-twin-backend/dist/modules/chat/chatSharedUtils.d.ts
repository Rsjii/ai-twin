export interface ChatMessageContext {
    styleVector: any;
    personaData: any;
    systemPrompt: string;
    tokenLimit: number;
    chatMemory: Array<{
        content: string;
        sender: string;
        timestamp: Date;
    }>;
    currentMessages: string[];
    twinId: string;
    isFirstMessage?: boolean;
    sessionMemory?: {
        summary: string;
        keyTopics: string[];
    } | null;
    chatVector?: any;
}
export interface ModerationResult {
    approved: boolean;
    moderationResult: {
        isApproved: boolean;
        confidence: number;
        reasons: string[];
        suggestions: string[];
    };
}
export interface AIResponseResult {
    aiResponse: string;
    generatedTitle: string | null;
}
export interface MessageSaveResult {
    userMessage: {
        id: string;
        content: string;
        sender: string;
        createdAt: Date;
    };
    aiMessage: {
        id: string;
        content: string;
        sender: string;
        createdAt: Date;
    };
}
export declare function validateMessage(message: string): void;
export declare function checkModerationAndApprove(message: string, twinId: string, userId?: string, requireApprovalOverride?: boolean): Promise<ModerationResult>;
export declare function getModerationRejectionResponse(moderationResult: {
    reasons: string[];
    suggestions: string[];
}): {
    success: boolean;
    error: string;
    message: string;
    reasons: string[];
    suggestions: string[];
};
export declare function createRequestId(userIdOrVisitor: string): string;
export declare function checkDuplicateRequest(chatId: string, requestId: string, messageTable: 'Message' | 'PublicMessage'): Promise<{
    isDuplicate: boolean;
    existingMessage?: any;
}>;
export declare function getRecentMessages(chatId: string, messageTable: 'Message' | 'PublicMessage', limit?: number): Promise<Array<{
    content: string;
    sender: string;
    createdAt: Date;
}>>;
export declare function buildChatContext(params: {
    styleVector: any;
    personaData: any;
    systemPrompt: string;
    tokenLimit: number;
    chatMemory: Array<{
        content: string;
        sender: string;
        timestamp: Date;
    }>;
    currentMessages: string[];
    twinId: string;
    isFirstMessage: boolean;
    chatVector?: any;
    sessionMemory?: {
        summary: string;
        keyTopics: string[];
    } | null;
}): ChatMessageContext;
export declare function generateAIResponse(context: ChatMessageContext): Promise<AIResponseResult>;
export declare function saveUserMessage(params: {
    chatId: string;
    message: string;
    approved: boolean;
    requestId: string;
    messageTable: 'Message' | 'PublicMessage';
    messageIdPrefix: string;
}): Promise<{
    id: string;
    content: string;
    sender: string;
    createdAt: Date;
}>;
export declare function saveAIMessage(params: {
    chatId: string;
    aiResponse: string;
    messageTable: 'Message' | 'PublicMessage';
    messageIdPrefix: string;
}): Promise<{
    id: string;
    content: string;
    sender: string;
    createdAt: Date;
}>;
export declare function checkFirstMessage(chatId: string, messageTable: 'Message' | 'PublicMessage'): Promise<boolean>;
export declare function getChatTitle(chatId: string, chatTable: 'Chat' | 'PublicChat'): Promise<string | null>;
export declare function updateChatMetadata(params: {
    chatId: string;
    chatTable: 'Chat' | 'PublicChat';
    generatedTitle: string | null;
    isFirstMessage: boolean;
    currentTitle: string | null;
    userMessage: string;
    aiResponse: string;
    lastMessageField?: string;
    updatedAtField?: string;
}): Promise<void>;
export declare function updateSessionMemory(chatId: string, twinId: string): Promise<void>;
export declare function getSessionMemoryForContext(chatId: string): Promise<{
    summary: string;
    keyTopics: string[];
} | null>;
//# sourceMappingURL=chatSharedUtils.d.ts.map