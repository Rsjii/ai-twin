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
  // For now, allow requests without CSRF token for testing
  // In production, you should validate the CSRF token
  const token = req.headers['x-csrf-token'];
  
  if (token) {
    console.log('CSRF token provided:', token);
  } else {
    console.log('No CSRF token provided, allowing request');
  }
  
  next();
};
