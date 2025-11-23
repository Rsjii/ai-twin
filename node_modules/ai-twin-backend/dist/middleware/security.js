"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateSamplesLength = exports.validateMessageLength = exports.sanitizeText = exports.checkBlacklist = exports.BANNED_WORDS = exports.CELEBRITY_BRAND_BLACKLIST = void 0;
exports.CELEBRITY_BRAND_BLACKLIST = [
    'elon musk', 'jeff bezos', 'bill gates', 'steve jobs', 'mark zuckerberg',
    'apple', 'google', 'microsoft', 'amazon', 'tesla', 'meta', 'facebook',
    'instagram', 'twitter', 'x.com', 'tiktok', 'snapchat', 'youtube',
    'netflix', 'spotify', 'uber', 'airbnb', 'nike', 'adidas', 'coca cola',
    'pepsi', 'mcdonalds', 'kfc', 'starbucks', 'disney', 'marvel', 'dc',
    'sony', 'samsung', 'lg', 'huawei', 'xiaomi', 'oneplus', 'oppo', 'vivo'
];
exports.BANNED_WORDS = [
    'hate', 'kill', 'die', 'suicide', 'murder', 'violence', 'terrorist',
    'bomb', 'weapon', 'drug', 'cocaine', 'heroin', 'marijuana', 'weed',
    'sex', 'porn', 'nude', 'naked', 'rape', 'abuse', 'harassment',
    'racist', 'discrimination', 'slave', 'nazi', 'hitler', 'isis',
    'scam', 'fraud', 'steal', 'rob', 'cheat', 'lie', 'fake'
];
const checkBlacklist = (text) => {
    const lowerText = text.toLowerCase();
    for (const item of exports.CELEBRITY_BRAND_BLACKLIST) {
        if (lowerText.includes(item)) {
            return true;
        }
    }
    for (const word of exports.BANNED_WORDS) {
        if (lowerText.includes(word)) {
            return true;
        }
    }
    return false;
};
exports.checkBlacklist = checkBlacklist;
const sanitizeText = (text) => {
    let sanitized = text.replace(/\s+/g, ' ').trim();
    sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    sanitized = sanitized.replace(/<[^>]*>/g, '');
    return sanitized;
};
exports.sanitizeText = sanitizeText;
const validateMessageLength = (text, maxLength = 300) => {
    return text.length <= maxLength && text.length > 0;
};
exports.validateMessageLength = validateMessageLength;
const validateSamplesLength = (text, minLength = 100, maxLength = 3000) => {
    return text.length >= minLength && text.length <= maxLength;
};
exports.validateSamplesLength = validateSamplesLength;
//# sourceMappingURL=security.js.map