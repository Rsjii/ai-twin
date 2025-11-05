import { Response, NextFunction } from 'express';
import { db, memChunksQueries } from '../../config/database';
import { logger } from '../../config/logger';
import { AppError, createError, ErrorCodes } from '../../utils/errors';

/**
 * Get memory statistics for a twin (DEPRECATED - uses mem_chunks)
 * @deprecated Consider using /api/twin/:id/long-term-memory and /api/twin/:id/style-anchors
 */
export const getMemoryStats = async (req: any, res: Response, next: NextFunction) => {
  try {
    const { id: twinId } = req.params;
    const userId = req.user?.id || req.userId;
    
    // Deprecation warning
    logger.warn('⚠️ DEPRECATED: getMemoryStats - Consider using unified endpoints');
    
    if (!userId) {
      throw createError.unauthorized();
    }
    
    // Verify twin ownership
    const twinResult = await db.query(
      'SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2',
      [twinId, userId]
    );
    
    if (!twinResult || twinResult.rows.length === 0) {
      throw createError.notFound('Twin not found', ErrorCodes.TWIN_NOT_FOUND);
    }
    
    // Get memory statistics from mem_chunks (legacy)
    const statsResult = await db.query(`
      SELECT 
        bucket,
        COUNT(*) as count
      FROM mem_chunks 
      WHERE twin_id = $1 
      GROUP BY bucket
    `, [twinId]);
    
    if (!statsResult) {
      throw createError.internal('Failed to get memory statistics');
    }
    
    const totalMemories = statsResult.rows.reduce((sum, row) => sum + parseInt(row.count), 0);
    
    res.set('X-Deprecated', 'true');
    res.set('X-Alternative-Endpoint', '/api/twin/:id/long-term-memory');
    res.json({ 
      success: true, 
      deprecated: true,
      total: totalMemories,
      stats: statsResult.rows.map(row => ({
        bucket: row.bucket,
        count: parseInt(row.count)
      }))
    });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw createError.internal('Failed to get memory statistics', error);
  }
};

/**
 * Retrieve memories by bucket (DEPRECATED - uses mem_chunks)
 * @deprecated Use /api/twin/:id/long-term-memory or /api/twin/:id/style-anchors instead
 */
export const retrieveMemories = async (req: any, res: Response, next: NextFunction) => {
  try {
    const { id: twinId } = req.params;
    const { bucket, limit = 10, offset = 0 } = req.query;
    const userId = req.user?.id || req.userId;
    
    // Deprecation warning
    logger.warn('⚠️ DEPRECATED: retrieveMemories - Consider using unified endpoints');
    
    if (!userId) {
      throw createError.unauthorized();
    }
    
    // Verify twin ownership
    const twinResult = await db.query(
      'SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2',
      [twinId, userId]
    );
    
    if (!twinResult || twinResult.rows.length === 0) {
      throw createError.notFound('Twin not found', ErrorCodes.TWIN_NOT_FOUND);
    }
    
    // Get memories - FIXED: handle "all" bucket (legacy mem_chunks)
    let memories;
    if (bucket === 'all') {
      // Get memories from both buckets
      const factsMemories = await memChunksQueries.findByTwinIdAndBucket(
        twinId, 'facts', parseInt(limit as string), parseInt(offset as string)
      );
      const voiceMemories = await memChunksQueries.findByTwinIdAndBucket(
        twinId, 'voice', parseInt(limit as string), parseInt(offset as string)
      );
      memories = [...factsMemories, ...voiceMemories];
    } else {
      memories = await memChunksQueries.findByTwinIdAndBucket(
        twinId, 
        bucket as 'facts' | 'voice', 
        parseInt(limit as string), 
        parseInt(offset as string)
      );
    }

    res.set('X-Deprecated', 'true');
    res.set('X-Alternative-Endpoint', '/api/twin/:id/long-term-memory');
    res.json({ success: true, memories, deprecated: true });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw createError.internal('Failed to retrieve memories', error);
  }
};

/**
 * Ingest new memories (DEPRECATED - redirects to unified endpoints)
 * @deprecated Use /api/twin/:id/long-term-memory or /api/twin/:id/style-anchors instead
 */
export const ingestMemories = async (req: any, res: Response, next: NextFunction) => {
  try {
    const { id: twinId } = req.params;
    const { bucket, text } = req.body;
    const userId = req.user?.id || req.userId;
    
    // Deprecation warning
    logger.warn('⚠️ DEPRECATED: ingestMemories endpoint called. Consider using unified endpoints.');
    
    if (!userId) {
      throw createError.unauthorized();
    }
    
    // Verify twin ownership
    const twinResult = await db.query(
      'SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2',
      [twinId, userId]
    );
    
    if (!twinResult || twinResult.rows.length === 0) {
      throw createError.notFound('Twin not found', ErrorCodes.TWIN_NOT_FOUND);
    }
    
    // Validate input
    if (!bucket || !text) {
      throw createError.validation('Bucket and text are required', {
        deprecated: true,
        message: 'This endpoint is deprecated. Use /api/twin/:id/long-term-memory for facts or /api/twin/:id/style-anchors for voice patterns.'
      });
    }
    
    if (!['facts', 'voice'].includes(bucket)) {
      throw createError.validation('Invalid bucket. Use "facts" or "voice".', {
        deprecated: true,
        message: 'This endpoint is deprecated. Use /api/twin/:id/long-term-memory for facts or /api/twin/:id/style-anchors for voice patterns.'
      });
    }
    
    // Route to appropriate unified system
    if (bucket === 'facts') {
      // Redirect to MemoryLongTerm
      const { addLongTermMemory } = await import('../twin/longTermMemoryController');
      req.params.id = twinId;
      req.body.key = `fact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      req.body.category = 'fact';
      req.body.value = text;
      return addLongTermMemory(req, res);
      
    } else if (bucket === 'voice') {
      // Redirect to StyleAnchors
      const { addTwinAnchor } = await import('../twin/styleAnchorController');
      req.params.id = twinId;
      req.body.type = 'phrase';
      req.body.phrase = text;
      req.body.userUtterance = '';
      req.body.idealReply = '';
      req.body.tags = ['migrated'];
      return addTwinAnchor(req, res);
    }
    
    // Fallback (should never reach here)
    throw createError.validation('Invalid bucket type');
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw createError.internal('Failed to ingest memory', error);
  }
};

/**
 * Update memory
 */
export const updateMemory = async (req: any, res: Response, next: NextFunction) => {
  try {
    const { id: twinId, memId } = req.params;
    const { text } = req.body;
    const userId = req.user?.id || req.userId;
    
    if (!userId) {
      throw createError.unauthorized();
    }
    
    // Verify twin ownership
    const twinResult = await db.query(
      'SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2',
      [twinId, userId]
    );
    
    if (!twinResult || twinResult.rows.length === 0) {
      throw createError.notFound('Twin not found', ErrorCodes.TWIN_NOT_FOUND);
    }
    
    // Validate input
    if (!text) {
      throw createError.validation('Text is required');
    }
    
    // Update memory
    const memory = await memChunksQueries.update(memId, text);
    
    if (!memory) {
      throw createError.notFound('Memory not found');
    }
    
    res.json({ 
      success: true, 
      memory,
      message: 'Memory updated successfully' 
    });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw createError.internal('Failed to update memory', error);
  }
};

/**
 * Delete memory
 */
export const deleteMemory = async (req: any, res: Response, next: NextFunction) => {
  try {
    const { id: twinId, memId } = req.params;
    const userId = req.user?.id || req.userId;
    
    if (!userId) {
      throw createError.unauthorized();
    }
    
    // Verify twin ownership
    const twinResult = await db.query(
      'SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2',
      [twinId, userId]
    );
    
    if (!twinResult || twinResult.rows.length === 0) {
      throw createError.notFound('Twin not found', ErrorCodes.TWIN_NOT_FOUND);
    }
    
    // Delete memory
    const memory = await memChunksQueries.delete(memId);
    
    if (!memory) {
      throw createError.notFound('Memory not found');
    }
    
    res.json({ 
      success: true, 
      message: 'Memory deleted successfully' 
    });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw createError.internal('Failed to delete memory', error);
  }
};