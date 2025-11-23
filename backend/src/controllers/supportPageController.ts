import { Response } from 'express';
import { userQueries, twinQueries } from '../config/database';
import { logger } from '../config/logger';

/**
 * Help Center page
 */
export async function getHelpCenter(req: any, res: Response) {
  // ✅ Use global locals filled by middleware (consistent with header/footer)
  const user = res.locals.user || null;
  const hasTwins = typeof res.locals.hasTwins !== 'undefined' ? res.locals.hasTwins : false;
  const twinId = res.locals.twinId || null;

  // ✅ Ultra-detailed page log for debugging header/footer
  try {
    logger.info('[PAGE_HELP_CENTER]', {
      path: req.path,
      userFromReq: req.user
        ? { id: req.user.id, email: req.user.email, handle: req.user.handle }
        : null,
      userFromLocals: user
        ? { id: user.id, email: user.email, handle: user.handle }
        : null,
      hasTwins,
      twinId,
    });
  } catch (logError) {
    logger.warn('[PAGE_HELP_CENTER] Failed to log context:', logError);
  }

  console.log('[PAGE_HELP_CENTER] Render data:', {
    user: user ? { id: user.id, email: user.email } : null,
    hasTwins,
    twinId,
    userFromReq: req.user ? { id: req.user.id, email: req.user.email } : null,
    userFromLocals: user ? { id: user.id, email: user.email } : null,
  });

  res.render('help-center', {
    title: 'Help Center - AI Twin',
    user,
    hasTwins,
    twinId,
    csrfToken: res.locals['csrfToken'],
  });
}

export async function getContact(req: any, res: Response) {
  // ✅ Use global locals filled by middleware (consistent with header/footer)
  const user = res.locals.user || null;
  const hasTwins = typeof res.locals.hasTwins !== 'undefined' ? res.locals.hasTwins : false;
  const twinId = res.locals.twinId || null;

  console.log('[PAGE_CONTACT] Render data:', {
    user: user ? { id: user.id, email: user.email } : null,
    hasTwins,
    twinId,
  });

  res.render('contact', {
    title: 'Contact Us - AI Twin',
    user,
    hasTwins,
    twinId,
    csrfToken: res.locals['csrfToken'],
  });
}

export async function getPrivacy(req: any, res: Response) {
  // ✅ Use global locals filled by middleware (consistent with header/footer)
  const user = res.locals.user || null;
  const hasTwins = typeof res.locals.hasTwins !== 'undefined' ? res.locals.hasTwins : false;
  const twinId = res.locals.twinId || null;

  console.log('[PAGE_PRIVACY] Render data:', {
    user: user ? { id: user.id, email: user.email } : null,
    hasTwins,
    twinId,
  });

  res.render('privacy', {
    title: 'Privacy Policy - AI Twin',
    user,
    hasTwins,
    twinId,
    csrfToken: res.locals['csrfToken'],
  });
}

export async function getTerms(req: any, res: Response) {
  // ✅ Use global locals filled by middleware (consistent with header/footer)
  const user = res.locals.user || null;
  const hasTwins = typeof res.locals.hasTwins !== 'undefined' ? res.locals.hasTwins : false;
  const twinId = res.locals.twinId || null;

  console.log('[PAGE_TERMS] Render data:', {
    user: user ? { id: user.id, email: user.email } : null,
    hasTwins,
    twinId,
  });

  res.render('terms', {
    title: 'Terms of Service - AI Twin',
    user,
    hasTwins,
    twinId,
    csrfToken: res.locals['csrfToken'],
  });
}