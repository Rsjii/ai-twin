import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { logger } from '../config/logger';
import { AppError } from '../utils/errors';
import { config } from '../config/env';

// ✅ SECURITY: Track session secret hash in session itself to detect changes across restarts
function getSessionSecretHash(): string {
  const secret = config.sessionSecret || '';
  return crypto.createHash('sha256').update(secret).digest('hex').substring(0, 16);
}

// ✅ Generate CSRF token only on GET (HTML pages)
export const generateCSRFToken = (req: Request, res: Response, next: NextFunction) => {
  if (req.method !== 'GET') return next();

  if (!req.session) {
    return next();
  }

  const currentSecretHash = getSessionSecretHash();
  const sessionSecretHash = (req.session as any).secretHash;

  // ✅ If secret changed (detected via session), invalidate CSRF token
  if (sessionSecretHash && sessionSecretHash !== currentSecretHash) {
    logger.warn('[CSRF] Session secret changed - invalidating CSRF token');
    delete req.session.csrfToken;
    (req.session as any).secretHash = currentSecretHash;
  } else if (!sessionSecretHash) {
    // First time - store current secret hash in session
    (req.session as any).secretHash = currentSecretHash;
  }

  // ✅ Check if existing token is valid
  if (req.session.csrfToken) {
    res.locals.csrfToken = req.session.csrfToken;
    return next();
  }

  // Generate new token
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

// ✅ Optional CSRF validation - only validates if user is logged in (for anonymous users)
export const validateCSRFOptional = (req: Request, _res: Response, next: NextFunction) => {
  // If no user is logged in, skip CSRF validation (anonymous user)
  if (!req.user) {
    return next();
  }

  // If user is logged in, validate CSRF token
  // But if no session or no token, also skip (might be API call)
  if (!req.session || !req.session.csrfToken) {
    return next();
  }

  // User is logged in and has session token - validate CSRF
  return validateCSRF(req, _res, next);
};