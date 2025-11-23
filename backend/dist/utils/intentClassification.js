"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyIntent = classifyIntent;
exports.shapeByIntent = shapeByIntent;
function classifyIntent(message) {
    const text = message.toLowerCase();
    if (/(plan|steps|roadmap|strategy|breakdown|how to|process|workflow|method)/.test(text)) {
        return {
            intent: 'plan',
            confidence: 0.8,
            keywords: ['plan', 'steps', 'strategy'],
            suggestedResponseStyle: 'structured, actionable, numbered'
        };
    }
    if (/(hey|hi|lol|haha|bro|what's up|how are you|good morning|good evening|thanks|thank you)/.test(text)) {
        return {
            intent: 'casual',
            confidence: 0.9,
            keywords: ['casual', 'social'],
            suggestedResponseStyle: 'friendly, conversational, brief'
        };
    }
    if (/(sad|happy|excited|worried|stressed|anxious|depressed|angry|frustrated|overwhelmed|tired|exhausted)/.test(text)) {
        return {
            intent: 'emotional',
            confidence: 0.85,
            keywords: ['emotional', 'feelings'],
            suggestedResponseStyle: 'empathetic, supportive, understanding'
        };
    }
    if (/(code|programming|debug|error|bug|function|variable|algorithm|database|api|server|frontend|backend)/.test(text)) {
        return {
            intent: 'technical',
            confidence: 0.8,
            keywords: ['technical', 'programming'],
            suggestedResponseStyle: 'precise, technical, detailed'
        };
    }
    return {
        intent: 'qa',
        confidence: 0.6,
        keywords: ['question', 'answer'],
        suggestedResponseStyle: 'informative, helpful, detailed'
    };
}
function shapeByIntent(text, intent, userStyle) {
    switch (intent) {
        case 'plan':
            return toNumberedList(text) + "\n\nNext step: pick one and do it today.";
        case 'casual':
            return toOneTwoLiners(text, {
                allowEmoji: userStyle.emoji_usage > 0.3,
                maxLength: 100
            });
        case 'emotional':
            return addEmpathyMarkers(text, userStyle);
        case 'technical':
            return tightenTechnicalText(text);
        default:
            return tightenText(text);
    }
}
function toNumberedList(text) {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    return sentences.map((sentence, index) => `${index + 1}. ${sentence.trim()}`).join('\n');
}
function toOneTwoLiners(text, options) {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const firstTwo = sentences.slice(0, 2);
    let result = firstTwo.join('. ').trim();
    if (result.length > options.maxLength) {
        result = result.substring(0, options.maxLength - 3) + '...';
    }
    if (options.allowEmoji && Math.random() > 0.7) {
        const emojis = ['😊', '👍', '✨', '🎯', '💡'];
        result += ' ' + emojis[Math.floor(Math.random() * emojis.length)];
    }
    return result;
}
function addEmpathyMarkers(text, userStyle) {
    const empathyStarters = [
        'I understand how you feel.',
        'That sounds really tough.',
        'I can see why you\'d feel that way.',
        'That must be really hard.',
        'I hear you.'
    ];
    const starter = empathyStarters[Math.floor(Math.random() * empathyStarters.length)];
    return `${starter} ${text}`;
}
function tightenTechnicalText(text) {
    return text
        .replace(/\b(actually|basically|essentially|literally|really|very|quite|rather)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
}
function tightenText(text) {
    return text
        .replace(/\b(I think|I believe|I feel|in my opinion|personally)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
}
//# sourceMappingURL=intentClassification.js.map