import { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../../config/database';
import { EventLogger } from '../../services/eventLogger';
import OpenAI from 'openai';
import { config } from '../../config/env';

const openai = new OpenAI({
  apiKey: config.openaiApiKey,
});

// Validation schemas
const ingestSchema = z.object({
  text: z.string().min(10).max(5000),
  bucket: z.enum(['facts', 'voice']),
  source: z.string().optional()
});

const retrieveSchema = z.object({
  query: z.string().min(1).max(500),
  bucket: z.enum(['facts', 'voice']).optional(),
  limit: z.number().min(1).max(10).optional().default(3)
});

// Ingest facts/voice from text
export const ingestMemory = async (req: any, res: Response) => {
  try {
    const { id: twinId } = req.params;
    const validatedData = ingestSchema.parse(req.body);
    
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
    
    // Extract memories based on bucket type
    let extractedMemories: string[] = [];
    
    if (validatedData.bucket === 'facts') {
      extractedMemories = await extractFacts(validatedData.text);
    } else if (validatedData.bucket === 'voice') {
      extractedMemories = await extractVoicePatterns(validatedData.text);
    }
    
    // Store each memory as separate chunk
    const storedMemories = [];
    for (const memory of extractedMemories) {
      const chunk = await db.query(
        `INSERT INTO "mem_chunks" (id, twin_id, bucket, text, is_public, ts)
         VALUES ($1, $2, $3, $4, $5, NOW())
         RETURNING *`,
        [
          `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          twinId,
          validatedData.bucket,
          memory
        ]
      );
      storedMemories.push(chunk.rows[0]);
    }
    
    // Log event
    await EventLogger.logUserEvent(req.user.id, 'memory_ingested', {
      twinId,
      bucket: validatedData.bucket,
      memoriesCount: storedMemories.length
    });
    
    res.json({
      success: true,
      memories: storedMemories,
      extracted: extractedMemories,
      message: `${extractedMemories.length} memories extracted and stored`
    });
    
  } catch (error) {
    console.error('Ingest memory error:', error);
    res.status(500).json({ error: 'Failed to ingest memory' });
  }
};

// Retrieve relevant memories
export const retrieveMemories = async (req: any, res: Response) => {
  try {
    const { id: twinId } = req.params;
    const validatedData = retrieveSchema.parse(req.query);
    
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
    
    // Get memories (with or without bucket filter)
    let query = 'SELECT *, is_public FROM "mem_chunks" WHERE twin_id = $1';
    let params = [twinId];
    
    if (validatedData.bucket) {
      query += ' AND bucket = $2';
      params.push(validatedData.bucket);
    }
    
    query += ' ORDER BY ts DESC LIMIT $' + (params.length + 1);
    params.push(validatedData.limit);
    
    const result = await db.query(query, params);
    
    res.json({
      success: true,
      memories: result.rows,
      query: validatedData.query,
      bucket: validatedData.bucket
    });
    
  } catch (error) {
    console.error('Retrieve memories error:', error);
    res.status(500).json({ error: 'Failed to retrieve memories' });
  }
};

// Get memory statistics
export const getMemoryStats = async (req: any, res: Response) => {
  try {
    const { id: twinId } = req.params;
    
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
    
    // Get statistics
    const statsResult = await db.query(`
      SELECT 
        bucket,
        COUNT(*) as count,
        COUNT(CASE WHEN is_public THEN 1 END) as public_count,
        MAX(ts) as latest_memory
      FROM "mem_chunks" 
      WHERE twin_id = $1 
      GROUP BY bucket
    `, [twinId]);
    
    const totalMemories = await db.query(
      'SELECT COUNT(*) as total FROM "mem_chunks" WHERE twin_id = $1',
      [twinId]
    );
    
    res.json({
      success: true,
      stats: statsResult.rows,
      total: parseInt(totalMemories.rows[0].total)
    });
    
  } catch (error) {
    console.error('Get memory stats error:', error);
    res.status(500).json({ error: 'Failed to get memory statistics' });
  }
};

// Helper function to extract facts
async function extractFacts(userSamples: string): Promise<string[]> {
  const prompt = `
SYSTEM: Extract stable facts for future replies. Max 10 bullets, concise, first-person.
Focus on personal information, preferences, experiences, and characteristics.

INPUT: ${userSamples}

Return as plain bullets (no numbering, no formatting).
Each fact should be 5-15 words, first-person perspective.
  `;
  
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: prompt },
      { role: 'user', content: 'Extract facts from this text' }
    ],
    temperature: 0.3,
    max_tokens: 800
  });
  
  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response from OpenAI');
  }
  
  // Parse bullets into array
  return content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('-') || line.startsWith('•'))
    .map(line => line.replace(/^[-•]\s*/, ''))
    .filter(line => line.length > 0);
}

// Helper function to extract voice patterns
async function extractVoicePatterns(userSamples: string): Promise<string[]> {
  const prompt = `
SYSTEM: Extract short signature phrases/openers/closers/catchphrases, 5–12 tokens each, one per line, 10–20 lines.
Focus on unique expressions, greetings, closings, and characteristic phrases.

INPUT: ${userSamples}

Return as plain lines only (no numbering, no formatting).
Each pattern should be 3-8 words, characteristic of the user's voice.
  `;
  
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: prompt },
      { role: 'user', content: 'Extract voice patterns from this text' }
    ],
    temperature: 0.3,
    max_tokens: 600
  });
  
  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response from OpenAI');
  }
  
  // Parse lines into array
  return content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && line.length < 50);
}