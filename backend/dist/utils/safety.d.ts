export declare function hasImpersonationRisk(text: string): boolean;
export declare function hasBannedWords(text: string): boolean;
export declare function hasSuspiciousPatterns(text: string): boolean;
export declare function isContentSafe(text: string): {
    safe: boolean;
    reasons: string[];
};
export declare function sanitizeText(text: string): string;
export declare function validateMessageLength(text: string, minLength?: number, maxLength?: number): boolean;
export declare function validateTwinSamples(samples: string[]): {
    valid: boolean;
    errors: string[];
};
//# sourceMappingURL=safety.d.ts.map