import { Response, NextFunction } from 'express';
import { db } from '../../config/database';
import { logger } from '../../config/logger';
import { AppError, createError } from '../../utils/errors';
import { verifyTwinOwnership } from '../../utils/twinUtils';
import { generateId } from '../../utils/idGenerator';
import { handleControllerError } from '../../utils/errorHandler';

/**
 * Get unified memory statistics
 * GET /api/memory/:id/memory/stats
 */
export const getMemoryStats = async (req: any, res: Response, next: NextFunction) => {
  try {
    const { id: twinId } = req.params;
    const userId = req.user?.id || req.userId;
    
    if (!userId) {
      throw createError.unauthorized();
    }
    
    // Verify twin ownership
    await verifyTwinOwnership(twinId, userId);
    
    // Get MemoryLongTerm stats
    const longTermResult = await db.query(`
      SELECT 
        category,
        COUNT(*) as count
      FROM "MemoryLongTerm"
      WHERE "twinId" = $1
      GROUP BY category
    `, [twinId]);
    
    // Get StyleAnchors stats
    const anchorsResult = await db.query(`
      SELECT 
        type,
        COUNT(*) as count
      FROM "style_anchors"
      WHERE twin_id = $1
      GROUP BY type
    `, [twinId]);
    
    const totalMemories = longTermResult.rows.reduce((sum, row) => sum + parseInt(row.count), 0);
    const totalAnchors = anchorsResult.rows.reduce((sum, row) => sum + parseInt(row.count), 0);
    
    res.json({
      success: true,
      total: totalMemories + totalAnchors,
      stats: [
        ...longTermResult.rows.map(row => ({
          bucket: row.category === 'fact' ? 'facts' : row.category,
          count: parseInt(row.count)
        })),
        ...anchorsResult.rows.map(row => ({
          bucket: row.type === 'phrase' ? 'voice' : row.type,
          count: parseInt(row.count)
        }))
      ]
    });
  } catch (error) {
    handleControllerError(error, 'Failed to get memory statistics');
  }
};

/**
 * Retrieve memories by bucket (UNIFIED VERSION)
 * GET /api/memory/:id/memory/retrieve
 */
export const retrieveMemories = async (req: any, res: Response, next: NextFunction) => {
  try {
    const { id: twinId } = req.params;
    const { bucket, limit = 10, offset = 0 } = req.query;
    const userId = req.user?.id || req.userId;
    
    if (!userId) {
      throw createError.unauthorized();
    }
    
    // Verify twin ownership
    await verifyTwinOwnership(twinId, userId);
    
    if (bucket === 'facts') {
      // Get from MemoryLongTerm
      const longTermResult = await db.query(`
        SELECT key, value, category, "createdAt", "updatedAt"
        FROM "MemoryLongTerm"
        WHERE "twinId" = $1 AND category = 'fact'
        ORDER BY "updatedAt" DESC
        LIMIT $2 OFFSET $3
      `, [twinId, parseInt(limit as string), parseInt(offset as string)]);
      
      res.json({
        success: true,
        memories: longTermResult.rows.map(row => ({
          id: row.key,
          text: row.value,
          bucket: 'facts',
          createdAt: row.createdAt,
          updatedAt: row.updatedAt
        }))
      });
      
    } else if (bucket === 'voice') {
      // Get from StyleAnchors (phrases)
      const phrasesResult = await db.query(`
        SELECT id, phrase, user_utterance, ideal_reply, tags, created_at
        FROM "style_anchors"
        WHERE twin_id = $1 AND type = 'phrase'
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3
      `, [twinId, parseInt(limit as string), parseInt(offset as string)]);
      
      res.json({
        success: true,
        memories: phrasesResult.rows.map(row => ({
          id: row.id,
          text: row.phrase || row.user_utterance,
          bucket: 'voice',
          createdAt: row.created_at
        }))
      });
      
    } else if (bucket === 'all') {
      // Get from both
      const [longTermResult, phrasesResult] = await Promise.all([
        db.query(`
          SELECT key, value, category, "createdAt", "updatedAt"
          FROM "MemoryLongTerm"
          WHERE "twinId" = $1
          ORDER BY "updatedAt" DESC
          LIMIT $2 OFFSET $3
        `, [twinId, parseInt(limit as string), parseInt(offset as string)]),
        db.query(`
          SELECT id, phrase, user_utterance, ideal_reply, tags, created_at
          FROM "style_anchors"
          WHERE twin_id = $1 AND type = 'phrase'
          ORDER BY created_at DESC
          LIMIT $2 OFFSET $3
        `, [twinId, parseInt(limit as string), parseInt(offset as string)])
      ]);
      
      res.json({
        success: true,
        memories: [
          ...longTermResult.rows.map(row => ({
            id: row.key,
            text: row.value,
            bucket: 'facts',
            createdAt: row.createdAt
          })),
          ...phrasesResult.rows.map(row => ({
            id: row.id,
            text: row.phrase || row.user_utterance,
            bucket: 'voice',
            createdAt: row.created_at
          }))
        ]
      });
    } else {
      throw createError.validation('Invalid bucket. Use "facts", "voice", or "all"');
    }
  } catch (error) {
    handleControllerError(error, 'Failed to retrieve memories');
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
    await verifyTwinOwnership(twinId, userId);
    
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
      req.body.key = generateId.fact();
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
    handleControllerError(error, 'Failed to ingest memory');
  }
};
