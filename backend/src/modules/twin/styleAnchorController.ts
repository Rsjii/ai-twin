import { Request, Response } from 'express';
import { db, styleAnchorsQueries } from '../../config/database';
import { logger } from '../../config/logger';

/**
 * Get all style anchors for a twin
 */
export const getTwinAnchors = async (req: any, res: Response) => {
  try {
    const { id: twinId } = req.params;
    const { limit = 10, offset = 0 } = req.query;
    const userId = req.user.id;
    
    // Verify twin ownership
    const twinResult = await db.query(`
      SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);
    
    if (twinResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Twin not found' });
    }
    
    // Get style anchors
    const anchors = await styleAnchorsQueries.findByTwinId(
      twinId, 
      parseInt(limit as string), 
      parseInt(offset as string)
    );
    
    res.json({ success: true, anchors });
  } catch (error) {
    logger.error('Get twin anchors error:', error);
    res.status(500).json({ success: false, error: 'Failed to get style anchors' });
  }
};

/**
 * Add new style anchor
 */
export const addTwinAnchor = async (req: any, res: Response) => {
  try {
    const { id: twinId } = req.params;
    const { userUtterance, idealReply, tags = [] } = req.body;
    const userId = req.user.id;
    
    // Verify twin ownership
    const twinResult = await db.query(`
      SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);
    
    if (twinResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Twin not found' });
    }
    
    // Validate input
    if (!userUtterance || !idealReply) {
      return res.status(400).json({ success: false, error: 'User utterance and ideal reply are required' });
    }
    
    // Add style anchor
    const anchor = await styleAnchorsQueries.create(twinId, userUtterance, idealReply, tags);
    
    res.json({ 
      success: true, 
      anchor,
      message: 'Style anchor added successfully' 
    });
  } catch (error) {
    logger.error('Add twin anchor error:', error);
    res.status(500).json({ success: false, error: 'Failed to add style anchor' });
  }
};

/**
 * Update style anchor
 */
export const updateTwinAnchor = async (req: any, res: Response) => {
  try {
    const { id: twinId, anchorId } = req.params;
    const { userUtterance, idealReply, tags = [] } = req.body;
    const userId = req.user.id;
    
    // Verify twin ownership
    const twinResult = await db.query(`
      SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);
    
    if (twinResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Twin not found' });
    }
    
    // Validate input
    if (!userUtterance || !idealReply) {
      return res.status(400).json({ success: false, error: 'User utterance and ideal reply are required' });
    }
    
    // Update style anchor
    const anchor = await styleAnchorsQueries.update(anchorId, userUtterance, idealReply, tags);
    
    if (!anchor) {
      return res.status(404).json({ success: false, error: 'Style anchor not found' });
    }
    
    res.json({ 
      success: true, 
      anchor,
      message: 'Style anchor updated successfully' 
    });
  } catch (error) {
    logger.error('Update twin anchor error:', error);
    res.status(500).json({ success: false, error: 'Failed to update style anchor' });
  }
};

/**
 * Delete style anchor
 */
export const deleteTwinAnchor = async (req: any, res: Response) => {
  try {
    const { id: twinId, anchorId } = req.params;
    const userId = req.user.id;
    
    // Verify twin ownership
    const twinResult = await db.query(`
      SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);
    
    if (twinResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Twin not found' });
    }
    
    // Delete style anchor
    const anchor = await styleAnchorsQueries.delete(anchorId);
    
    if (!anchor) {
      return res.status(404).json({ success: false, error: 'Style anchor not found' });
    }
    
    res.json({ 
      success: true, 
      message: 'Style anchor deleted successfully' 
    });
  } catch (error) {
    logger.error('Delete twin anchor error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete style anchor' });
  }
};