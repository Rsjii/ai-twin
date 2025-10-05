import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

// Simple CSRF token generation and validation
export const generateCSRFToken = (req: Request, res: Response, next: NextFunction) => {
  if (!req.session?.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;
  next();
};

export const validateCSRF = (req: Request, res: Response, next: NextFunction) => {
  const token = req.body._csrf || req.headers['x-csrf-token'];
  const sessionToken = req.session?.csrfToken;
  
  if (!token || !sessionToken || token !== sessionToken) {
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }
  
  next();
};
