import { Response } from 'express';
import { db } from '../config/database';

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
    const userId = req.user.id;
    
    // Verify twin ownership
    const twinResult = await db.query(`
      SELECT id, "styleVector", "personaData", "systemPrompt", "sampleReply", "createdAt", "last_updated", "style_version"
      FROM "Twin" 
      WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);
    
    if (twinResult.rows.length === 0) {
      return res.status(404).render('error', { 
        message: 'Twin not found or access denied',
        user: req.user 
      });
    }
    
    res.render('ai-edit', { 
      title: 'AI Edit - AI Twin',
      user: req.user,
      twinId: twinId,
      csrfToken: res.locals['csrfToken']
    });
  } catch (error) {
    console.error('AI edit route error:', error);
    res.status(500).render('error', { 
      message: 'Internal server error',
      user: req.user 
    });
  }
}

/**
 * Twin Style Customize page
 */
export async function getTwinStyleCustomize(req: any, res: Response) {
  try {
    const { id: twinId } = req.params;
    const userId = req.user.id;
    
    // Verify twin ownership
    const twinResult = await db.query(`
      SELECT id, "styleVector", "personaData", "systemPrompt", "sampleReply", "createdAt", "last_updated", "style_version"
      FROM "Twin" 
      WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);
    
    if (twinResult.rows.length === 0) {
      return res.status(404).render('error', { 
        message: 'Twin not found or access denied',
        user: req.user 
      });
    }
    
    res.render('style-customize', { 
      title: 'Style Customize - AI Twin',
      user: req.user,
      twinId: twinId,
      csrfToken: res.locals['csrfToken']
    });
  } catch (error) {
    console.error('Style customize route error:', error);
    res.status(500).render('error', { 
      message: 'Internal server error',
      user: req.user 
    });
  }
}

/**
 * Twin Learning Dashboard page
 */
export async function getTwinLearningDashboard(req: any, res: Response) {
  try {
    const { id: twinId } = req.params;
    const userId = req.user.id;
    
    // Verify twin ownership
    const twinResult = await db.query(`
      SELECT id, "styleVector", "personaData", "systemPrompt", "sampleReply", "createdAt", "last_updated", "style_version"
      FROM "Twin" 
      WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);
    
    if (twinResult.rows.length === 0) {
      return res.status(404).render('error', { 
        message: 'Twin not found or access denied',
        user: req.user 
      });
    }
    
    res.render('learning-dashboard', { 
      title: 'Learning Dashboard - AI Twin',
      user: req.user,
      twinId: twinId,
      csrfToken: res.locals['csrfToken']
    });
  } catch (error) {
    console.error('Learning dashboard route error:', error);
    res.status(500).render('error', { 
      message: 'Internal server error',
      user: req.user 
    });
  }
}

