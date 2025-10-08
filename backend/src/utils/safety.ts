/**
 * Safety and Content Filtering Utilities
 * Prevents impersonation, toxicity, and inappropriate content
 */

// Celebrity and brand names that could be used for impersonation
const CELEBRITY_BRAND_LIST = [
  // Indian celebrities
  'Shah Rukh Khan', 'Amitabh Bachchan', 'Salman Khan', 'Aamir Khan', 'Akshay Kumar',
  'Deepika Padukone', 'Priyanka Chopra', 'Alia Bhatt', 'Ranbir Kapoor', 'Ranveer Singh',
  'Virat Kohli', 'MS Dhoni', 'Sachin Tendulkar', 'Rohit Sharma', 'Hardik Pandya',
  'PM Modi', 'Narendra Modi', 'Rahul Gandhi', 'Arvind Kejriwal', 'Mamata Banerjee',
  
  // International celebrities
  'Elon Musk', 'Bill Gates', 'Jeff Bezos', 'Mark Zuckerberg', 'Tim Cook',
  'Taylor Swift', 'Ariana Grande', 'Justin Bieber', 'Drake', 'Kanye West',
  'Barack Obama', 'Donald Trump', 'Joe Biden', 'Vladimir Putin', 'Xi Jinping',
  
  // Brands and companies
  'Apple', 'Google', 'Microsoft', 'Amazon', 'Meta', 'Facebook', 'Instagram', 'Twitter',
  'Netflix', 'Disney', 'Spotify', 'Uber', 'Tesla', 'SpaceX', 'OpenAI', 'ChatGPT',
  'Nike', 'Adidas', 'McDonald\'s', 'Coca Cola', 'Pepsi', 'Samsung', 'Sony',
  
  // Media and entertainment
  'BBC', 'CNN', 'Fox News', 'Times of India', 'Hindustan Times', 'The Hindu',
  'Bollywood', 'Hollywood', 'Tollywood', 'Kollywood',
];

// Banned words and phrases
const BANNED_WORDS = [
  // Violence and harm
  'suicide', 'self-harm', 'kill yourself', 'bomb', 'terrorist', 'terrorism',
  'murder', 'assassination', 'violence', 'weapon', 'gun', 'knife',
  
  // Hate speech
  'hate', 'racist', 'sexist', 'homophobic', 'discrimination', 'prejudice',
  
  // Illegal activities
  'drugs', 'cocaine', 'heroin', 'marijuana', 'weed', 'alcohol abuse',
  'fraud', 'scam', 'theft', 'robbery', 'money laundering',
  
  // Adult content
  'porn', 'pornography', 'sex', 'sexual', 'nude', 'naked',
  
  // Spam and phishing
  'click here', 'free money', 'win lottery', 'congratulations you won',
  'verify account', 'suspended account', 'urgent action required',
];

// Suspicious patterns
const SUSPICIOUS_PATTERNS = [
  /https?:\/\/[^\s]+/gi, // URLs
  /[0-9]{4}[-\s]?[0-9]{4}[-\s]?[0-9]{4}[-\s]?[0-9]{4}/gi, // Credit card numbers
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi, // Email addresses
  /\+?[0-9]{10,15}/gi, // Phone numbers
];

/**
 * Check if text contains celebrity or brand names (impersonation risk)
 */
export function hasImpersonationRisk(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  
  const lowerText = text.toLowerCase();
  return CELEBRITY_BRAND_LIST.some(name => 
    lowerText.includes(name.toLowerCase())
  );
}

/**
 * Check if text contains banned words
 */
export function hasBannedWords(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  
  const lowerText = text.toLowerCase();
  return BANNED_WORDS.some(word => 
    lowerText.includes(word.toLowerCase())
  );
}

/**
 * Check if text contains suspicious patterns
 */
export function hasSuspiciousPatterns(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  
  return SUSPICIOUS_PATTERNS.some(pattern => pattern.test(text));
}

/**
 * Comprehensive content safety check
 */
export function isContentSafe(text: string): {
  safe: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  
  if (hasImpersonationRisk(text)) {
    reasons.push('Contains celebrity or brand names');
  }
  
  if (hasBannedWords(text)) {
    reasons.push('Contains inappropriate content');
  }
  
  if (hasSuspiciousPatterns(text)) {
    reasons.push('Contains suspicious patterns (URLs, personal info)');
  }
  
  return {
    safe: reasons.length === 0,
    reasons
  };
}

/**
 * Sanitize text by removing suspicious patterns
 */
export function sanitizeText(text: string): string {
  if (!text || typeof text !== 'string') return '';
  
  let sanitized = text;
  
  // Remove URLs
  sanitized = sanitized.replace(/https?:\/\/[^\s]+/gi, '[URL_REMOVED]');
  
  // Remove email addresses
  sanitized = sanitized.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi, '[EMAIL_REMOVED]');
  
  // Remove phone numbers
  sanitized = sanitized.replace(/\+?[0-9]{10,15}/gi, '[PHONE_REMOVED]');
  
  // Remove credit card patterns
  sanitized = sanitized.replace(/[0-9]{4}[-\s]?[0-9]{4}[-\s]?[0-9]{4}[-\s]?[0-9]{4}/gi, '[CARD_REMOVED]');
  
  return sanitized.trim();
}

/**
 * Validate message length
 */
export function validateMessageLength(text: string, minLength: number = 1, maxLength: number = 300): boolean {
  if (!text || typeof text !== 'string') return false;
  return text.length >= minLength && text.length <= maxLength;
}

/**
 * Validate twin samples
 */
export function validateTwinSamples(samples: string[]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  if (!Array.isArray(samples)) {
    errors.push('Samples must be an array');
    return { valid: false, errors };
  }
  
  if (samples.length < 1) {
    errors.push('At least 1 sample required');
  }
  
  if (samples.length > 5) {
    errors.push('Maximum 5 samples allowed');
  }
  
  const totalLength = samples.reduce((sum, sample) => sum + (sample?.length || 0), 0);
  if (totalLength < 100) {
    errors.push('Total samples must be at least 100 characters');
  }
  
  if (totalLength > 3000) {
    errors.push('Total samples must not exceed 3000 characters');
  }
  
  // Check each sample
  samples.forEach((sample, index) => {
    if (!sample || typeof sample !== 'string') {
      errors.push(`Sample ${index + 1} is invalid`);
    } else if (sample.length < 10) {
      errors.push(`Sample ${index + 1} is too short (minimum 10 characters)`);
    } else if (sample.length > 1000) {
      errors.push(`Sample ${index + 1} is too long (maximum 1000 characters)`);
    }
  });
  
  return {
    valid: errors.length === 0,
    errors
  };
}
