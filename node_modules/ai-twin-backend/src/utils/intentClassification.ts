/**
 * Intent Classification System
 * Classifies user messages into different intents for better response shaping
 */

export type IntentType = 'plan' | 'casual' | 'qa' | 'emotional' | 'technical';

export interface IntentClassification {
  intent: IntentType;
  confidence: number;
  keywords: string[];
  suggestedResponseStyle: string;
}

/**
 * Classify user message intent
 */
export function classifyIntent(message: string): IntentClassification {
  const text = message.toLowerCase();
  
  // Plan/Strategy intent
  if (/(plan|steps|roadmap|strategy|breakdown|how to|process|workflow|method)/.test(text)) {
    return {
      intent: 'plan',
      confidence: 0.8,
      keywords: ['plan', 'steps', 'strategy'],
      suggestedResponseStyle: 'structured, actionable, numbered'
    };
  }
  
  // Casual/Social intent
  if (/(hey|hi|lol|haha|bro|what's up|how are you|good morning|good evening|thanks|thank you)/.test(text)) {
    return {
      intent: 'casual',
      confidence: 0.9,
      keywords: ['casual', 'social'],
      suggestedResponseStyle: 'friendly, conversational, brief'
    };
  }
  
  // Emotional intent
  if (/(sad|happy|excited|worried|stressed|anxious|depressed|angry|frustrated|overwhelmed|tired|exhausted)/.test(text)) {
    return {
      intent: 'emotional',
      confidence: 0.85,
      keywords: ['emotional', 'feelings'],
      suggestedResponseStyle: 'empathetic, supportive, understanding'
    };
  }
  
  // Technical intent
  if (/(code|programming|debug|error|bug|function|variable|algorithm|database|api|server|frontend|backend)/.test(text)) {
    return {
      intent: 'technical',
      confidence: 0.8,
      keywords: ['technical', 'programming'],
      suggestedResponseStyle: 'precise, technical, detailed'
    };
  }
  
  // Default to Q&A
  return {
    intent: 'qa',
    confidence: 0.6,
    keywords: ['question', 'answer'],
    suggestedResponseStyle: 'informative, helpful, detailed'
  };
}

/**
 * Shape response based on intent
 */
export function shapeByIntent(text: string, intent: IntentType, userStyle: any): string {
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

/**
 * Convert text to numbered list format
 */
function toNumberedList(text: string): string {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  return sentences.map((sentence, index) => 
    `${index + 1}. ${sentence.trim()}`
  ).join('\n');
}

/**
 * Convert to 1-2 line format for casual responses
 */
function toOneTwoLiners(text: string, options: { allowEmoji: boolean; maxLength: number }): string {
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

/**
 * Add empathy markers for emotional responses
 */
function addEmpathyMarkers(text: string, userStyle: any): string {
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

/**
 * Tighten technical text
 */
function tightenTechnicalText(text: string): string {
  // Remove unnecessary words, make more concise
  return text
    .replace(/\b(actually|basically|essentially|literally|really|very|quite|rather)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * General text tightening
 */
function tightenText(text: string): string {
  return text
    .replace(/\b(I think|I believe|I feel|in my opinion|personally)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}
