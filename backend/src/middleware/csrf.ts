import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { logger } from '../config/logger';
import { AppError } from '../utils/errors';

// ✅ Generate CSRF token only on GET (HTML pages)
export const generateCSRFToken = (req: Request, res: Response, next: NextFunction) => {
  if (req.method !== 'GET') return next();

  if (!req.session) {
    return next();
  }

  if (req.session.csrfToken) {
    res.locals.csrfToken = req.session.csrfToken;
    return next();
  }

  const newToken = crypto.randomBytes(32).toString('hex');
  req.session.csrfToken = newToken;
  res.locals.csrfToken = newToken;

  // Ensure token persists before render
  req.session.save((err) => {
    if (err) {
      return next(err);
    }
    return next();
  });
};

export const validateCSRF = (req: Request, _res: Response, next: NextFunction) => {
  const requestId = (req as any).requestId || null;

  const raw = req.headers['x-csrf-token'];
  const token = Array.isArray(raw) ? raw[0] : raw;
  const sessionToken = req.session?.csrfToken;

  if (!sessionToken) {
    // ✅ No session dump in logs (prod safe)
    logger.warn('CSRF missing in session', { requestId, path: req.path, method: req.method });
    return next(new AppError(403, 'Invalid CSRF token', 'CSRF_MISSING'));
  }

  if (!token || token !== sessionToken) {
    logger.warn('CSRF token mismatch', { requestId, path: req.path, method: req.method });
    return next(new AppError(403, 'Invalid CSRF token', 'CSRF_INVALID'));
  }

  return next();
};