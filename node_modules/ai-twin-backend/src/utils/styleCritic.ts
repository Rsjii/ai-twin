/**
 * Style Critic System
 * Evaluates and improves AI responses to match user's style
 */

import OpenAI from 'openai';
import { config } from '../config/env';

const openai = new OpenAI({
  apiKey: config.openaiApiKey,
});

export interface StyleCriticResult {
  score: number; // 0-100
  rewrite?: string;
  notes: string;
  issues: string[];
  suggestions: string[];
}

export interface StyleProfile {
  sentences: 'short' | 'medium' | 'long';
  tone: 'casual' | 'witty' | 'serious' | 'friendly' | 'professional';
  signature: string[];
  emoji: 'none' | 'light' | 'moderate' | 'heavy';
  formality: number; // 0-1
  humor: 'none' | 'light' | 'moderate' | 'heavy';
  questionFreq: number; // 0-1
  responseLength: 'brief' | 'detailed' | 'comprehensive';
}

/**
 * Run style critic on a draft response
 */
export async function runStyleCritic(draft: string, twin: any): Promise<StyleCriticResult> {
  try {
    const styleProfile = extractStyleProfile(twin);
    
    const prompt = `You are a style critic. Score the DRAFT (0-100) for matching this style profile.

STYLE PROFILE:
- Sentences: ${styleProfile.sentences}
- Tone: ${styleProfile.tone}
- Formality: ${styleProfile.formality} (0=casual, 1=formal)
- Humor: ${styleProfile.humor}
- Question Frequency: ${styleProfile.questionFreq}
- Response Length: ${styleProfile.responseLength}
- Signature Phrases: ${styleProfile.signature.join(', ')}
- Emoji Usage: ${styleProfile.emoji}

DRAFT TO CRITIQUE:
"${draft}"

CRITIQUE RULES:
1. Score 0-100 based on style match
2. If score < 80, provide a rewrite
3. Check for generic AI phrases (banlist)
4. Ensure signature phrases are used naturally
5. Match the specified tone and formality
6. Use appropriate sentence length
7. Include questions if questionFreq > 0.3

Return JSON only:
{
  "score": 0-100,
  "rewrite": "improved version or empty string",
  "notes": "brief explanation",
  "issues": ["list of style issues"],
  "suggestions": ["improvement suggestions"]
}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: 'Critique this draft for style match' }
      ],
      temperature: 0.3,
      max_tokens: 800,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from style critic');
    }

    const result = JSON.parse(content) as StyleCriticResult;
    
    // Validate result
    if (typeof result.score !== 'number' || result.score < 0 || result.score > 100) {
      throw new Error('Invalid score from style critic');
    }

    return result;
  } catch (error) {
    console.error('Style critic error:', error);
    return {
      score: 50,
      notes: 'Style critic failed',
      issues: ['Style critic unavailable'],
      suggestions: ['Manual review recommended']
    };
  }
}

/**
 * Extract style profile from twin data
 */
function extractStyleProfile(twin: any): StyleProfile {
  const styleVector = twin.styleVector || {};
  
  return {
    sentences: styleVector.sentence_length || 'medium',
    tone: styleVector.tone || 'casual',
    signature: styleVector.signature_patterns || [],
    emoji: getEmojiLevel(styleVector.emoji_usage || 0.3),
    formality: styleVector.formality_level || 0.5,
    humor: styleVector.humor_style || 'light',
    questionFreq: styleVector.question_frequency || 0.4,
    responseLength: styleVector.response_length_preference || 'detailed'
  };
}

/**
 * Convert emoji usage number to level
 */
function getEmojiLevel(usage: number): 'none' | 'light' | 'moderate' | 'heavy' {
  if (usage < 0.1) return 'none';
  if (usage < 0.3) return 'light';
  if (usage < 0.6) return 'moderate';
  return 'heavy';
}

/**
 * Check if text contains banned phrases
 */
export function checkBanlist(text: string): boolean {
  const bannedPhrases = [
    /as an ai/i,
    /as a language model/i,
    /i'm an ai/i,
    /i'm a language model/i,
    /i apologize/i,
    /i'm sorry/i,
    /in conclusion/i,
    /to summarize/i,
    /let me know if you need/i,
    /feel free to ask/i,
    /i'm here to help/i,
    /is there anything else/i
  ];
  
  return bannedPhrases.some(pattern => pattern.test(text));
}

/**
 * Rewrite text to remove banned phrases
 */
export async function rewriteBanlist(text: string): Promise<string> {
  try {
    const prompt = `Rewrite the reply below to remove AI assistant language, apologies, and generic phrases.
Keep the same meaning and tone, but make it sound like a real person responding naturally.

REPLY TO REWRITE:
"${text}"

RULES:
- Remove "as an AI", "I apologize", "I'm sorry" 
- Remove "in conclusion", "to summarize"
- Remove "let me know if you need", "feel free to ask"
- Make it sound conversational and natural
- Keep the same core message
- Don't add unnecessary words

REWRITTEN RESPONSE:`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: 'Rewrite this response' }
      ],
      temperature: 0.7,
      max_tokens: 300,
    });

    const content = response.choices[0]?.message?.content;
    return content?.trim() || text;
  } catch (error) {
    console.error('Banlist rewrite error:', error);
    return text;
  }
}

/**
 * Apply style corrections to a response
 */
export function applyStyleCorrections(text: string, corrections: any[]): string {
  let result = text;
  
  for (const correction of corrections) {
    const { knob, delta } = correction;
    
    switch (knob) {
      case 'shorter':
        if (delta > 0) {
          result = makeShorter(result);
        } else {
          result = makeLonger(result);
        }
        break;
        
      case 'casual':
        if (delta > 0) {
          result = makeMoreCasual(result);
        } else {
          result = makeMoreFormal(result);
        }
        break;
        
      case 'emoji_off':
        if (delta > 0) {
          result = removeEmojis(result);
        } else {
          result = addEmojis(result);
        }
        break;
        
      case 'punchline':
        if (delta > 0) {
          result = addPunchline(result);
        }
        break;
    }
  }
  
  return result;
}

/**
 * Helper functions for style corrections
 */
function makeShorter(text: string): string {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  return sentences.slice(0, 2).join('. ').trim();
}

function makeLonger(text: string): string {
  return text + ' What do you think about this?';
}

function makeMoreCasual(text: string): string {
  return text
    .replace(/I would suggest/gi, 'I\'d suggest')
    .replace(/I would recommend/gi, 'I\'d recommend')
    .replace(/you should/gi, 'you could')
    .replace(/it is important/gi, 'it\'s important');
}

function makeMoreFormal(text: string): string {
  return text
    .replace(/I\'d/gi, 'I would')
    .replace(/you\'re/gi, 'you are')
    .replace(/it\'s/gi, 'it is')
    .replace(/don\'t/gi, 'do not');
}

function removeEmojis(text: string): string {
  return text.replace(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '');
}

function addEmojis(text: string): string {
  const emojis = ['😊', '👍', '✨', '🎯', '💡'];
  const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
  return text + ' ' + randomEmoji;
}

function addPunchline(text: string): string {
  const punchlines = [
    'That\'s the key!',
    'Boom! 💥',
    'There you go!',
    'Exactly!',
    'That\'s it!'
  ];
  const randomPunchline = punchlines[Math.floor(Math.random() * punchlines.length)];
  return text + ' ' + randomPunchline;
}
