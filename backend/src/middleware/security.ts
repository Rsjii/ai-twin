// Blacklist and toxicity checks
export const CELEBRITY_BRAND_BLACKLIST = [
  'elon musk', 'jeff bezos', 'bill gates', 'steve jobs', 'mark zuckerberg',
  'apple', 'google', 'microsoft', 'amazon', 'tesla', 'meta', 'facebook',
  'instagram', 'twitter', 'x.com', 'tiktok', 'snapchat', 'youtube',
  'netflix', 'spotify', 'uber', 'airbnb', 'nike', 'adidas', 'coca cola',
  'pepsi', 'mcdonalds', 'kfc', 'starbucks', 'disney', 'marvel', 'dc',
  'sony', 'samsung', 'lg', 'huawei', 'xiaomi', 'oneplus', 'oppo', 'vivo'
];

export const BANNED_WORDS = [
  'hate', 'kill', 'die', 'suicide', 'murder', 'violence', 'terrorist',
  'bomb', 'weapon', 'drug', 'cocaine', 'heroin', 'marijuana', 'weed',
  'sex', 'porn', 'nude', 'naked', 'rape', 'abuse', 'harassment',
  'racist', 'discrimination', 'slave', 'nazi', 'hitler', 'isis',
  'scam', 'fraud', 'steal', 'rob', 'cheat', 'lie', 'fake'
];

export const checkBlacklist = (text: string): boolean => {
  const lowerText = text.toLowerCase();
  
  // Check celebrity/brand blacklist
  for (const item of CELEBRITY_BRAND_BLACKLIST) {
    if (lowerText.includes(item)) {
      return true;
    }
  }
  
  // Check banned words
  for (const word of BANNED_WORDS) {
    if (lowerText.includes(word)) {
      return true;
    }
  }
  
  return false;
};

export const sanitizeText = (text: string): string => {
  // Remove excessive whitespace
  let sanitized = text.replace(/\s+/g, ' ').trim();
  
  // Remove potential script tags
  sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  
  // Remove potential HTML tags
  sanitized = sanitized.replace(/<[^>]*>/g, '');
  
  return sanitized;
};

export const validateMessageLength = (text: string, maxLength: number = 300): boolean => {
  return text.length <= maxLength && text.length > 0;
};

export const validateSamplesLength = (text: string, minLength: number = 100, maxLength: number = 3000): boolean => {
  return text.length >= minLength && text.length <= maxLength;
};
