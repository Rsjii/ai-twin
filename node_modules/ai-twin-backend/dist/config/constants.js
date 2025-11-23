"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EVENT_TYPES = exports.TIME_INTERVALS = exports.QUERY_LIMITS_EXTENDED = exports.DB_POOL_CONFIG = exports.QUERY_DEFAULTS = exports.DB_RETRY = exports.MESSAGE_LIMITS = exports.QUERY_LIMITS = exports.ADMIN_EMAILS = void 0;
exports.ADMIN_EMAILS = [
    'admin@aitwin.com',
    'i@gmail.com',
    'k@gmail.com'
];
exports.QUERY_LIMITS = {
    DEFAULT_PAGE_SIZE: 50,
    MAX_PAGE_SIZE: 100,
    MIN_PAGE_SIZE: 10,
    RECENT_ITEMS: 10,
    TOP_ITEMS: 10,
    RECENT_ACTIVITY: 20,
    RECENT_EVENTS: 50,
    CHAT_MESSAGES: 50,
    RECENT_MESSAGES: 10,
    LAST_MESSAGE: 1,
    ANALYTICS_DETAILS: 20,
    ANALYTICS_TOP: 10,
    ANALYTICS_TIMELINE: 30,
    MEMORY_CHUNKS: 5,
    STYLE_ANCHORS: 10,
    LONG_TERM_MEMORY: 20,
    SOCIAL_FEED: 100,
    FOLLOWERS: 20,
    PERFORMANCE_DATA: 1000,
    PERFORMANCE_SAMPLES: 500,
    TRAINING_SAMPLES: 10,
    DISCOVER_RESULTS: 20,
    TRENDING_LIMIT: 10,
};
exports.MESSAGE_LIMITS = {
    MAX_LENGTH: 300,
    MIN_LENGTH: 1,
};
exports.DB_RETRY = {
    MAX_ATTEMPTS: 3,
    BASE_DELAY_MS: 1000,
};
exports.QUERY_DEFAULTS = {
    DEFAULT_LIMIT: 50,
    MAX_LIMIT: 100,
    MIN_LIMIT: 10,
    RECENT_ITEMS: 10,
    PERFORMANCE_SAMPLES: 1000,
    ANALYTICS_TIMELINE: 30,
};
exports.DB_POOL_CONFIG = {
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    acquireTimeoutMillis: 10000,
    createTimeoutMillis: 10000,
    retryDelayMs: 1000,
    retryAttempts: 3,
};
exports.QUERY_LIMITS_EXTENDED = {
    MEMORY_CHUNKS_LARGE: 500,
    CORRECTIONS_LIMIT: 1000,
    FEEDBACK_LIMIT: 1000,
};
exports.TIME_INTERVALS = {
    HOUR: '1 hour',
    DAY: '1 day',
    WEEK: '7 days',
    MONTH: '30 days',
};
exports.EVENT_TYPES = {
    SIGNUP: 'signup',
    LOGIN: 'login',
    LOGOUT: 'logout',
    INVITE_SENT: 'invite_sent',
    INVITE_ACCEPTED: 'invite_accepted',
    TWIN_CREATED: 'twin_created',
    TWIN_CREATION_FAILED: 'twin_creation_failed',
    ENHANCED_TWIN_CREATED: 'enhanced_twin_created',
    TWIN_MADE_PUBLIC: 'twin_made_public',
    TWIN_MADE_PRIVATE: 'twin_made_private',
    CHAT_STARTED: 'chat_started',
    CHAT_CONTINUED: 'chat_continued',
    CHAT_CREATED: 'chat_created',
    CHAT_MESSAGE: 'chat_message',
    CHAT_DELETED: 'chat_deleted',
    PUBLIC_CHAT_STARTED: 'public_chat_started',
    DRAFT_GENERATED: 'draft_generated',
    MESSAGE_APPROVED: 'message_approved',
    TWIN_LIKED: 'twin_liked',
    TWIN_UNLIKED: 'twin_unliked',
    TWIN_FOLLOWED: 'twin_followed',
    TWIN_UNFOLLOWED: 'twin_unfollowed',
    TWIN_SHARED: 'twin_shared',
    SHARE_CLICKED: 'share_clicked',
    PRIVACY_SETTINGS_UPDATED: 'privacy_settings_updated',
    USER_BLOCKED: 'user_blocked',
    USER_UNBLOCKED: 'user_unblocked',
    CONTENT_MODERATED: 'content_moderated',
    CONTENT_REPORTED: 'content_reported',
    AI_RUN_CREATED: 'ai_run_created',
    ERROR: 'error',
    API_ERROR: 'api_error',
};
//# sourceMappingURL=constants.js.map