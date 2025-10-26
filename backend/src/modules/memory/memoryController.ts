import { Request, Response } from 'express';
import { db, memChunksQueries } from '../../config/database';
import { logger } from '../../config/logger';

/**
 * Get memory statistics for a twin
 */
export const getMemoryStats = async (req: any, res: Response) => {
  try {
    const { id: twinId } = req.params;
    const userId = req.user.id;
    
    // Verify twin ownership
    const twinResult = await db.query(`
      SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);
    
    if (twinResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Twin not found' });
    }
    
    // Get memory statistics
    const statsResult = await db.query(`
      SELECT 
        bucket,
        COUNT(*) as count
      FROM mem_chunks 
      WHERE twin_id = $1 
      GROUP BY bucket
    `, [twinId]);
    
    const totalMemories = statsResult.rows.reduce((sum, row) => sum + parseInt(row.count), 0);
    
    res.json({ 
      success: true, 
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
 * Retrieve memories by bucket
 */
export const retrieveMemories = async (req: any, res: Response) => {
  try {
    const { id: twinId } = req.params;
    const { bucket, limit = 10, offset = 0 } = req.query;
    const userId = req.user.id;
    
    // Verify twin ownership
    const twinResult = await db.query(`
      SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);
    
    if (twinResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Twin not found' });
    }
    
    // Get memories
    const memories = await memChunksQueries.findByTwinIdAndBucket(
      twinId, 
      bucket as 'facts' | 'voice', 
      parseInt(limit as string), 
      parseInt(offset as string)
    );
    
    res.json({ success: true, memories });
  } catch (error) {
    logger.error('Retrieve memories error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve memories' });
  }
};

/**
 * Ingest new memories
 */
export const ingestMemories = async (req: any, res: Response) => {
  try {
    const { id: twinId } = req.params;
    const { bucket, text } = req.body;
    const userId = req.user.id;
    
    // Verify twin ownership
    const twinResult = await db.query(`
      SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);
    
    if (twinResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Twin not found' });
    }
    
    // Validate input
    if (!bucket || !text) {
      return res.status(400).json({ success: false, error: 'Bucket and text are required' });
    }
    
    if (!['facts', 'voice'].includes(bucket)) {
      return res.status(400).json({ success: false, error: 'Invalid bucket type' });
    }
    
    // Create memory
    const memory = await memChunksQueries.create(twinId, bucket as 'facts' | 'voice', text);
    
    res.json({ 
      success: true, 
      memory,
      message: 'Memory ingested successfully' 
    });
  } catch (error) {
    logger.error('Ingest memory error:', error);
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
    const userId = req.user.id;
    
    // Verify twin ownership
    const twinResult = await db.query(`
      SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);
    
    if (twinResult.rows.length === 0) {
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
    const userId = req.user.id;
    
    // Verify twin ownership
    const twinResult = await db.query(`
      SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);
    
    if (twinResult.rows.length === 0) {
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