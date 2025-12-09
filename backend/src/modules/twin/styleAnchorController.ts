import { Response, NextFunction } from 'express';
import { styleAnchorsQueries } from '../../config/database';
import { AppError, createError, ErrorCodes } from '../../utils/errors';
import { verifyTwinOwnership } from '../../utils/twinUtils';
import { detokenizeId } from '../../utils/idTokenization';

/**
 * Get all style anchors for a twin
 */
export const getTwinAnchors = async (req: any, res: Response, next: NextFunction) => {
  try {
    // ✅ SECURITY: Detokenize twinToken from URL
    const { twinToken } = req.params;
    const decoded = detokenizeId(twinToken, { userId: req.user.id, endpoint: 'getTwinAnchors' });
    if (!decoded || decoded.type !== 'twin') {
      throw createError.notFound('This twin link is invalid or has expired.', ErrorCodes.TWIN_NOT_FOUND);
    }
    const twinId = decoded.id;
    const { limit = 10, offset = 0 } = req.query;
    const userId = req.user.id;
    
    
    // Verify twin ownership
    await verifyTwinOwnership(twinId, userId);
    
    // Get style anchors
    const anchors = await styleAnchorsQueries.findByTwinId(
      twinId, 
      parseInt(limit as string), 
      parseInt(offset as string)
    );
    
    // ✅ ADD: Cache headers to prevent 304 responses
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0, private',
      'Pragma': 'no-cache',
      'Expires': '0',
    });
    res.json({ success: true, anchors });
  } catch (error) {
    next(error); // ✅ Standardize
  }
};

/**
 * Add new style anchor (supports interaction, phrase, pattern)
 */
export const addTwinAnchor = async (req: any, res: Response, next: NextFunction) => {
  try {
    // ✅ SECURITY: Detokenize twinToken from URL
    const { twinToken } = req.params;
    const decoded = detokenizeId(twinToken, { userId: req.user.id, endpoint: 'addTwinAnchor' });
    if (!decoded || decoded.type !== 'twin') {
      throw createError.validation('Invalid twin token', ErrorCodes.INVALID_INPUT);
    }
    const twinId = decoded.id;
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
    next(error); // ✅ Standardize
  }
};

/**
 * Update style anchor (supports all types)
 */
export const updateTwinAnchor = async (req: any, res: Response, next: NextFunction) => {
  try {
    // ✅ SECURITY: Detokenize twinToken from URL
    const { twinToken, anchorId } = req.params;
    const decoded = detokenizeId(twinToken, { userId: req.user.id, endpoint: 'updateTwinAnchor' });
    if (!decoded || decoded.type !== 'twin') {
      throw createError.validation('Invalid twin token', ErrorCodes.INVALID_INPUT);
    }
    const twinId = decoded.id;
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
    next(error); // ✅ Standardize
  }
};

/**
 * Delete style anchor
 */
export const deleteTwinAnchor = async (req: any, res: Response, next: NextFunction) => {
  try {
    // ✅ SECURITY: Detokenize twinToken from URL
    const { twinToken, anchorId } = req.params;
    const decoded = detokenizeId(twinToken, { userId: req.user.id, endpoint: 'deleteTwinAnchor' });
    if (!decoded || decoded.type !== 'twin') {
      throw createError.validation('Invalid twin token', ErrorCodes.INVALID_INPUT);
    }
    const twinId = decoded.id;
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
    next(error); // ✅ Standardize
  }
};

/**
 * Get style phrases for a twin
 * GET /api/twin/:id/style-anchors/phrases
 */
export const getTwinPhrases = async (req: any, res: Response, next: NextFunction) => {
  try {
    // ✅ SECURITY: Detokenize twinToken from URL
    const { twinToken } = req.params;
    const decoded = detokenizeId(twinToken, { userId: req.user.id, endpoint: 'getTwinPhrases' });
    if (!decoded || decoded.type !== 'twin') {
      throw createError.validation('Invalid twin token', ErrorCodes.INVALID_INPUT);
    }
    const twinId = decoded.id;
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
    next(error); // ✅ Standardize
  }
};