"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CELEBRITY_BRAND_BLACKLIST = void 0;
exports.hasImpersonationRisk = hasImpersonationRisk;
exports.hasBannedWords = hasBannedWords;
exports.hasSuspiciousPatterns = hasSuspiciousPatterns;
exports.isContentSafe = isContentSafe;
exports.checkBlacklist = checkBlacklist;
exports.sanitizeText = sanitizeText;
exports.validateMessageLength = validateMessageLength;
exports.validateSamplesLength = validateSamplesLength;
exports.validateTwinSamples = validateTwinSamples;
const CELEBRITY_BRAND_LIST = [
    'Shah Rukh Khan', 'Amitabh Bachchan', 'Salman Khan', 'Aamir Khan', 'Akshay Kumar',
    'Deepika Padukone', 'Priyanka Chopra', 'Alia Bhatt', 'Ranbir Kapoor', 'Ranveer Singh',
    'Virat Kohli', 'MS Dhoni', 'Sachin Tendulkar', 'Rohit Sharma', 'Hardik Pandya',
    'PM Modi', 'Narendra Modi', 'Rahul Gandhi', 'Arvind Kejriwal', 'Mamata Banerjee',
    'Elon Musk', 'Bill Gates', 'Jeff Bezos', 'Mark Zuckerberg', 'Tim Cook',
    'Taylor Swift', 'Ariana Grande', 'Justin Bieber', 'Drake', 'Kanye West',
    'Barack Obama', 'Donald Trump', 'Joe Biden', 'Vladimir Putin', 'Xi Jinping',
    'Apple', 'Google', 'Microsoft', 'Amazon', 'Meta', 'Facebook', 'Instagram', 'Twitter',
    'Netflix', 'Disney', 'Spotify', 'Uber', 'Tesla', 'SpaceX', 'OpenAI', 'ChatGPT',
    'Nike', 'Adidas', 'McDonald\'s', 'Coca Cola', 'Pepsi', 'Samsung', 'Sony',
    'x.com', 'TikTok', 'Snapchat', 'YouTube', 'Airbnb', 'KFC', 'Starbucks',
    'Marvel', 'DC', 'LG', 'Huawei', 'Xiaomi', 'OnePlus', 'Oppo', 'Vivo',
    'BBC', 'CNN', 'Fox News', 'Times of India', 'Hindustan Times', 'The Hindu',
    'Bollywood', 'Hollywood', 'Tollywood', 'Kollywood',
];
const BANNED_WORDS = [
    'suicide', 'self-harm', 'kill yourself', 'bomb', 'terrorist', 'terrorism',
    'murder', 'assassination', 'violence', 'weapon', 'gun', 'knife',
    'kill', 'die', 'rape', 'abuse', 'harassment',
    'hate', 'racist', 'sexist', 'homophobic', 'discrimination', 'prejudice',
    'slave', 'nazi', 'hitler', 'isis',
    'drugs', 'drug', 'cocaine', 'heroin', 'marijuana', 'weed', 'alcohol abuse',
    'fraud', 'scam', 'theft', 'robbery', 'money laundering', 'steal', 'rob', 'cheat', 'lie', 'fake',
    'porn', 'pornography', 'sex', 'sexual', 'nude', 'naked',
    'click here', 'free money', 'win lottery', 'congratulations you won',
    'verify account', 'suspended account', 'urgent action required',
];
const SUSPICIOUS_PATTERNS = [
    /https?:\/\/[^\s]+/gi,
    /[0-9]{4}[-\s]?[0-9]{4}[-\s]?[0-9]{4}[-\s]?[0-9]{4}/gi,
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi,
    /\+?[0-9]{10,15}/gi,
];
exports.CELEBRITY_BRAND_BLACKLIST = CELEBRITY_BRAND_LIST.map(s => s.toLowerCase());
function hasImpersonationRisk(text) {
    if (!text || typeof text !== 'string')
        return false;
    const lowerText = text.toLowerCase();
    return CELEBRITY_BRAND_LIST.some(name => lowerText.includes(name.toLowerCase()));
}
function hasBannedWords(text) {
    if (!text || typeof text !== 'string')
        return false;
    const lowerText = text.toLowerCase();
    return BANNED_WORDS.some(word => lowerText.includes(word.toLowerCase()));
}
function hasSuspiciousPatterns(text) {
    if (!text || typeof text !== 'string')
        return false;
    return SUSPICIOUS_PATTERNS.some(pattern => pattern.test(text));
}
function isContentSafe(text) {
    const reasons = [];
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
function checkBlacklist(text) {
    if (!text || typeof text !== 'string')
        return false;
    return hasImpersonationRisk(text) || hasBannedWords(text);
}
function sanitizeText(text) {
    if (!text || typeof text !== 'string')
        return '';
    let sanitized = text;
    sanitized = sanitized.replace(/\s+/g, ' ').trim();
    sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    sanitized = sanitized.replace(/<[^>]*>/g, '');
    sanitized = sanitized.replace(/https?:\/\/[^\s]+/gi, '[URL_REMOVED]');
    sanitized = sanitized.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi, '[EMAIL_REMOVED]');
    sanitized = sanitized.replace(/\+?[0-9]{10,15}/gi, '[PHONE_REMOVED]');
    sanitized = sanitized.replace(/[0-9]{4}[-\s]?[0-9]{4}[-\s]?[0-9]{4}[-\s]?[0-9]{4}/gi, '[CARD_REMOVED]');
    return sanitized.trim();
}
function validateMessageLength(text, minLength = 1, maxLength = 300) {
    if (!text || typeof text !== 'string')
        return false;
    return text.length >= minLength && text.length <= maxLength;
}
function validateSamplesLength(text, minLength = 100, maxLength = 3000) {
    if (!text || typeof text !== 'string')
        return false;
    return text.length >= minLength && text.length <= maxLength;
}
function validateTwinSamples(samples) {
    const errors = [];
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
    samples.forEach((sample, index) => {
        if (!sample || typeof sample !== 'string') {
            errors.push(`Sample ${index + 1} is invalid`);
        }
        else if (sample.length < 10) {
            errors.push(`Sample ${index + 1} is too short (minimum 10 characters)`);
        }
        else if (sample.length > 1000) {
            errors.push(`Sample ${index + 1} is too long (maximum 1000 characters)`);
        }
    });
    return {
        valid: errors.length === 0,
        errors
    };
}
//# sourceMappingURL=safety.js.map