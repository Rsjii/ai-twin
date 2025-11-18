import { Response } from 'express';
import { db } from '../config/database';
import { logger } from '../config/logger';
import { AppError, createError, ErrorCodes } from '../utils/errors';
import { userQueries, twinQueries } from '../config/database';

/**
 * My Twins page - Redirects to twin management page
 */
export async function getMyTwins(_req: any, res: Response) {
  // Redirect to new twin management page
  return res.redirect('/twin/manage');
}

/**
 * Twin Create page - Create new twin
 */
export function getTwinCreate(req: any, res: Response) {
  // Prefer JWT user if present; fallback to session user
  const user = req.user || (req as any).user;
  if (!user) {
    return res.redirect('/auth');
  }
  res.render('twin_create', {
    title: 'Create Twin - AI Twin',
    user: user,
    csrfToken: res.locals['csrfToken'],
  });
}

/**
 * Twin AI Edit page
 */
export async function getTwinAiEdit(req: any, res: Response) {
  try {
    const { id: twinId } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.redirect('/auth');
    }
    
    // Fetch full user data
    const fullUser = await userQueries.findByEmail(req.user.email);
    if (!fullUser) {
      return res.redirect('/auth');
    }
    
    // Check if user has twins
    const userTwins = await twinQueries.findByUserId(fullUser.id);
    const hasTwins = userTwins.length > 0;
    
    const twinResult = await db.query(`
      SELECT id, "styleVector", "personaData", "systemPrompt", "sampleReply", "createdAt", "last_updated", "style_version"
      FROM "Twin" 
      WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);
    
    if (twinResult.rows.length === 0) {
      throw createError.notFound('Twin not found or access denied', ErrorCodes.TWIN_NOT_FOUND);
    }
    
    // Set user data with all fields
    const user = {
      id: fullUser.id,
      email: fullUser.email,
      handle: fullUser.handle,
      name: fullUser.name,
      profileImage: fullUser.profileImage,
    };
    
    res.render('ai-edit', { 
      title: 'AI Edit - AI Twin',
      user: user,
      hasTwins: hasTwins,
      twinId: twinId,
      csrfToken: res.locals['csrfToken']
    });    
  } catch (error) {
    logger.error('AI edit route error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.id,
      twinId: req.params.id,
      path: req.path
    });
    
    if (error instanceof AppError) {
      throw error;
    }
    
    throw createError.internal('Failed to load AI edit page', error);
  }
}

/**
 * Twin Style Customize page
 */
export async function getTwinStyleCustomize(req: any, res: Response) {
  try {
    const { id: twinId } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.redirect('/auth');
    }
    
    // Fetch full user data
    const fullUser = await userQueries.findByEmail(req.user.email);
    if (!fullUser) {
      return res.redirect('/auth');
    }
    
    // Check if user has twins
    const userTwins = await twinQueries.findByUserId(fullUser.id);
    const hasTwins = userTwins.length > 0;
    
    const twinResult = await db.query(`
      SELECT id, "styleVector", "personaData", "systemPrompt", "sampleReply", "createdAt", "last_updated", "style_version"
      FROM "Twin" 
      WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);
    
    if (twinResult.rows.length === 0) {
      throw createError.notFound('Twin not found or access denied', ErrorCodes.TWIN_NOT_FOUND);
    }
    
    // Set user data with all fields
    const user = {
      id: fullUser.id,
      email: fullUser.email,
      handle: fullUser.handle,
      name: fullUser.name,
      profileImage: fullUser.profileImage,
    };
    
    res.render('style-customize', { 
      title: 'Style Customize - AI Twin',
      user: user,
      hasTwins: hasTwins,
      twinId: twinId,
      csrfToken: res.locals['csrfToken']
    });    
  } catch (error) {
    logger.error('Style customize route error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.id,
      twinId: req.params.id,
      path: req.path
    });
    
    if (error instanceof AppError) {
      throw error;
    }
    
    throw createError.internal('Failed to load style customize page', error);
  }
}

/**
 * Twin Learning Dashboard page
 */
export async function getTwinLearningDashboard(req: any, res: Response) {
  try {
    const { id: twinId } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.redirect('/auth');
    }
    
    // Fetch full user data
    const fullUser = await userQueries.findByEmail(req.user.email);
    if (!fullUser) {
      return res.redirect('/auth');
    }
    
    // Check if user has twins
    const userTwins = await twinQueries.findByUserId(fullUser.id);
    const hasTwins = userTwins.length > 0;
    
    const twinResult = await db.query(`
      SELECT id, "styleVector", "personaData", "systemPrompt", "sampleReply", "createdAt", "last_updated", "style_version"
      FROM "Twin" 
      WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);
    
    if (twinResult.rows.length === 0) {
      throw createError.notFound('Twin not found or access denied', ErrorCodes.TWIN_NOT_FOUND);
    }
    
    // Set user data with all fields
    const user = {
      id: fullUser.id,
      email: fullUser.email,
      handle: fullUser.handle,
      name: fullUser.name,
      profileImage: fullUser.profileImage,
    };
    
    res.render('learning-dashboard', { 
      title: 'Learning Dashboard - AI Twin',
      user: user,
      hasTwins: hasTwins,
      twinId: twinId,
      csrfToken: res.locals['csrfToken']
    });
  } catch (error) {
    logger.error('Learning dashboard route error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.id,
      twinId: req.params.id,
      path: req.path
    });
    
    if (error instanceof AppError) {
      throw error;
    }
    
    throw createError.internal('Failed to load learning dashboard', error);
  }
}
