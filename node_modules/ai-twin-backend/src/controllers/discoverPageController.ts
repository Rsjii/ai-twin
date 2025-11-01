import { Response } from 'express';

/**
 * Discover page
 */
export function getDiscover(req: any, res: Response) {
  res.render('discover');
}

/**
 * Onboarding page
 */
export function getOnboarding(req: any, res: Response) {
  res.render('onboarding', { 
    title: 'Create Your AI Twin - Enhanced Onboarding',
    user: req.user,
    csrfToken: res.locals['csrfToken']
  });
}

/**
 * Memory Management page
 */
export function getMemoryManagement(req: any, res: Response) {
  res.render('memory-management', { 
    title: 'Memory Management - AI Twin',
    user: req.user,
    twinId: req.query.twinId || 'default',
    csrfToken: res.locals['csrfToken']
  });
}

