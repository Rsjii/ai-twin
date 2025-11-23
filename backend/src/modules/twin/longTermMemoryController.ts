import { Response, NextFunction } from 'express';
import { memoryService } from '../../services/memoryService';
import { AppError, createError } from '../../utils/errors';
import { verifyTwinOwnership } from '../../utils/twinUtils';
import { generateId } from '../../utils/idGenerator';
import { handleControllerError } from '../../utils/errorHandler';

/**
 * Get all long-term memories for a twin
 * GET /api/twin/:id/long-term-memory
 */
export const getLongTermMemories = async (req: any, res: Response, next: NextFunction) => {
  try {
    const { id: twinId } = req.params;
    const { category, limit = 20, query } = req.query;
    const userId = req.user?.id || req.userId;
    
    console.log('[LONG_TERM_MEMORIES:START]', {
      twinId,
      userId,
      category,
      limit,
      query,
      path: req.path,
      method: req.method,
    });
    
    if (!userId) {
      throw createError.unauthorized();
    }
    
    // Verify ownership
   await verifyTwinOwnership(twinId, userId);
    
    // If query provided, use smart retrieval
    if (query && typeof query === 'string') {
      const memories = await memoryService.getRelevantLongTermMemories(
        twinId,
        query,
        parseInt(limit as string) || 10
      );
      console.log('[LONG_TERM_MEMORIES] Smart retrieval result:', {
        memoriesCount: memories.length,
        query,
        limit,
      });
      // ✅ ADD: Cache headers to prevent 304 responses
      res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0, private',
        'Pragma': 'no-cache',
        'Expires': '0',
      });
      return res.json({ success: true, memories });
    }
    
    // Otherwise, get by category or all
    const memories = await memoryService.getLongTermMemories(
      twinId,
      category as string | undefined,
      parseInt(limit as string) || 20
    );
    
    console.log('[LONG_TERM_MEMORIES] Query result:', {
      memoriesCount: memories.length,
      category,
      limit,
      sampleMemory: memories[0] ? {
        id: memories[0].key || memories[0].id,
        category: memories[0].category,
      } : null,
    });
    
    // ✅ ADD: Cache headers to prevent 304 responses
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0, private',
      'Pragma': 'no-cache',
      'Expires': '0',
    });
    res.json({ success: true, memories });
  } catch (error) {
    handleControllerError(error, 'Failed to get memories');
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
   await verifyTwinOwnership(twinId, userId);
    
    // Auto-generate key if not provided
    const finalKey = key || generateId.fact();
    
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
    handleControllerError(error, 'Failed to store memory');
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
    
   await verifyTwinOwnership(twinId, userId);
    
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
    handleControllerError(error, 'Failed to update memory');
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
   await verifyTwinOwnership(twinId, userId);
    
    const { memoryLongTermQueries } = await import('../../config/database');
    await memoryLongTermQueries.delete(twinId, key);
    
    res.json({ success: true, message: 'Memory deleted successfully' });
  } catch (error) {
    handleControllerError(error, 'Failed to delete memory');
  }
};