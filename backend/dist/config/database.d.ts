import { db } from './db';
export declare function initializeDatabase(): Promise<void>;
export declare function generateId(): string;
export declare const userQueries: {
    create: (email: string, handle?: string, passwordHash?: string, referralCode?: string) => Promise<any>;
    findByEmail: (email: string) => Promise<any>;
    findById: (id: string) => Promise<any>;
    findByReferralCode: (referralCode: string) => Promise<any>;
    updatePassword: (email: string, passwordHash: string) => Promise<any>;
    activateUser: (email: string) => Promise<any>;
    updateProfile: (email: string, name: string, handle: string, dob: string, phone: string, bio: string, profileImage?: string | null) => Promise<any>;
};
export declare const twinQueries: {
    create: (userId: string, styleVector: any, sampleReply?: string, instructions?: any) => Promise<any>;
    findByUserId: (userId: string) => Promise<any[]>;
    updateInstructions: (userId: string, instructions: any) => Promise<any>;
    updateStyleVector: (userId: string, styleVector: any) => Promise<any>;
    findById: (twinId: string) => Promise<any>;
};
export declare const chatQueries: {
    create: (userId: string, twinId: string) => Promise<any>;
    findByUserId: (userId: string) => Promise<any[]>;
};
export declare const messageQueries: {
    create: (chatId: string, sender: "human" | "twin", content: string, approved?: boolean) => Promise<any>;
    findByChatId: (chatId: string) => Promise<any[]>;
};
export { db };
export declare const otpQueries: {
    create: (email: string, codeHash: string, expiresAt: Date) => Promise<any>;
    findByEmail: (email: string) => Promise<any>;
    markAsUsed: (id: string) => Promise<any>;
};
export declare const publicTwinQueries: {
    makePublic: (twinId: string, publicHandle: string, bio?: string, profileImage?: string) => Promise<any>;
    makePrivate: (twinId: string) => Promise<any>;
    findByPublicHandle: (publicHandle: string) => Promise<any>;
    getPublicTwins: (limit?: number, offset?: number) => Promise<any[]>;
    updateProfile: (twinId: string, bio?: string, profileImage?: string, publicHandle?: string) => Promise<any>;
};
export declare const twinLikeQueries: {
    create: (twinId: string, userId: string) => Promise<any>;
    remove: (twinId: string, userId: string) => Promise<any>;
    findByTwinAndUser: (twinId: string, userId: string) => Promise<any>;
    getTwinLikes: (twinId: string) => Promise<number>;
};
export declare const twinFollowQueries: {
    create: (twinId: string, userId: string) => Promise<any>;
    remove: (twinId: string, userId: string) => Promise<any>;
    findByTwinAndUser: (twinId: string, userId: string) => Promise<any>;
    getTwinFollows: (twinId: string) => Promise<number>;
};
export declare const publicChatQueries: {
    create: (twinId: string, visitorId?: string, userId?: string) => Promise<any>;
    updateMessageCount: (chatId: string) => Promise<any>;
    findByTwinAndVisitor: (twinId: string, visitorId?: string) => Promise<any[]>;
    findAllByTwinAndVisitor: (twinId: string, visitorId?: string) => Promise<any[]>;
};
export declare const publicMessageQueries: {
    create: (chatId: string, sender: "human" | "twin", content: string) => Promise<any>;
    findByChatId: (chatId: string, limit?: number) => Promise<any[]>;
    getRecentMessages: (chatId: string, limit?: number) => Promise<any[]>;
    updateMessageCount: (chatId: string) => Promise<any>;
};
export declare const styleAnchorsQueries: {
    create: (twinId: string, userUtterance: string, idealReply: string, tags?: string[], type?: "interaction" | "phrase" | "pattern", phrase?: string, patternType?: string, context?: string) => Promise<any>;
    findByTwinId: (twinId: string, limit?: number, offset?: number) => Promise<any[]>;
    findById: (anchorId: string) => Promise<any>;
    update: (anchorId: string, userUtterance: string, idealReply: string, tags: string[], type?: "interaction" | "phrase" | "pattern", phrase?: string, patternType?: string, context?: string) => Promise<any>;
    delete: (anchorId: string) => Promise<any>;
    findByTwinAndSimilarity: (twinId: string, userMessage: string, limit?: number, type?: "interaction" | "phrase" | "pattern") => Promise<any[]>;
    findPhrasesByTwinId: (twinId: string, limit?: number) => Promise<any[]>;
};
export declare const memChunksQueries: {
    create: (twinId: string, bucket: "facts" | "voice", text: string, embedding?: number[]) => Promise<any>;
    findByTwinAndBucket: (twinId: string, bucket: "facts" | "voice", limit?: number) => Promise<any[]>;
    findByTwinAndSimilarity: (twinId: string, bucket: "facts" | "voice", queryEmbedding: number[], limit?: number) => Promise<any[]>;
    delete: (chunkId: string) => Promise<any>;
    update: (chunkId: string, text: string) => Promise<any>;
    findByTwinIdAndBucket: (twinId: string, bucket: "facts" | "voice", limit?: number, offset?: number) => Promise<any[]>;
};
export declare const styleCorrectionsQueries: {
    create: (twinId: string, knob: string, delta: number, source?: string) => Promise<any>;
    findByTwinId: (twinId: string, limit?: number) => Promise<any[]>;
    getAggregatedCorrections: (twinId: string) => Promise<any[]>;
};
export declare const aiRunsQueries: {
    create: (twinId: string, mode: string, tokensIn: number, tokensOut: number, criticScore?: number, regen: boolean | undefined, latencyMs: number) => Promise<any>;
    findByTwinId: (twinId: string, limit?: number, offset?: number) => Promise<any[]>;
    getQualityMetrics: (twinId: string, days?: number) => Promise<any>;
    getRecentRuns: (twinId: string, hours?: number) => Promise<any[]>;
};
export declare const memorySessionQueries: {
    create: (chatId: string, summary: string, keyTopics: string[], vector: any) => Promise<any>;
    findByChatId: (chatId: string) => Promise<any>;
    update: (chatId: string, summary: string, keyTopics: string[], vector: any, messageCount: number) => Promise<any>;
};
export declare const memoryLongTermQueries: {
    create: (twinId: string, key: string, value: string, category: string, source?: string) => Promise<any>;
    findByTwinId: (twinId: string, category?: string, limit?: number) => Promise<any[]>;
    delete: (twinId: string, key: string) => Promise<any>;
};
//# sourceMappingURL=database.d.ts.map