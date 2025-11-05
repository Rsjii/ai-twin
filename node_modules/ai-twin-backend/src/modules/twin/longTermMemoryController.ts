import { Request, Response, NextFunction } from 'express';
import { db } from '../../config/database';
import { memoryService } from '../../services/memoryService';
import { logger } from '../../config/logger';
import { AppError, createError, ErrorCodes } from '../../utils/errors';

/**
 * Get all long-term memories for a twin
 * GET /api/twin/:id/long-term-memory
 */
export const getLongTermMemories = async (req: any, res: Response, next: NextFunction) => {
  try {
    const { id: twinId } = req.params;
    const { category, limit = 20, query } = req.query;
    const userId = req.user?.id || req.userId;
    
    if (!userId) {
      throw createError.unauthorized();
    }
    
    // Verify ownership
    const twinResult = await db.query(
      'SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2',
      [twinId, userId]
    );
    
    if (twinResult.rows.length === 0) {
      throw createError.notFound('Twin not found', ErrorCodes.TWIN_NOT_FOUND);
    }
    
    // If query provided, use smart retrieval
    if (query && typeof query === 'string') {
      const memories = await memoryService.getRelevantLongTermMemories(
        twinId,
        query,
        parseInt(limit as string) || 10
      );
      return res.json({ success: true, memories });
    }
    
    // Otherwise, get by category or all
    const memories = await memoryService.getLongTermMemories(
      twinId,
      category as string | undefined,
      parseInt(limit as string) || 20
    );
    
    res.json({ success: true, memories });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw createError.internal('Failed to get memories', error);
  }
};

/**
 * Add long-term memory
 * POST /api/twin/:id/long-term-memory
 */
export const addLongTermMemory = async (req: any, res: Response, next: NextFunction) => {
  try {
    const { id: twinId } = req.params;
    const { key, value, category = 'fact' } = req.body;
    const userId = req.user?.id || req.userId;
    
    if (!userId) {
      throw createError.unauthorized();
    }
    
    if (!value || typeof value !== 'string' || value.trim().length === 0) {
      throw createError.validation('Value is required');
    }
    
    // Verify ownership
    const twinResult = await db.query(
      'SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2',
      [twinId, userId]
    );
    
    if (twinResult.rows.length === 0) {
      throw createError.notFound('Twin not found', ErrorCodes.TWIN_NOT_FOUND);
    }
    
    // Auto-generate key if not provided
    const finalKey = key || `fact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    await memoryService.storeLongTermMemory(
      twinId,
      finalKey,
      value.trim(),
      category,
      'manual'
    );
    
    res.json({ 
      success: true, 
      message: 'Memory stored successfully',
      memory: { key: finalKey, value: value.trim(), category }
    });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw createError.internal('Failed to store memory', error);
  }
};

/**
 * Update long-term memory
 * PUT /api/twin/:id/long-term-memory/:key
 */
export const updateLongTermMemory = async (req: any, res: Response, next: NextFunction) => {
  try {
    const { id: twinId, key } = req.params;
    const { value, category } = req.body;
    const userId = req.user?.id || req.userId;
    
    if (!userId) {
      throw createError.unauthorized();
    }
    
    if (!value || typeof value !== 'string' || value.trim().length === 0) {
      throw createError.validation('Value is required');
    }
    
    // Verify ownership
    const twinResult = await db.query(
      'SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2',
      [twinId, userId]
    );
    
    if (twinResult.rows.length === 0) {
      throw createError.notFound('Twin not found', ErrorCodes.TWIN_NOT_FOUND);
    }
    
    // Update via storeLongTermMemory (ON CONFLICT handles update)
    await memoryService.storeLongTermMemory(
      twinId,
      key,
      value.trim(),
      category || 'fact',
      'manual'
    );
    
    res.json({ 
      success: true, 
      message: 'Memory updated successfully',
      memory: { key, value: value.trim(), category: category || 'fact' }
    });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw createError.internal('Failed to update memory', error);
  }
};

/**
 * Delete long-term memory
 * DELETE /api/twin/:id/long-term-memory/:key
 */
export const deleteLongTermMemory = async (req: any, res: Response, next: NextFunction) => {
  try {
    const { id: twinId, key } = req.params;
    const userId = req.user?.id || req.userId;
    
    if (!userId) {
      throw createError.unauthorized();
    }
    
    // Verify ownership
    const twinResult = await db.query(
      'SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2',
      [twinId, userId]
    );
    
    if (twinResult.rows.length === 0) {
      throw createError.notFound('Twin not found', ErrorCodes.TWIN_NOT_FOUND);
    }
    
    const { memoryLongTermQueries } = await import('../../config/database');
    await memoryLongTermQueries.delete(twinId, key);
    
    res.json({ success: true, message: 'Memory deleted successfully' });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw createError.internal('Failed to delete memory', error);
  }
};