import { Request, Response, NextFunction } from 'express';
import { AppError, ErrorCodes } from '../utils/errors';
import { logger } from '../config/logger';

/**
 * Async wrapper utility to catch errors from async route handlers
 * Usage: router.get('/path', asyncHandler(async (req, res) => { ... }))
 */
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

export const errorHandlerMiddleware = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Check if this is an API request (JSON) or page request (EJS)
  const isApiRequest = req.path.startsWith('/api/') || req.accepts('json');
  
  if (err instanceof AppError) {
    logger.warn(`AppError: ${err.errorCode} - ${err.message}`, {
      statusCode: err.statusCode,
      path: req.path,
    });
    
    if (isApiRequest) {
      return res.status(err.statusCode).json({
        error: err.message,
        errorCode: err.errorCode,
      });
    }
    
    // Render EJS views based on status code
    if (err.statusCode === 404) {
      return res.status(404).render('404', {
        title: 'Page Not Found',
        message: err.message,
        user: req.user || null,
        csrfToken: res.locals['csrfToken'] || ''
      });
    }
    
    if (err.statusCode === 403) {
      return res.status(403).render('403', {
        title: 'Access Denied',
        message: err.message,
        user: req.user || null,
        csrfToken: res.locals['csrfToken'] || ''
      });
    }
    
    // Generic error page
    return res.status(err.statusCode).render('error', {
      title: 'Error',
      message: err.message,
      errorCode: err.errorCode,
      user: req.user || null,
      csrfToken: res.locals['csrfToken'] || ''
    });
  }
  
  // Unhandled errors
  logger.error('Unhandled error:', {
    message: err.message,
    stack: err.stack,
    name: err.name,
    path: req.path,
    method: req.method
  });  
  
  if (isApiRequest) {
    return res.status(500).json({
      error: 'Internal server error',
      errorCode: ErrorCodes.INTERNAL_ERROR,
    });
  }
  
  return res.status(500).render('error', {
    title: 'Error',
    message: 'An unexpected error occurred',
    errorCode: ErrorCodes.INTERNAL_ERROR,
    user: req.user || null,
    csrfToken: res.locals['csrfToken'] || ''
  });
};