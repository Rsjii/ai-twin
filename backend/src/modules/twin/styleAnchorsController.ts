import { Response } from 'express';
import { z } from 'zod';
import { db } from '../../config/database';
import { EventLogger } from '../../services/eventLogger';
import OpenAI from 'openai';
import { config } from '../../config/env';

const openai = new OpenAI({
  apiKey: config.openaiApiKey,
});

// Validation schemas
const createAnchorSchema = z.object({
  user_utterance: z.string().min(1).max(500),
  ideal_reply: z.string().min(1).max(1000),
  tags: z.array(z.string()).optional().default([])
});

const updateAnchorSchema = z.object({
  user_utterance: z.string().min(1).max(500),
  ideal_reply: z.string().min(1).max(1000),
  tags: z.array(z.string()).optional().default([])
});

const autoSuggestSchema = z.object({
  limit: z.number().min(1).max(20).optional().default(10),
  chatHistory: z.array(z.object({
    sender: z.enum(['human', 'twin']),
    content: z.string(),
    timestamp: z.string()
  })).optional().default([])
});

// Create a new style anchor
export const createAnchor = async (req: any, res: Response) => {
  try {
    const { id: twinId } = req.params;
    const validatedData = createAnchorSchema.parse(req.body);
    
    // Check if twin exists and user owns it
    const twinCheck = await db.query(
      'SELECT id, "userId" FROM "Twin" WHERE id = $1',
      [twinId]
    );
    
    if (twinCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Twin not found' });
    }
    
    if (twinCheck.rows[0].userId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to modify this twin' });
    }
    
    // Create the anchor
    const anchorId = `anchor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const result = await db.query(
      `INSERT INTO "style_anchors" (id, twin_id, user_utterance, ideal_reply, tags, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING *`,
      [anchorId, twinId, validatedData.user_utterance, validatedData.ideal_reply, validatedData.tags]
    );
    
    // Log event
    await EventLogger.logUserEvent(req.user.id, 'style_anchor_created', {
      twinId,
      anchorId,
      tags: validatedData.tags
    });
    
    res.json({
      success: true,
      anchor: result.rows[0],
      message: 'Style anchor created successfully'
    });
    
  } catch (error) {
    console.error('Create anchor error:', error);
    res.status(500).json({ error: 'Failed to create style anchor' });
  }
};

// Get all anchors for a twin
export const getAnchors = async (req: any, res: Response) => {
  try {
    const { id: twinId } = req.params;
    const { limit = 10, offset = 0 } = req.query;
    
    // Check if twin exists and user owns it
    const twinCheck = await db.query(
      'SELECT id, "userId" FROM "Twin" WHERE id = $1',
      [twinId]
    );
    
    if (twinCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Twin not found' });
    }
    
    if (twinCheck.rows[0].userId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to view this twin' });
    }
    
    // Get anchors
    const result = await db.query(
      `SELECT * FROM "style_anchors" 
       WHERE twin_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2 OFFSET $3`,
      [twinId, limit, offset]
    );
    
    // Get total count
    const countResult = await db.query(
      'SELECT COUNT(*) as total FROM "style_anchors" WHERE twin_id = $1',
      [twinId]
    );
    
    res.json({
      success: true,
      anchors: result.rows,
      pagination: {
        total: parseInt(countResult.rows[0].total),
        limit: parseInt(limit as string),
        offset: parseInt(offset as string)
      }
    });
    
  } catch (error) {
    console.error('Get anchors error:', error);
    res.status(500).json({ error: 'Failed to fetch style anchors' });
  }
};

// Update an anchor
export const updateAnchor = async (req: any, res: Response) => {
  try {
    const { id: twinId, anchorId } = req.params;
    const validatedData = updateAnchorSchema.parse(req.body);
    
    // Check if anchor exists and user owns the twin
    const anchorCheck = await db.query(
      `SELECT sa.*, t."userId" FROM "style_anchors" sa
       JOIN "Twin" t ON sa.twin_id = t.id
       WHERE sa.id = $1 AND sa.twin_id = $2`,
      [anchorId, twinId]
    );
    
    if (anchorCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Anchor not found' });
    }
    
    if (anchorCheck.rows[0].userId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to modify this anchor' });
    }
    
    // Update the anchor
    const result = await db.query(
      `UPDATE "style_anchors" 
       SET user_utterance = $1, ideal_reply = $2, tags = $3
       WHERE id = $4 AND twin_id = $5
       RETURNING *`,
      [validatedData.user_utterance, validatedData.ideal_reply, validatedData.tags, anchorId, twinId]
    );
    
    // Log event
    await EventLogger.logUserEvent(req.user.id, 'style_anchor_updated', {
      twinId,
      anchorId,
      tags: validatedData.tags
    });
    
    res.json({
      success: true,
      anchor: result.rows[0],
      message: 'Style anchor updated successfully'
    });
    
  } catch (error) {
    console.error('Update anchor error:', error);
    res.status(500).json({ error: 'Failed to update style anchor' });
  }
};

// Delete an anchor
export const deleteAnchor = async (req: any, res: Response) => {
  try {
    const { id: twinId, anchorId } = req.params;
    
    // Check if anchor exists and user owns the twin
    const anchorCheck = await db.query(
      `SELECT sa.*, t."userId" FROM "style_anchors" sa
       JOIN "Twin" t ON sa.twin_id = t.id
       WHERE sa.id = $1 AND sa.twin_id = $2`,
      [anchorId, twinId]
    );
    
    if (anchorCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Anchor not found' });
    }
    
    if (anchorCheck.rows[0].userId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to delete this anchor' });
    }
    
    // Delete the anchor
    await db.query(
      'DELETE FROM "style_anchors" WHERE id = $1 AND twin_id = $2',
      [anchorId, twinId]
    );
    
    // Log event
    await EventLogger.logUserEvent(req.user.id, 'style_anchor_deleted', {
      twinId,
      anchorId
    });
    
    res.json({
      success: true,
      message: 'Style anchor deleted successfully'
    });
    
  } catch (error) {
    console.error('Delete anchor error:', error);
    res.status(500).json({ error: 'Failed to delete style anchor' });
  }
};

// Auto-suggest anchors from chat history
export const autoSuggestAnchors = async (req: any, res: Response) => {
  try {
    const { id: twinId } = req.params;
    const validatedData = autoSuggestSchema.parse(req.body);
    
    // Check if twin exists and user owns it
    const twinCheck = await db.query(
      'SELECT id, "userId" FROM "Twin" WHERE id = $1',
      [twinId]
    );
    
    if (twinCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Twin not found' });
    }
    
    if (twinCheck.rows[0].userId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to access this twin' });
    }
    
    // If no chat history provided, get recent messages
    let chatHistory = validatedData.chatHistory;
    if (chatHistory.length === 0) {
      const recentMessages = await db.query(
        `SELECT m.sender, m.content, m."createdAt" as timestamp
         FROM "Message" m
         JOIN "Chat" c ON m."chatId" = c.id
         WHERE c."twinId" = $1
         ORDER BY m."createdAt" DESC
         LIMIT 50`,
        [twinId]
      );
      
      chatHistory = recentMessages.rows.map(msg => ({
        sender: msg.sender,
        content: msg.content,
        timestamp: msg.timestamp.toISOString()
      }));
    }
    
    if (chatHistory.length === 0) {
      return res.json({
        success: true,
        anchors: [],
        message: 'No chat history available for auto-suggestion'
      });
    }
    
    // Prepare chat history for AI analysis
    const chatText = chatHistory
      .map(msg => `${msg.sender === 'human' ? 'User' : 'AI'}: ${msg.content}`)
      .join('\n');
    
    // Call OpenAI to extract anchor suggestions
    const prompt = `
SYSTEM: Extract (input→ideal reply) pairs that best reflect the user's writing voice.
Focus on conversations where the user's response shows their unique style, personality, or communication patterns.

USER TEXT: ${chatText}

Return top ${validatedData.limit} JSON array:
[{"user_utterance": "...", "ideal_reply": "...", "tags":["casual","advice"]}, ...]

Rules:
- Real sentences only, not generic responses
- Keep user's exact phrasing and style
- Remove any PII (personal information)
- Focus on responses that show personality
- Include tags like: casual, formal, advice, question, humor, etc.
- Make sure ideal_reply is what the user actually said, not what AI said
`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are an expert at analyzing communication patterns and extracting style examples.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 2000,
      temperature: 0.3
    });

    const result = response.choices[0]?.message?.content;
    if (!result) {
      throw new Error('No response from OpenAI');
    }

    // Parse the JSON response
    let suggestedAnchors;
    try {
      suggestedAnchors = JSON.parse(result);
    } catch (parseError) {
      console.error('Failed to parse OpenAI response:', result);
      return res.status(500).json({ error: 'Failed to parse AI suggestions' });
    }

    // Log event
    await EventLogger.logUserEvent(req.user.id, 'auto_suggest_anchors', {
      twinId,
      suggestionsCount: suggestedAnchors.length
    });

    res.json({
      success: true,
      anchors: suggestedAnchors,
      total_found: suggestedAnchors.length,
      message: 'Anchor suggestions generated successfully'
    });
    
  } catch (error) {
    console.error('Auto-suggest anchors error:', error);
    res.status(500).json({ error: 'Failed to generate anchor suggestions' });
  }
};

// Find similar anchors for a given message
export const findSimilarAnchors = async (req: any, res: Response) => {
  try {
    const { id: twinId } = req.params;
    const { message, limit = 2 } = req.query;
    
    if (!message) {
      return res.status(400).json({ error: 'Message parameter is required' });
    }
    
    // Check if twin exists and user owns it
    const twinCheck = await db.query(
      'SELECT id, "userId" FROM "Twin" WHERE id = $1',
      [twinId]
    );
    
    if (twinCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Twin not found' });
    }
    
    if (twinCheck.rows[0].userId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to access this twin' });
    }
    
    // Find similar anchors using text similarity
    const result = await db.query(
      `SELECT *, 
       similarity(user_utterance, $2) as sim_score 
       FROM "style_anchors" 
       WHERE twin_id = $1 
       ORDER BY sim_score DESC 
       LIMIT $3`,
      [twinId, message, limit]
    );
    
    res.json({
      success: true,
      anchors: result.rows,
      message: 'Similar anchors found'
    });
    
  } catch (error) {
    console.error('Find similar anchors error:', error);
    res.status(500).json({ error: 'Failed to find similar anchors' });
  }
};