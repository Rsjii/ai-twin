/**
 * Feature Flags Configuration
 * Controls functionality based on environment and validation mode
 */

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

/**
 * Get feature flags based on environment variables
 */
export function getFeatureFlags(): FeatureFlags {
  return {
    // Core validation mode - when true, everything is approve-only
    VALIDATION_MODE: process.env.VALIDATION_MODE === 'true' || process.env.NODE_ENV === 'development',
    
    // AI functionality
    ENABLE_AI_GENERATION: process.env.ENABLE_AI_GENERATION !== 'false',
    
    // Public features
    ENABLE_PUBLIC_PROFILES: process.env.ENABLE_PUBLIC_PROFILES !== 'false',
    ENABLE_INVITES: process.env.ENABLE_INVITES !== 'false',
    
    // Analytics and tracking
    ENABLE_ANALYTICS: process.env.ENABLE_ANALYTICS !== 'false',
    
    // Security features
    ENABLE_RATE_LIMITING: process.env.ENABLE_RATE_LIMITING !== 'false',
    ENABLE_CONTENT_FILTERING: process.env.ENABLE_CONTENT_FILTERING !== 'false',
    
    // Notifications
    ENABLE_EMAIL_NOTIFICATIONS: process.env.ENABLE_EMAIL_NOTIFICATIONS !== 'false',
    
    // Debug mode
    DEBUG_MODE: process.env.NODE_ENV === 'development' || process.env.DEBUG_MODE === 'true',
  };
}

/**
 * Check if a specific feature is enabled
 */
export function isFeatureEnabled(feature: keyof FeatureFlags): boolean {
  const flags = getFeatureFlags();
  return flags[feature];
}

/**
 * Middleware to check feature flags
 */
export function requireFeature(feature: keyof FeatureFlags) {
  return (req: any, res: any, next: any) => {
    if (!isFeatureEnabled(feature)) {
      return res.status(503).json({
        error: 'Feature not available',
        feature,
        message: 'This feature is currently disabled'
      });
    }
    next();
  };
}

/**
 * Get validation mode specific settings
 */
export function getValidationSettings() {
  const flags = getFeatureFlags();
  
  return {
    // In validation mode, all AI content must be approved
    requireApproval: flags.VALIDATION_MODE,
    
    // Rate limits are stricter in validation mode
    strictRateLimiting: flags.VALIDATION_MODE,
    
    // All public content must be watermarked
    requireWatermarks: flags.VALIDATION_MODE,
    
    // Enhanced logging in validation mode
    enhancedLogging: flags.VALIDATION_MODE,
    
    // Debug information available
    showDebugInfo: flags.DEBUG_MODE,
  };
}

/**
 * Log feature flag usage for analytics
 */
export function logFeatureUsage(feature: keyof FeatureFlags, userId?: string) {
  if (isFeatureEnabled('ENABLE_ANALYTICS')) {
    // This would integrate with your event logger
    console.log(`Feature used: ${feature}`, { userId, timestamp: new Date().toISOString() });
  }
}

// Export the current feature flags
export const featureFlags = getFeatureFlags();
export const validationSettings = getValidationSettings();


/**
 * Global Feature Flags - Control V2 features from environment variables
 * 
 * Usage:
 * - Set env vars to 'true' to enable features
 * - Default: all false (MVP mode)
 */
export const FEATURE_FLAGS = {
  advancedLearningUI: process.env['ENABLE_ADVANCED_LEARNING_UI'] === 'true',
  memoryUI: process.env['ENABLE_MEMORY_UI'] === 'true',
  styleAnchorsUI: process.env['ENABLE_STYLE_ANCHORS_UI'] === 'true',
  chatFeedbackUI: process.env['ENABLE_CHAT_FEEDBACK_UI'] === 'true',
  advancedPublicAnalyticsUI: process.env['ENABLE_ADV_PUBLIC_ANALYTICS'] === 'true',
};