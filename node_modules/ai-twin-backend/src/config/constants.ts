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