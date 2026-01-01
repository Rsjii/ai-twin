export const ADMIN_EMAILS: string[] = [
  'admin@selflyx.com', // ✅ Update with your actual admin email
  'a@gmail.com'
];

  // Query Limits
export const QUERY_LIMITS = {
    // Pagination defaults
    DEFAULT_PAGE_SIZE: 50,
    MAX_PAGE_SIZE: 100,
    MIN_PAGE_SIZE: 10,
    
    // List queries
    RECENT_ITEMS: 10,
    TOP_ITEMS: 10,
    RECENT_ACTIVITY: 20,
    RECENT_EVENTS: 50,
    
    // Chat/Messages
    CHAT_MESSAGES: 50,
    RECENT_MESSAGES: 10,
    LAST_MESSAGE: 1,
    
    // Analytics
    ANALYTICS_DETAILS: 20,
    ANALYTICS_TOP: 10,
    ANALYTICS_TIMELINE: 30,
    
    // Memory
    MEMORY_CHUNKS: 5,
    STYLE_ANCHORS: 10,
    LONG_TERM_MEMORY: 20,
    
    // Social
    SOCIAL_FEED: 100,
    FOLLOWERS: 20,
    
    // Performance
    PERFORMANCE_DATA: 1000,
    PERFORMANCE_SAMPLES: 500,
    
    // Training
    TRAINING_SAMPLES: 10,
    
    // Discover
    DISCOVER_RESULTS: 20,
    TRENDING_LIMIT: 10,
  } as const;

  // Add after line 49:
export const MESSAGE_LIMITS = {
  MAX_LENGTH: 300,
  MIN_LENGTH: 1,
} as const;

export const DB_RETRY = {
  MAX_ATTEMPTS: 3,
  BASE_DELAY_MS: 1000,
} as const;

export const QUERY_DEFAULTS = {
  DEFAULT_LIMIT: 50,
  MAX_LIMIT: 100,
  MIN_LIMIT: 10,
  RECENT_ITEMS: 10,
  PERFORMANCE_SAMPLES: 1000,
  ANALYTICS_TIMELINE: 30,
} as const;

export const DB_POOL_CONFIG = {
  max: process.env.NODE_ENV === 'production' ? 20 : 5, // ✅ Increase for production (single instance can handle 20)
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  acquireTimeoutMillis: 10000,
  createTimeoutMillis: 10000,
  retryDelayMs: 1000,
  retryAttempts: 3,
} as const;

// Additional query limits
export const QUERY_LIMITS_EXTENDED = {
  MEMORY_CHUNKS_LARGE: 500,
  CORRECTIONS_LIMIT: 1000,
  FEEDBACK_LIMIT: 1000,
} as const;

// Time intervals for queries
export const TIME_INTERVALS = {
  HOUR: '1 hour',
  DAY: '1 day',
  WEEK: '7 days',
  MONTH: '30 days',
} as const;

// Event Types - Canonical list for analytics
export const EVENT_TYPES = {
  // Auth & Onboarding
  SIGNUP: 'signup',
  LOGIN: 'login',
  LOGOUT: 'logout',
  INVITE_SENT: 'invite_sent',
  INVITE_ACCEPTED: 'invite_accepted',
  
  // Twin Management
  TWIN_CREATED: 'twin_created',
  TWIN_CREATION_FAILED: 'twin_creation_failed',
  ENHANCED_TWIN_CREATED: 'enhanced_twin_created',
  TWIN_MADE_PUBLIC: 'twin_made_public',
  TWIN_MADE_PRIVATE: 'twin_made_private',
  
  // Chat & Messaging
  CHAT_STARTED: 'chat_started',
  CHAT_CONTINUED: 'chat_continued',
  CHAT_CREATED: 'chat_created',
  CHAT_MESSAGE: 'chat_message',
  CHAT_DELETED: 'chat_deleted',
  PUBLIC_CHAT_STARTED: 'public_chat_started',
  DRAFT_GENERATED: 'draft_generated',
  MESSAGE_APPROVED: 'message_approved',
  MESSAGE_BLOCKED: 'message_blocked', // ✅ restricted content ke liye
  
  // Social
  TWIN_LIKED: 'twin_liked',
  TWIN_UNLIKED: 'twin_unliked',
  TWIN_FOLLOWED: 'twin_followed',
  TWIN_UNFOLLOWED: 'twin_unfollowed',
  TWIN_SHARED: 'twin_shared',
  SHARE_CLICKED: 'share_clicked',
  PROFILE_VIEWED: 'profile_viewed', // ✅ Profile view tracking
  
  // Privacy & Moderation
  PRIVACY_SETTINGS_UPDATED: 'privacy_settings_updated',
  USER_BLOCKED: 'user_blocked',
  USER_UNBLOCKED: 'user_unblocked',
  CONTENT_MODERATED: 'content_moderated',
  CONTENT_REPORTED: 'content_reported',
  
  // AI & Performance
  AI_RUN_CREATED: 'ai_run_created',
  LLM_USAGE: 'llm_usage', // ✅ Per-message token usage tracking
  
  // System
  ERROR: 'error',
  API_ERROR: 'api_error',
  RATE_LIMIT_EXCEEDED: 'rate_limit_exceeded', // ✅ Rate limit violations tracking
  CONTACT_FORM_SUBMITTED: 'contact_form_submitted', // ✅ Contact form submissions
  
  // Add if profile_completed is needed:
  PROFILE_COMPLETED: 'profile_completed', // Optional - add if you want to track this
  
  // Add if enhanced_twin_creation_failed is needed separately:
  ENHANCED_TWIN_CREATION_FAILED: 'enhanced_twin_creation_failed', // Optional
} as const;

// Token Quotas - Daily limits for LLM usage
export const TOKEN_QUOTAS = {
  // Anonymous public chat: hard wall → login required
  ANON_DAILY_TOKENS: 10000,

  // Logged-in: daily cap (adjust as you want)
  USER_DAILY_TOKENS: 100000,
} as const;

// ✅ MEMORY LIMITS - Prevent memory overload in LLM prompts
export const MEMORY_LIMITS = {
  MAX_FACTS: 4,
  MAX_PREFERENCES: 5,
  MAX_ALWAYS_NEVER_CHARS: 120, // Per item in always/never arrays
  MAX_BIO_CHARS: 150, // Maximum characters for twin bio/oneLineBio
} as const;

// ✅ RATE LIMITS - Prevent abuse of critical operations
export const OPERATION_RATE_LIMITS = {
  TWIN_DELETION: {
    windowMs: 24 * 60 * 60 * 1000, // 24 hours
    max: 2, // Max 1 deletion per 24 hours
  },
  TWIN_VISIBILITY_TOGGLE: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // Max 2 toggles per hour
  },
} as const;