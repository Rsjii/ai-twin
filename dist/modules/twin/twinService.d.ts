export interface StyleVector {
    tone: 'casual' | 'witty' | 'serious';
    emoji_usage: number;
    hinglish_ratio: number;
    sentence_length: 'short' | 'medium' | 'long';
    signature_patterns: string[];
}
export declare class TwinService {
    extractStyle(samples: string): Promise<StyleVector>;
    generateSampleReply(styleVector: StyleVector): Promise<string>;
    generateDraft(styleVector: StyleVector, conversationHistory: string[]): Promise<string>;
    private validateStyleVector;
}
//# sourceMappingURL=twinService.d.ts.map