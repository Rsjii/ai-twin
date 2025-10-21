/**
 * Enhanced Chat Controller
 * Implements the new generation pipeline with intent classification and style critic
 */

import { Response } from 'express';
import { z } from 'zod';
import { db } from '../../config/database';
import { EventLogger } from '../../services/eventLogger';
import { logger } from '../../config/logger';
import { TwinService } from '../twin/twinService';
import { classifyIntent, shapeByIntent } from '../../utils/intentClassification';
import { runStyleCritic, checkBanlist, rewriteBanlist } from '../../utils/styleCritic';

const twinService = new TwinService();

// Validation schemas
const generateReplySchema = z.object({
  message: z.string().min(1).max(1000),
  strictStyle: z.boolean().optional().default(false)
});

const styleCorrectionSchema = z.object({
  knob: z.enum(['shorter', 'casual', 'emoji_off', 'punchline', 'formal', 'humor', 'question_freq']),
  delta: z.number().int().min(-1).max(1)
});

/**
 * Enhanced reply generation with intent classification and style critic
 */
export const generateEnhancedReply = async (req: any, res: Response) => {
  try {
    const { message, strictStyle } = generateReplySchema.parse(req.body);
    const { id: chatId } = req.params;
    const userId = req.user.id;

    const start = Date.now();

    // 1. Get chat and twin data
    const chatResult = await db.query(`
      SELECT c.id, c."userId", c."twinId", c."createdAt", c."chatVector",
             t.id as twin_id, t."styleVector", t."sampleReply", t."personaData", t."systemPrompt", t."tokenLimit"
      FROM "Chat" c
      JOIN "Twin" t ON c."twinId" = t.id
      WHERE c.id = $1 AND c."userId" = $2
    `, [chatId, userId]);
    
    if (chatResult.rows.length === 0) {
      return res.status(404).json({ error: 'Chat not found' });
    }
    
    const chat = chatResult.rows[0];

    // 2. Classify intent
    const intent = classifyIntent(message);
    logger.info('Intent classified:', intent);

    // 3. Retrieve context (hard caps)
    const [anchors, facts, voice] = await Promise.all([
      getNearestAnchors(chat.twin_id, message, 2),
      retrieveMemories(chat.twin_id, 'facts', message, 3),
      retrieveMemories(chat.twin_id, 'voice', message, 2)
    ]);

    // 4. Build enhanced persona prompt
    const persona = buildPersonaPrompt(chat, facts, voice);

    // 5. Generate first pass
    let draft = await generateFirstPass(persona, message, intent, chat);

    // 6. Check banlist
    if (checkBanlist(draft)) {
      logger.info('Banlist detected, rewriting...');
      draft = await rewriteBanlist(draft);
    }

    // 7. Style critic (Pro users only)
    let criticScore = null;
    if (strictStyle) {
      const critic = await runStyleCritic(draft, chat);
      criticScore = critic.score;
      logger.info('Style critic score:', criticScore);
      
      if (critic.score < 80 && critic.rewrite) {
        draft = critic.rewrite;
        logger.info('Response rewritten by style critic');
      }
    }

    // 8. Intent shaping
    const finalText = shapeByIntent(draft, intent.intent, chat.styleVector);

    // 9. Log AI run
    await logAIRun({
      twinId: chat.twin_id,
      mode: 'human',
      tokensIn: estimateTokens(message),
      tokensOut: estimateTokens(finalText),
      criticScore,
      latency: Date.now() - start
    });

    // 10. Save response to chat
    await saveResponseToChat(chatId, finalText);

    res.json({
      success: true,
      response: finalText,
      intent: intent.intent,
      criticScore,
      latency: Date.now() - start
    });

  } catch (error) {
    logger.error('Enhanced reply generation error:', error);
    res.status(500).json({ error: 'Failed to generate enhanced reply' });
  }
};

/**
 * Apply style correction to current response
 */
export const applyStyleCorrection = async (req: any, res: Response) => {
  try {
    const { knob, delta } = styleCorrectionSchema.parse(req.body);
    const { id: chatId } = req.params;
    const userId = req.user.id;

    // Get current response
    const responseResult = await db.query(`
      SELECT content FROM "Message" 
      WHERE "chatId" = $1 AND sender = 'ai' 
      ORDER BY "createdAt" DESC LIMIT 1
    `, [chatId]);
    
    if (responseResult.rows.length === 0) {
      return res.status(404).json({ error: 'No AI response found' });
    }

    const currentResponse = responseResult.rows[0].content;

    // Apply correction
    const correctedResponse = applyStyleCorrectionToText(currentResponse, knob, delta);

    // Save correction to database
    await db.query(`
      INSERT INTO style_corrections (id, twin_id, knob, delta, source) 
      VALUES ($1, $2, $3, $4, 'manual_correction')
    `, [
      `correction_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      req.twinId, // This would need to be passed from the request
      knob,
      delta
    ]);

    // Update the response
    await db.query(`
      UPDATE "Message" SET content = $1 
      WHERE "chatId" = $2 AND sender = 'ai' 
      ORDER BY "createdAt" DESC LIMIT 1
    `, [correctedResponse, chatId]);

    res.json({
      success: true,
      correctedResponse,
      correction: { knob, delta }
    });

  } catch (error) {
    logger.error('Style correction error:', error);
    res.status(500).json({ error: 'Failed to apply style correction' });
  }
};

/**
 * Add current response as style anchor
 */
export const addToAnchors = async (req: any, res: Response) => {
  try {
    const { userUtterance, idealReply } = req.body;
    const { id: chatId } = req.params;
    const userId = req.user.id;

    // Get twin ID from chat
    const chatResult = await db.query(`
      SELECT "twinId" FROM "Chat" WHERE id = $1 AND "userId" = $2
    `, [chatId, userId]);
    
    if (chatResult.rows.length === 0) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    const twinId = chatResult.rows[0].twinId;

    // Create style anchor
    const anchorId = `anchor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await db.query(`
      INSERT INTO style_anchors (id, twin_id, user_utterance, ideal_reply, tags) 
      VALUES ($1, $2, $3, $4, $5)
    `, [anchorId, twinId, userUtterance, idealReply, ['manual']]);

    res.json({
      success: true,
      anchorId,
      message: 'Style anchor added successfully'
    });

  } catch (error) {
    logger.error('Add to anchors error:', error);
    res.status(500).json({ error: 'Failed to add style anchor' });
  }
};

// Helper functions

async function getNearestAnchors(twinId: string, userMessage: string, limit: number) {
  try {
    const result = await db.query(`
      SELECT *, similarity(user_utterance, $2) as sim_score 
      FROM style_anchors 
      WHERE twin_id = $1 
      ORDER BY sim_score DESC 
      LIMIT $3
    `, [twinId, userMessage, limit]);
    return result.rows;
  } catch (error) {
    logger.warn('Failed to get nearest anchors:', error);
    return [];
  }
}

async function retrieveMemories(twinId: string, bucket: 'facts' | 'voice', query: string, limit: number) {
  try {
    const result = await db.query(`
      SELECT text FROM mem_chunks 
      WHERE twin_id = $1 AND bucket = $2 
      ORDER BY ts DESC 
      LIMIT $3
    `, [twinId, bucket, limit]);
    return result.rows.map(row => row.text);
  } catch (error) {
    logger.warn('Failed to retrieve memories:', error);
    return [];
  }
}

function buildPersonaPrompt(chat: any, facts: string[], voice: string[]): string {
  const userName = chat.personaData?.basicInfo?.fullName || 'the user';
  const userBio = chat.personaData?.basicInfo?.bio || '';
  
  return `You are ${userName}, ${userName}'s AI twin. First-person me bolo.
Don't mention you're an AI. No over-apologies.

STYLE:
- Sentences: ${chat.styleVector?.sentence_length || 'medium'}.
- Tone: ${chat.styleVector?.tone || 'casual'}; light wit ok; no cringe/slang spam.
- Emojis: only if the user used recently; max 1.
- Signature phrases (use naturally, not forced): ${voice.slice(0, 3).join(', ')}.

FACTS (use if relevant; don't info-dump):
${facts.slice(0, 5).map(f => `- ${f}`).join('\n')}

RULES:
- If uncertain, ask 1 concise clarifying question in the same voice.
- Prefer concrete, actionable lines over generic gyaan.`;
}

async function generateFirstPass(persona: string, message: string, intent: any, chat: any): Promise<string> {
  try {
    const response = await twinService.generateDraftWithContext({
      styleVector: chat.styleVector,
      personaData: chat.personaData,
      systemPrompt: persona,
      tokenLimit: chat.tokenLimit || 500,
      chatMemory: [],
      currentMessages: [message],
      twinId: chat.twin_id
    });
    
    return response;
  } catch (error) {
    logger.error('First pass generation error:', error);
    return "I'm having trouble thinking right now. Could you try again?";
  }
}

function applyStyleCorrectionToText(text: string, knob: string, delta: number): string {
  // This would implement the style correction logic
  // For now, return the original text
  return text;
}

function estimateTokens(text: string): number {
  // Rough estimation: 1 token ≈ 4 characters
  return Math.ceil(text.length / 4);
}

async function logAIRun(data: any) {
  try {
    const runId = `run_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await db.query(`
      INSERT INTO ai_runs (id, twin_id, mode, tokens_in, tokens_out, critic_score, latency_ms) 
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [runId, data.twinId, data.mode, data.tokensIn, data.tokensOut, data.criticScore, data.latency]);
  } catch (error) {
    logger.warn('Failed to log AI run:', error);
  }
}

async function saveResponseToChat(chatId: string, response: string) {
  try {
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await db.query(`
      INSERT INTO "Message" (id, "chatId", content, sender, "createdAt") 
      VALUES ($1, $2, $3, 'ai', NOW())
    `, [messageId, chatId, response]);
  } catch (error) {
    logger.error('Failed to save response:', error);
  }
}