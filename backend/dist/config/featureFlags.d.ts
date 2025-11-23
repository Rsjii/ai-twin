export interface FeatureFlags {
    VALIDATION_MODE: boolean;
    ENABLE_AI_GENERATION: boolean;
    ENABLE_PUBLIC_PROFILES: boolean;
    ENABLE_INVITES: boolean;
    ENABLE_ANALYTICS: boolean;
    ENABLE_RATE_LIMITING: boolean;
    ENABLE_CONTENT_FILTERING: boolean;
    ENABLE_EMAIL_NOTIFICATIONS: boolean;
    DEBUG_MODE: boolean;
}
export declare function getFeatureFlags(): FeatureFlags;
export declare function isFeatureEnabled(feature: keyof FeatureFlags): boolean;
export declare function requireFeature(feature: keyof FeatureFlags): (req: any, res: any, next: any) => any;
export declare function getValidationSettings(): {
    requireApproval: boolean;
    strictRateLimiting: boolean;
    requireWatermarks: boolean;
    enhancedLogging: boolean;
    showDebugInfo: boolean;
};
export declare function logFeatureUsage(feature: keyof FeatureFlags, userId?: string): void;
export declare const featureFlags: FeatureFlags;
export declare const validationSettings: {
    requireApproval: boolean;
    strictRateLimiting: boolean;
    requireWatermarks: boolean;
    enhancedLogging: boolean;
    showDebugInfo: boolean;
};
//# sourceMappingURL=featureFlags.d.ts.map