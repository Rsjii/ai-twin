export interface StyleCriticResult {
    score: number;
    rewrite?: string;
    notes: string;
    issues: string[];
    suggestions: string[];
}
export interface StyleProfile {
    sentences: 'short' | 'medium' | 'long';
    tone: 'casual' | 'witty' | 'serious' | 'friendly' | 'professional';
    signature: string[];
    emoji: 'none' | 'light' | 'moderate' | 'heavy';
    formality: number;
    humor: 'none' | 'light' | 'moderate' | 'heavy';
    questionFreq: number;
    responseLength: 'brief' | 'detailed' | 'comprehensive';
}
export declare function runStyleCritic(draft: string, twin: any): Promise<StyleCriticResult>;
export declare function checkBanlist(text: string): boolean;
export declare function rewriteBanlist(text: string): Promise<string>;
export declare function applyStyleCorrections(text: string, corrections: any[]): string;
//# sourceMappingURL=styleCritic.d.ts.map