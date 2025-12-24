import { Response, NextFunction } from 'express';
import { memoryService } from '../../services/memoryService';
import { createError, ErrorCodes } from '../../utils/errors';
import { verifyTwinOwnership } from '../../utils/twinUtils';
import { generateId } from '../../utils/idGenerator';
import { detokenizeId } from '../../utils/idTokenization';

/**
 * Normalize visibility value to valid enum
 * - 'public' or 'public_twin' → 'public_twin'
 * - 'owner' → 'owner'
 * - 'all' → 'all'
 * - Invalid/undefined → undefined (defaults to 'owner' in storeLongTermMemory)
 */
const normalizeVisibility = (v: any): 'owner' | 'public_twin' | 'all' | undefined => {
  if (v === undefined || v === null || v === '') return undefined;
  const t = String(v).trim().toLowerCase();
  if (t === 'owner') return 'owner';
  if (t === 'public' || t === 'public_twin') return 'public_twin';
  if (t === 'all') return 'all';
  return undefined; // Invalid value → undefined → defaults to 'owner' in storeLongTermMemory
};

/**
 * Get all long-term memories for a twin
 * GET /api/twin/:id/long-term-memory
 */
export const getLongTermMemories = async (req: any, res: Response, next: NextFunction) => {
  try {
    // ✅ SECURITY: Detokenize twinToken from URL
    const { twinToken } = req.params;
    const decoded = detokenizeId(twinToken, { userId: req.user?.id, endpoint: 'getLongTermMemories' });
    if (!decoded || decoded.type !== 'twin') {
      throw createError.notFound('This twin link is invalid or has expired.', ErrorCodes.TWIN_NOT_FOUND);
    }
    const twinId = decoded.id;
    const { QUERY_LIMITS } = await import('../../config/constants');
    const { category, limit = QUERY_LIMITS.LONG_TERM_MEMORY, query, visibility = 'all' } = req.query;
    
    const rawLimit = Number(limit) || QUERY_LIMITS.LONG_TERM_MEMORY;
    const safeLimit = Math.min(
      Math.max(rawLimit, 1),
      QUERY_LIMITS.MAX_PAGE_SIZE,
    );
    const userId = req.user?.id || req.userId;
    
    
    if (!userId) {
      throw createError.unauthorized();
    }
    
    // If query provided, use smart retrieval
    if (query && typeof query === 'string') {
      const memories = await memoryService.getRelevantLongTermMemories(
        twinId,
        query,
        safeLimit,
        category as string | undefined,
        visibility as any || 'all'
      );
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
      safeLimit,
      visibility as any || 'all'
    );
    
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0, private',
      'Pragma': 'no-cache',
      'Expires': '0',
    });
    res.json({ success: true, memories });
  } catch (error) {
    next(error); // ✅ Standardize
  }
};

/**
 * Add long-term memory
 * POST /api/twin/:id/long-term-memory
 */
export const addLongTermMemory = async (req: any, res: Response, next: NextFunction) => {
  try {
    // ✅ SECURITY: Detokenize twinToken from URL
    const { twinToken } = req.params;
    const decoded = detokenizeId(twinToken, { userId: req.user?.id, endpoint: 'addLongTermMemory' });
    if (!decoded || decoded.type !== 'twin') {
      throw createError.validation('Invalid twin token', ErrorCodes.INVALID_INPUT);
    }
    const twinId = decoded.id;
    const { key, value, category = 'fact', visibility } = req.body;
    const userId = req.user?.id || req.userId;

    if (!userId) {
      throw createError.unauthorized();
    }

    if (!value || typeof value !== 'string' || value.trim().length === 0) {
      throw createError.validation('Value is required');
    }

    // Auto-generate key if not provided
    const finalKey = key || generateId.fact();

    // ✅ FIX: Normalize visibility before storing
    const normalizedVisibility = normalizeVisibility(visibility);
    
    await memoryService.storeLongTermMemory(
      twinId,
      finalKey,
      value.trim(),
      category,
      'manual',
      normalizedVisibility // ✅ Pass normalized value
    );
    
    res.json({ 
      success: true, 
      message: 'Memory stored successfully',
      memory: { key: finalKey, value: value.trim(), category, visibility: normalizedVisibility || 'owner' }
    });
  } catch (error) {
    next(error); // ✅ Standardize
  }
};

/**
 * Update long-term memory
 * PUT /api/twin/:id/long-term-memory/:key
 */
export const updateLongTermMemory = async (req: any, res: Response, next: NextFunction) => {
  try {
    // ✅ SECURITY: Detokenize twinToken from URL
    const { twinToken, key } = req.params;
    const decoded = detokenizeId(twinToken, { userId: req.user?.id, endpoint: 'updateLongTermMemory' });
    if (!decoded || decoded.type !== 'twin') {
      throw createError.validation('Invalid twin token', ErrorCodes.INVALID_INPUT);
    }
    const twinId = decoded.id;
    const { value, category, visibility } = req.body;
    const userId = req.user?.id || req.userId;
    
    if (!userId) {
      throw createError.unauthorized();
    }
    
    if (!value || typeof value !== 'string' || value.trim().length === 0) {
      throw createError.validation('Value is required');
    }
    
    await verifyTwinOwnership(twinId, userId);
    
    // ✅ FIX: Normalize visibility before storing
    const normalizedVisibility = normalizeVisibility(visibility);
    
    await memoryService.storeLongTermMemory(
      twinId,
      key,
      value.trim(),
      category || 'fact',
      'manual',
      normalizedVisibility // ✅ Pass normalized value
    );
    
    res.json({ 
      success: true, 
      message: 'Memory updated successfully',
      memory: { key, value: value.trim(), category: category || 'fact', visibility: normalizedVisibility || 'owner' }
    });
  } catch (error) {
    next(error); // ✅ Standardize
  }
};

/**
 * Delete long-term memory
 * DELETE /api/twin/:id/long-term-memory/:key
 */
export const deleteLongTermMemory = async (req: any, res: Response, next: NextFunction) => {
  try {
    // ✅ SECURITY: Detokenize twinToken from URL
    const { twinToken, key } = req.params;
    const decoded = detokenizeId(twinToken, { userId: req.user?.id, endpoint: 'deleteLongTermMemory' });
    if (!decoded || decoded.type !== 'twin') {
      throw createError.validation('Invalid twin token', ErrorCodes.INVALID_INPUT);
    }
    const twinId = decoded.id;
    const userId = req.user?.id || req.userId;
    
    if (!userId) {
      throw createError.unauthorized();
    }
    
    await verifyTwinOwnership(twinId, userId);
    
    const { memoryLongTermQueries } = await import('../../config/database');
    await memoryLongTermQueries.delete(twinId, key);
    
    res.json({ success: true, message: 'Memory deleted successfully' });
  } catch (error) {
    next(error); // ✅ Standardize
  }
};