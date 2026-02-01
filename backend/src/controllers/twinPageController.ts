import { Response } from 'express';
import { db } from '../config/database';
import { logger } from '../config/logger';
import { AppError, createError, ErrorCodes } from '../utils/errors';
import { userQueries, twinQueries } from '../config/database';
import { handleControllerError } from '../utils/errorHandler';
import { detokenizeId, tokenizeId } from '../utils/idTokenization';

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
    title: 'Create Twin - TwinOS',
    user: res.locals.user || user, // ✅ ensures profileImage
    csrfToken: res.locals['csrfToken'],
  });
}

/**
 * Twin AI Edit page
 */
export async function getTwinAiEdit(req: any, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.redirect('/auth');

    const fullUser = await userQueries.findByEmail(req.user.email);
    if (!fullUser) return res.redirect('/auth');

    // ✅ Single twin per user (latest)
    const twinResult = await db.query(`
      SELECT id, "styleVector", "personaData", "systemPrompt", "sampleReply", "createdAt", "last_updated", "style_version"
      FROM "Twin"
      WHERE "userId" = $1
      ORDER BY "createdAt" DESC
      LIMIT 1
    `, [userId]);

    if (twinResult.rows.length === 0) {
      return res.redirect('/twin/create');
    }

    const twin = twinResult.rows[0];
    
    // ✅ SECURITY: Tokenize twinId before passing to frontend
    const twinToken = tokenizeId(twin.id, 'twin');

    const user = {
      id: fullUser.id,
      email: fullUser.email,
      handle: fullUser.handle,
      name: fullUser.name,
      profileImage: fullUser.profileImage,
    };

    res.render('ai-edit', { 
      title: 'AI Edit - TwinOS',
      user,
      hasTwins: true,
      twinToken: twinToken,  // ✅ SECURITY: Use tokenized ID
      csrfToken: res.locals['csrfToken'],
    });    
  } catch (error) {
    logger.error('AI edit route error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.id,
      twinId: req.params.id,
      path: req.path
    });
    
    handleControllerError(error, 'Failed to load AI edit page');
  }
}

/**
 * Twin Style Customize page
 */
export async function getTwinStyleCustomize(req: any, res: Response) {
  // MVP: style-customize page is not used anymore
  return res.redirect('/twin-settings');
}

/**
 * Twin Learning Dashboard page
 */
export async function getTwinLearningDashboard(req: any, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.redirect('/auth');

    const fullUser = await userQueries.findByEmail(req.user.email);
    if (!fullUser) return res.redirect('/auth');

    // ✅ Single twin per user (latest)
    const twinResult = await db.query(`
      SELECT id, "styleVector", "personaData", "systemPrompt", "sampleReply", "createdAt", "last_updated", "style_version"
      FROM "Twin"
      WHERE "userId" = $1
      ORDER BY "createdAt" DESC
      LIMIT 1
    `, [userId]);

    if (twinResult.rows.length === 0) {
      return res.redirect('/twin/create');
    }

    const twin = twinResult.rows[0];
    
    // ✅ SECURITY: Tokenize twinId before passing to frontend
    const twinToken = tokenizeId(twin.id, 'twin');

    const user = {
      id: fullUser.id,
      email: fullUser.email,
      handle: fullUser.handle,
      name: fullUser.name,
      profileImage: fullUser.profileImage,
    };

    res.render('twin-settings', { 
      title: 'Twin Settings - TwinOS',
      user,
      hasTwins: true,
      twinToken: twinToken,  // ✅ SECURITY: Use tokenized ID
      csrfToken: res.locals['csrfToken'],
    });
  } catch (error) {
    logger.error('Learning dashboard route error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.id,
      twinId: req.params.id,
      path: req.path
    });
    
    handleControllerError(error, 'Failed to load learning dashboard');
  }
}
