import { Response } from 'express';
import { userQueries, twinQueries } from '../config/database';

/**
 * Help Center page
 */
export async function getHelpCenter(req: any, res: Response) {
  // ✅ Use global locals filled by middleware (consistent with header/footer)
  const user = res.locals.user || null;
  const hasTwins = typeof res.locals.hasTwins !== 'undefined' ? res.locals.hasTwins : false;
  const twinId = res.locals.twinId || null;

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

  res.render('terms', {
    title: 'Terms of Service - AI Twin',
    user,
    hasTwins,
    twinId,
    csrfToken: res.locals['csrfToken'],
  });
}