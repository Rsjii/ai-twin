"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validationSettings = exports.featureFlags = void 0;
exports.getFeatureFlags = getFeatureFlags;
exports.isFeatureEnabled = isFeatureEnabled;
exports.requireFeature = requireFeature;
exports.getValidationSettings = getValidationSettings;
exports.logFeatureUsage = logFeatureUsage;
function getFeatureFlags() {
    return {
        VALIDATION_MODE: process.env['VALIDATION_MODE'] === 'true' || process.env['NODE_ENV'] === 'development',
        ENABLE_AI_GENERATION: process.env['ENABLE_AI_GENERATION'] !== 'false',
        ENABLE_PUBLIC_PROFILES: process.env['ENABLE_PUBLIC_PROFILES'] !== 'false',
        ENABLE_INVITES: process.env['ENABLE_INVITES'] !== 'false',
        ENABLE_ANALYTICS: process.env['ENABLE_ANALYTICS'] !== 'false',
        ENABLE_RATE_LIMITING: process.env['ENABLE_RATE_LIMITING'] !== 'false',
        ENABLE_CONTENT_FILTERING: process.env['ENABLE_CONTENT_FILTERING'] !== 'false',
        ENABLE_EMAIL_NOTIFICATIONS: process.env['ENABLE_EMAIL_NOTIFICATIONS'] !== 'false',
        DEBUG_MODE: process.env['NODE_ENV'] === 'development' || process.env['DEBUG_MODE'] === 'true',
    };
}
function isFeatureEnabled(feature) {
    const flags = getFeatureFlags();
    return flags[feature];
}
function requireFeature(feature) {
    return (_req, res, next) => {
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
function getValidationSettings() {
    const flags = getFeatureFlags();
    return {
        requireApproval: flags.VALIDATION_MODE,
        strictRateLimiting: flags.VALIDATION_MODE,
        requireWatermarks: flags.VALIDATION_MODE,
        enhancedLogging: flags.VALIDATION_MODE,
        showDebugInfo: flags.DEBUG_MODE,
    };
}
function logFeatureUsage(feature, userId) {
    if (isFeatureEnabled('ENABLE_ANALYTICS')) {
        console.log(`Feature used: ${feature}`, { userId, timestamp: new Date().toISOString() });
    }
}
exports.featureFlags = getFeatureFlags();
exports.validationSettings = getValidationSettings();
//# sourceMappingURL=featureFlags.js.map