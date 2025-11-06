import { Response } from 'express';
import { generateCSRFToken } from '../middleware/csrf';

/**
 * Help Center page
 */
export function getHelpCenter(req: any, res: Response) {
  res.render('help-center', {
    title: 'Help Center - AI Twin',
    user: req.user,
    csrfToken: res.locals['csrfToken'],
  });
}

/**
 * Contact Us page
 */
export function getContact(req: any, res: Response) {
  res.render('contact', {
    title: 'Contact Us - AI Twin',
    user: req.user,
    csrfToken: res.locals['csrfToken'],
  });
}

/**
 * Privacy Policy page
 */
export function getPrivacy(req: any, res: Response) {
  res.render('privacy', {
    title: 'Privacy Policy - AI Twin',
    user: req.user,
    csrfToken: res.locals['csrfToken'],
  });
}

/**
 * Terms of Service page
 */
export function getTerms(req: any, res: Response) {
  res.render('terms', {
    title: 'Terms of Service - AI Twin',
    user: req.user,
    csrfToken: res.locals['csrfToken'],
  });
}

