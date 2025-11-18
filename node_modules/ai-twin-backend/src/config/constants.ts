export const ADMIN_EMAILS = [
    'admin@aitwin.com',
    'i@gmail.com',
    'k@gmail.com'
  ] as const;

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
  max: 5,
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