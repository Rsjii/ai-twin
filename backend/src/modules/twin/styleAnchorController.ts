import { Response, NextFunction } from 'express';
import { styleAnchorsQueries } from '../../config/database';
import { AppError, createError } from '../../utils/errors';
import { verifyTwinOwnership } from '../../utils/twinUtils';
import { handleControllerError } from '../../utils/errorHandler';

/**
 * Get all style anchors for a twin
 */
export const getTwinAnchors = async (req: any, res: Response, next: NextFunction) => {
  try {
    const { id: twinId } = req.params;
    const { limit = 10, offset = 0 } = req.query;
    const userId = req.user.id;
    
    console.log('[STYLE_ANCHORS:START]', {
      twinId,
      userId,
      limit,
      offset,
      path: req.path,
      method: req.method,
    });
    
    // Verify twin ownership
    await verifyTwinOwnership(twinId, userId);
    
    // Get style anchors
    const anchors = await styleAnchorsQueries.findByTwinId(
      twinId, 
      parseInt(limit as string), 
      parseInt(offset as string)
    );
    
    console.log('[STYLE_ANCHORS] Query result:', {
      anchorsCount: anchors.length,
      limit,
      offset,
      sampleAnchor: anchors[0] ? {
        id: anchors[0].id,
        type: anchors[0].type,
        phrase: anchors[0].phrase || null,
      } : null,
    });
    
    // ✅ ADD: Cache headers to prevent 304 responses
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0, private',
      'Pragma': 'no-cache',
      'Expires': '0',
    });
    res.json({ success: true, anchors });
  } catch (error) {
    handleControllerError(error, 'Failed to get style anchors');
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
    await verifyTwinOwnership(twinId, userId);
    
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
    
    // For phrases, use the phrase itself as user_utterance to make it unique
    // This avoids the unique constraint violation while satisfying NOT NULL
    // The phrase column will still store the actual phrase text
    let finalUserUtterance: string;
    let finalIdealReply: string;
    
    if (type === 'phrase') {
      // Use phrase as user_utterance to ensure uniqueness per twin
      // This satisfies both NOT NULL and unique constraint requirements
      finalUserUtterance = phrase || '';
      finalIdealReply = '';
    } else {
      finalUserUtterance = userUtterance || '';
      finalIdealReply = idealReply || '';
    }
    
    // Add style anchor with all parameters
    const anchor = await styleAnchorsQueries.create(
      twinId, 
      finalUserUtterance, 
      finalIdealReply, 
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
    handleControllerError(error, 'Failed to add style anchor');
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
    await verifyTwinOwnership(twinId, userId);
    
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
    handleControllerError(error, 'Failed to update style anchor');
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
    await verifyTwinOwnership(twinId, userId);
    
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
    handleControllerError(error, 'Failed to delete style anchor');
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
    await verifyTwinOwnership(twinId, userId);
    
    // Get phrases using new query method
    const phrases = await styleAnchorsQueries.findPhrasesByTwinId(
      twinId,
      parseInt(limit as string) || 10
    );
    
    res.json({ success: true, phrases });
  } catch (error) {
    handleControllerError(error, 'Failed to get phrases');
  }
};