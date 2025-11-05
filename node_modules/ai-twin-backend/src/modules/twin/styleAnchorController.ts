import { Request, Response, NextFunction } from 'express';
import { db, styleAnchorsQueries } from '../../config/database';
import { logger } from '../../config/logger';
import { AppError, createError, ErrorCodes } from '../../utils/errors';

/**
 * Get all style anchors for a twin
 */
export const getTwinAnchors = async (req: any, res: Response, next: NextFunction) => {
  try {
    const { id: twinId } = req.params;
    const { limit = 10, offset = 0 } = req.query;
    const userId = req.user.id;
    
    // Verify twin ownership
    const twinResult = await db.query(`
      SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);
    
    if (twinResult.rows.length === 0) {
      throw createError.notFound('Twin not found', ErrorCodes.TWIN_NOT_FOUND);
    }
    
    // Get style anchors
    const anchors = await styleAnchorsQueries.findByTwinId(
      twinId, 
      parseInt(limit as string), 
      parseInt(offset as string)
    );
    
    res.json({ success: true, anchors });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw createError.internal('Failed to get style anchors', error);
  }
};

/**
 * Add new style anchor (supports interaction, phrase, pattern)
 */
export const addTwinAnchor = async (req: any, res: Response, next: NextFunction) => {
  try {
    const { id: twinId } = req.params;
    const { 
      userUtterance = '', 
      idealReply = '', 
      tags = [], 
      type = 'interaction',
      phrase,
      patternType,
      context
    } = req.body;
    const userId = req.user.id;
    
    // Verify twin ownership
    const twinResult = await db.query(
      'SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2',
      [twinId, userId]
    );
    
    if (twinResult.rows.length === 0) {
      throw createError.notFound('Twin not found', ErrorCodes.TWIN_NOT_FOUND);
    }
    
    // Validate based on type
    if (type === 'interaction') {
      if (!userUtterance || !idealReply) {
        throw createError.validation('User utterance and ideal reply are required for interactions');
      }
    } else if (type === 'phrase') {
      if (!phrase || phrase.trim().length === 0) {
        throw createError.validation('Phrase is required for phrase type anchors');
      }
    } else if (type === 'pattern') {
      if (!userUtterance || userUtterance.trim().length === 0) {
        throw createError.validation('Pattern examples (userUtterance) are required for pattern type anchors');
      }
    }
    
    // Add style anchor with all parameters
    const anchor = await styleAnchorsQueries.create(
      twinId, 
      userUtterance || '', 
      idealReply || '', 
      tags,
      type as 'interaction' | 'phrase' | 'pattern',
      phrase,
      patternType,
      context
    );
    
    res.json({ 
      success: true, 
      anchor,
      message: 'Style anchor added successfully' 
    });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw createError.internal('Failed to add style anchor', error);
  }
};

/**
 * Update style anchor (supports all types)
 */
export const updateTwinAnchor = async (req: any, res: Response, next: NextFunction) => {
  try {
    const { id: twinId, anchorId } = req.params;
    const { 
      userUtterance = '', 
      idealReply = '', 
      tags = [], 
      type,
      phrase,
      patternType,
      context
    } = req.body;
    const userId = req.user.id;
    
    // Verify twin ownership
    const twinResult = await db.query(
      'SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2',
      [twinId, userId]
    );
    
    if (twinResult.rows.length === 0) {
      throw createError.notFound('Twin not found', ErrorCodes.TWIN_NOT_FOUND);
    }
    
    // Update style anchor with all parameters
    const anchor = await styleAnchorsQueries.update(
      anchorId, 
      userUtterance || '', 
      idealReply || '', 
      tags,
      type as 'interaction' | 'phrase' | 'pattern' | undefined,
      phrase,
      patternType,
      context
    );
    
    if (!anchor) {
      throw createError.notFound('Style anchor not found');
    }
    
    res.json({ 
      success: true, 
      anchor,
      message: 'Style anchor updated successfully' 
    });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw createError.internal('Failed to update style anchor', error);
  }
};

/**
 * Delete style anchor
 */
export const deleteTwinAnchor = async (req: any, res: Response, next: NextFunction) => {
  try {
    const { id: twinId, anchorId } = req.params;
    const userId = req.user.id;
    
    // Verify twin ownership
    const twinResult = await db.query(`
      SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);
    
    if (twinResult.rows.length === 0) {
      throw createError.notFound('Twin not found', ErrorCodes.TWIN_NOT_FOUND);
    }
    
    // Delete style anchor
    const anchor = await styleAnchorsQueries.delete(anchorId);
    
    if (!anchor) {
      throw createError.notFound('Style anchor not found');
    }
    
    res.json({ 
      success: true, 
      message: 'Style anchor deleted successfully' 
    });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw createError.internal('Failed to delete style anchor', error);
  }
};

/**
 * Get style phrases for a twin
 * GET /api/twin/:id/style-anchors/phrases
 */
export const getTwinPhrases = async (req: any, res: Response, next: NextFunction) => {
  try {
    const { id: twinId } = req.params;
    const { limit = 10 } = req.query;
    const userId = req.user.id;
    
    // Verify twin ownership
    const twinResult = await db.query(
      'SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2',
      [twinId, userId]
    );
    
    if (twinResult.rows.length === 0) {
      throw createError.notFound('Twin not found', ErrorCodes.TWIN_NOT_FOUND);
    }
    
    // Get phrases using new query method
    const phrases = await styleAnchorsQueries.findPhrasesByTwinId(
      twinId,
      parseInt(limit as string) || 10
    );
    
    res.json({ success: true, phrases });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw createError.internal('Failed to get phrases', error);
  }
};