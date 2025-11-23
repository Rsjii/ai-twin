export type IntentType = 'plan' | 'casual' | 'qa' | 'emotional' | 'technical';
export interface IntentClassification {
    intent: IntentType;
    confidence: number;
    keywords: string[];
    suggestedResponseStyle: string;
}
export declare function classifyIntent(message: string): IntentClassification;
export declare function shapeByIntent(text: string, intent: IntentType, userStyle: any): string;
//# sourceMappingURL=intentClassification.d.ts.map