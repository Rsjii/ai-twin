/**
 * Safety and Content Filtering Utilities
 * Consolidated from security.ts and safety.ts
 * Prevents impersonation, toxicity, and inappropriate content
 */

// ========== PROFANITY / SWEAR WORDS ONLY (Actual bad words) ==========
const PROFANITY_WORDS = [
  // English profanity (common swear words)
  'fuck', 'fucking', 'fucked', 'fucker', 'fuckoff', 'fuckyou',
  'shit', 'shitting', 'shitted', 'bullshit',
  'damn', 'dammit', 'goddamn',
  'bitch', 'bitches', 'bitching',
  'asshole', 'ass', 'bastard',
  'crap', 'crapola',
  'piss', 'pissing', 'pissed',
  'hell', 'hells',
  'dick', 'dicks', 'cock', 'cocks',
  'pussy', 'pussies',
  'whore', 'whores',
  'slut', 'sluts',
  'cunt', 'cunts',
  // Porn / explicit content
  'porn', 'porno', 'pornography', 'pornographic',
  'xxx',
  'motherfucker', 'motherfucking',
  'retard', 'retarded',
  'nigger', 'nigga', 'niggas', // Racial slurs
  'chink', 'gook', // Racial slurs
  
  // Hindi/Urdu profanity (common gaali)
  'chutiya', 'chutiyapa', 'chutiye', 'chutiyaa',
  'bhenchod', 'behenchod', 'bc', 'bhenchodd',
  'madarchod', 'madarchod', 'mc', 'madarchodd',
  'bhosdike', 'bhosdi', 'bsdk', 'bhosdikey',
  'lund', 'loda', 'lode', 'loond',
  'gandu', 'gand', 'gaandu', 'gaand',
  'harami', 'haramkhor', 'haraami',
  'kutta', 'kutte', 'kuttey',
  'sala', 'saala', 'saale',
  'randi', 'raand', 'raandi',
  'chakka', 'chakke', 'chakkey',
  'hijra', 'hijre', 'hijrey',
  'laude', 'lawde', 'lawda',
  'terima', 'teri maa', 'teri ma',
  'maa chuda', 'maa chod', 'machuda',
  'behen ki', 'behen ke', 'behen ka',
  'bhosdi ke', 'bhosdi ka', 'bhosdi ki',
  
  // More variations
  'fuck off', 'fuck you', 'fuck u',
  'go to hell', 'go fuck yourself',
  'piece of shit', 'pos',
  'son of a bitch', 'sob',
  'mother fucker', 'motherfucker',
  
  // Serious threats only (keep these)
  'kill yourself', 'kys', 'suicide', 'self-harm', 'self harm',
  'bomb', 'terrorist', 'terrorism', 'bomb threat',
  'rape', 'rapist', 'raping', 'sexual assault',
  'murder', 'kill you', 'i will kill',
  'bombing', 'terror attack',
];

// ========== SERIOUS THREATS (Keep these, but only exact phrases) ==========
const SERIOUS_THREATS = [
  'kill yourself', 'kys', 'suicide', 'self-harm',
  'bomb threat', 'terrorist attack', 'terrorism',
  'rape', 'sexual assault', 'child abuse',
];

// ========== REMOVE CELEBRITY/BRAND LIST (Not needed for message blocking) ==========
// Keep this for other uses (like twin name validation), but don't use in checkBlacklist
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
  
  // Brands and companies (merged from both files)
  'Apple', 'Google', 'Microsoft', 'Amazon', 'Meta', 'Facebook', 'Instagram', 'Twitter',
  'Netflix', 'Disney', 'Spotify', 'Uber', 'Tesla', 'SpaceX', 'OpenAI', 'ChatGPT',
  'Nike', 'Adidas', 'McDonald\'s', 'Coca Cola', 'Pepsi', 'Samsung', 'Sony',
  'x.com', 'TikTok', 'Snapchat', 'YouTube', 'Airbnb', 'KFC', 'Starbucks',
  'Marvel', 'DC', 'LG', 'Huawei', 'Xiaomi', 'OnePlus', 'Oppo', 'Vivo',
  
  // Media and entertainment
  'BBC', 'CNN', 'Fox News', 'Times of India', 'Hindustan Times', 'The Hindu',
  'Bollywood', 'Hollywood', 'Tollywood', 'Kollywood',
];

// ========== SUSPICIOUS PATTERNS (for sanitization, not blocking) ==========
const SUSPICIOUS_PATTERNS = [
  /https?:\/\/[^\s]+/gi, // URLs
  /[0-9]{4}[-\s]?[0-9]{4}[-\s]?[0-9]{4}[-\s]?[0-9]{4}/gi, // Credit card numbers
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi, // Email addresses
  /\+?[0-9]{10,15}/gi, // Phone numbers
];

// ========== EXPORT BLACKLISTS (for external use if needed) ==========
export const CELEBRITY_BRAND_BLACKLIST = CELEBRITY_BRAND_LIST.map(s => s.toLowerCase());

// ========== CONTENT CHECKING FUNCTIONS ==========

/**
 * Get repeated character variations (same logic as common words).
 * Collapses 3+ repeats to BOTH 1 and 2 variations, and handles short inputs.
 * Keeps spaces/punctuation intact for word boundary matching.
 * Examples:
 * - "pornnnnn" -> ["pornnnnn", "porn", "pornn"]
 * - "fuuuck" -> ["fuuuck", "fuck", "fuuck"]
 * - "hii" -> ["hii", "hi", "hii"] (short input, 2+ repeats)
 * - "cool" -> ["cool"] (no repeats, stays as is)
 */
function getRepeatedCharVariationsForProfanity(text: string): string[] {
  if (!text || typeof text !== 'string') return [text];
  
  const lowerText = text.toLowerCase();
  const variations = new Set<string>([lowerText]); // Always include original
  
  // ✅ For very short inputs (<=4), also handle 2+ repeats (covers "okk", "hii")
  if (lowerText.length <= 4 && /(.)\1+/.test(lowerText)) {
    variations.add(lowerText.replace(/(.)\1+/g, '$1'));   // collapse to 1
    variations.add(lowerText.replace(/(.)\1+/g, '$1$1')); // collapse to 2
  }
  
  // ✅ For general inputs, only treat 3+ repeats (avoid damaging normal words)
  if (/(.)\1{2,}/.test(lowerText)) {
    variations.add(lowerText.replace(/(.)\1{2,}/g, '$1'));   // collapse to 1
    variations.add(lowerText.replace(/(.)\1{2,}/g, '$1$1')); // collapse to 2
  }
  
  return Array.from(variations);
}

/**
 * Check if text contains profanity/swear words (actual bad words only)
 * Uses same repeated-character normalization logic as common words
 */
export function hasProfanity(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  
  // ✅ Get all variations (same logic as common words)
  const variations = getRepeatedCharVariationsForProfanity(text);
  
  // Use word boundaries to avoid false positives (e.g., "class" shouldn't match "ass")
  return PROFANITY_WORDS.some(word => {
    const regex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    // Check ALL variations (original + collapsed versions)
    return variations.some(variation => regex.test(variation));
  });
}

/**
 * Check if text contains serious threats (exact phrases only)
 */
export function hasSeriousThreats(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  
  const lowerText = text.toLowerCase();
  return SERIOUS_THREATS.some(threat => lowerText.includes(threat.toLowerCase()));
}

/**
 * Check if text contains celebrity or brand names (impersonation risk)
 * NOTE: This is NOT used in message blocking anymore, only for twin name validation
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
 * NOTE: Deprecated - use hasProfanity() instead for message blocking
 * Kept for backward compatibility but returns false (no longer blocks)
 */
export function hasBannedWords(text: string): boolean {
  // No longer blocking common words - too many false positives
  // Use hasProfanity() for actual profanity checking
  return false;
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
 * Used for twin creation (samples/bio) - includes celebrity checking
 * NOTE: For message blocking, use checkBlacklist() instead (only profanity)
 */
export function isContentSafe(text: string): {
  safe: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  
  // Check for celebrity/brand names (impersonation risk) - KEEP for twin creation
  if (hasImpersonationRisk(text)) {
    reasons.push('Contains celebrity or brand names');
  }
  
  // Check for profanity (also block in twin creation)
  if (hasProfanity(text)) {
    reasons.push('Contains profanity or inappropriate language');
  }
  
  // Check for serious threats
  if (hasSeriousThreats(text)) {
    reasons.push('Contains serious threats');
  }
  
  // Note: Suspicious patterns (URLs, emails) are sanitized, not blocked
  // This allows users to mention URLs in twin samples, they'll just be sanitized
  
  return {
    safe: reasons.length === 0,
    reasons
  };
}

/**
 * Convenience function: Check blacklist (ONLY profanity + serious threats)
 * REMOVED: Celebrity/brand blocking (too strict for normal chat)
 */
export function checkBlacklist(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  // Only check for actual profanity and serious threats
  return hasProfanity(text) || hasSeriousThreats(text);
  // REMOVED: hasImpersonationRisk(text) - too strict
  // REMOVED: hasBannedWords(text) - too many false positives
}

// ========== SANITIZATION FUNCTIONS ==========

/**
 * Sanitize text by removing suspicious patterns and HTML
 * Enhanced version that combines both security.ts and safety.ts functionality
 */
export function sanitizeText(text: string): string {
  if (!text || typeof text !== 'string') return '';
  
  let sanitized = text;
  
  // Remove excessive whitespace (from security.ts)
  sanitized = sanitized.replace(/\s+/g, ' ').trim();
  
  // Remove potential script tags (from security.ts)
  sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  
  // Remove potential HTML tags (from security.ts)
  sanitized = sanitized.replace(/<[^>]*>/g, '');
  
  // Remove URLs (from safety.ts)
  sanitized = sanitized.replace(/https?:\/\/[^\s]+/gi, '[URL_REMOVED]');
  
  // Remove email addresses (from safety.ts)
  sanitized = sanitized.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi, '[EMAIL_REMOVED]');
  
  // Remove phone numbers (from safety.ts)
  sanitized = sanitized.replace(/\+?[0-9]{10,15}/gi, '[PHONE_REMOVED]');
  
  // Remove credit card patterns (from safety.ts)
  sanitized = sanitized.replace(/[0-9]{4}[-\s]?[0-9]{4}[-\s]?[0-9]{4}[-\s]?[0-9]{4}/gi, '[CARD_REMOVED]');
  
  return sanitized.trim();
}

// ========== VALIDATION FUNCTIONS ==========

/**
 * Validate message length (enhanced version with minLength support)
 * Combines functionality from both security.ts and safety.ts
 */
export function validateMessageLength(
  text: string, 
  minLength: number = 1, 
  maxLength: number = 300
): boolean {
  if (!text || typeof text !== 'string') return false;
  return text.length >= minLength && text.length <= maxLength;
}

/**
 * Validate samples length (simple string length check)
 * From security.ts - kept for backward compatibility
 */
export function validateSamplesLength(
  text: string, 
  minLength: number = 100, 
  maxLength: number = 3000
): boolean {
  if (!text || typeof text !== 'string') return false;
  return text.length >= minLength && text.length <= maxLength;
}

/**
 * Validate twin samples (comprehensive array validation)
 * From safety.ts - more detailed validation
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
