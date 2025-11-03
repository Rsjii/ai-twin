import { Response } from 'express';
import { db, memChunksQueries } from '../../config/database';
import { logger } from '../../config/logger';

/**
 * Get memory statistics for a twin (DEPRECATED - uses mem_chunks)
 * @deprecated Consider using /api/twin/:id/long-term-memory and /api/twin/:id/style-anchors
 */
export const getMemoryStats = async (req: any, res: Response) => {
  try {
    const { id: twinId } = req.params;
    const userId = req.user?.id || req.userId;
    
    // Deprecation warning
    logger.warn('⚠️ DEPRECATED: getMemoryStats - Consider using unified endpoints');
    
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    
    // Verify twin ownership
    const twinResult = await db.query(
      'SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2',
      [twinId, userId]
    );
    
    if (!twinResult || twinResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Twin not found' });
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
      return res.status(500).json({ success: false, error: 'Failed to get memory statistics' });
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
    logger.error('Get memory stats error:', error);
    res.status(500).json({ success: false, error: 'Failed to get memory statistics' });
  }
};

/**
 * Retrieve memories by bucket (DEPRECATED - uses mem_chunks)
 * @deprecated Use /api/twin/:id/long-term-memory or /api/twin/:id/style-anchors instead
 */
export const retrieveMemories = async (req: any, res: Response) => {
  try {
    const { id: twinId } = req.params;
    const { bucket, limit = 10, offset = 0 } = req.query;
    const userId = req.user?.id || req.userId;
    
    // Deprecation warning
    logger.warn('⚠️ DEPRECATED: retrieveMemories - Consider using unified endpoints');
    
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    
    // Verify twin ownership
    const twinResult = await db.query(
      'SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2',
      [twinId, userId]
    );
    
    if (!twinResult || twinResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Twin not found' });
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
    logger.error('Retrieve memories error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve memories' });
  }
};

/**
 * Ingest new memories (DEPRECATED - redirects to unified endpoints)
 * @deprecated Use /api/twin/:id/long-term-memory or /api/twin/:id/style-anchors instead
 */
export const ingestMemories = async (req: any, res: Response) => {
  try {
    const { id: twinId } = req.params;
    const { bucket, text } = req.body;
    const userId = req.user?.id || req.userId;
    
    // Deprecation warning
    logger.warn('⚠️ DEPRECATED: ingestMemories endpoint called. Consider using unified endpoints.');
    
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    
    // Verify twin ownership
    const twinResult = await db.query(
      'SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2',
      [twinId, userId]
    );
    
    if (!twinResult || twinResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Twin not found' });
    }
    
    // Validate input
    if (!bucket || !text) {
      return res.status(400).json({ 
        success: false, 
        error: 'Bucket and text are required',
        deprecated: true,
        message: 'This endpoint is deprecated. Use /api/twin/:id/long-term-memory for facts or /api/twin/:id/style-anchors for voice patterns.'
      });
    }
    
    if (!['facts', 'voice'].includes(bucket)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid bucket. Use "facts" or "voice".',
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
    return res.status(400).json({ success: false, error: 'Invalid bucket type' });
  } catch (error) {
    logger.error('Ingest memories error:', error);
    res.status(500).json({ success: false, error: 'Failed to ingest memory' });
  }
};

/**
 * Update memory
 */
export const updateMemory = async (req: any, res: Response) => {
  try {
    const { id: twinId, memId } = req.params;
    const { text } = req.body;
    const userId = req.user?.id || req.userId;
    
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    
    // Verify twin ownership
    const twinResult = await db.query(
      'SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2',
      [twinId, userId]
    );
    
    if (!twinResult || twinResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Twin not found' });
    }
    
    // Validate input
    if (!text) {
      return res.status(400).json({ success: false, error: 'Text is required' });
    }
    
    // Update memory
    const memory = await memChunksQueries.update(memId, text);
    
    if (!memory) {
      return res.status(404).json({ success: false, error: 'Memory not found' });
    }
    
    res.json({ 
      success: true, 
      memory,
      message: 'Memory updated successfully' 
    });
  } catch (error) {
    logger.error('Update memory error:', error);
    res.status(500).json({ success: false, error: 'Failed to update memory' });
  }
};

/**
 * Delete memory
 */
export const deleteMemory = async (req: any, res: Response) => {
  try {
    const { id: twinId, memId } = req.params;
    const userId = req.user?.id || req.userId;
    
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    
    // Verify twin ownership
    const twinResult = await db.query(
      'SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2',
      [twinId, userId]
    );
    
    if (!twinResult || twinResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Twin not found' });
    }
    
    // Delete memory
    const memory = await memChunksQueries.delete(memId);
    
    if (!memory) {
      return res.status(404).json({ success: false, error: 'Memory not found' });
    }
    
    res.json({ 
      success: true, 
      message: 'Memory deleted successfully' 
    });
  } catch (error) {
    logger.error('Delete memory error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete memory' });
  }
};