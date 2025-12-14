import { Request, Response, NextFunction } from 'express';
import { AppError, ErrorCodes } from '../utils/errors';
import { logger } from '../config/logger';
import { EventLogger } from '../services/eventLogger';
import { EVENT_TYPES } from '../config/constants';
import { isProd } from '../config/env';

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
  const isApiRequest = req.path.startsWith('/api/');
  const requestId = (req as any).requestId || null;

  if (err instanceof AppError) {
    // ✅ Enhanced logging with structured context
    const userId = (req as any).user?.userId || (req as any).user?.id || null;
    
    logger.warn('AppError caught', {
      errorCode: err.errorCode,
      statusCode: err.statusCode,
      message: err.message,
      path: req.path,
      method: req.method,
      userId,
      requestId,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      ...(err.details && { details: err.details }), // ✅ Always log details (not exposed to user)
    });

    // ✅ Event logging - include details for debugging
    try {
      const meta = {
        path: req.path,
        method: req.method,
        statusCode: err.statusCode,
        errorCode: err.errorCode,
        requestId,
        ...(err.details && { details: err.details }), // ✅ Add details to event log
      };

      if (userId) {
        EventLogger.logUserEvent(userId, EVENT_TYPES.API_ERROR, meta).catch(() => {});
      } else {
        EventLogger.logSystemEvent(EVENT_TYPES.API_ERROR, meta).catch(() => {});
      }
    } catch {
      // swallow logging errors
    }

    if (isApiRequest) {
      // ✅ SECURITY: Remove requestId from JSON body, add to header only
      if (requestId) {
        res.setHeader('X-Request-Id', requestId);
      }
      res.status(err.statusCode).json({
        error: err.message,
        errorCode: err.errorCode,
      });
      return;
    }    

    if (err.statusCode === 404) {
      return res.status(404).render('404', {
        title: 'Page Not Found',
        message: err.message,
        user: req.user || null,
        csrfToken: res.locals['csrfToken'] || '',
        requestId,
      });
    }

    if (err.statusCode === 403) {
      return res.status(403).render('403', {
        title: 'Access Denied',
        message: err.message,
        user: req.user || null,
        csrfToken: res.locals['csrfToken'] || '',
        requestId,
      });
    }

    return res.status(err.statusCode).render('error', {
      title: 'Error',
      message: err.message,
      errorCode: err.errorCode,
      user: req.user || null,
      csrfToken: res.locals['csrfToken'] || '',
      requestId,
    });
  }

  // ✅ Enhanced unhandled error logging
  const userId = (req as any).user?.userId || (req as any).user?.id || null;
  
  logger.error('Unhandled error in request handler', {
    name: err.name,
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    userId,
    requestId,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    body: isProd ? undefined : req.body, // Only in dev
    query: isProd ? undefined : req.query, // Only in dev
  });

  // ✅ Event logging for unhandled errors
  try {
    const meta = {
      path: req.path,
      method: req.method,
      message: err.message,
      name: err.name,
      requestId,
    };

    if (userId) {
      EventLogger.logUserEvent(userId, EVENT_TYPES.ERROR, meta).catch(() => {});
    } else {
      EventLogger.logSystemEvent(EVENT_TYPES.ERROR, meta).catch(() => {});
    }
  } catch {
    // ignore event logging failures
  }

  if (isApiRequest) {
    // ✅ SECURITY: Remove requestId from JSON body, add to header only
    if (requestId) {
      res.setHeader('X-Request-Id', requestId);
    }
    res.status(500).json({
      error: 'Internal server error',
      errorCode: ErrorCodes.INTERNAL_ERROR,
    });
    return;
  }

  return res.status(500).render('error', {
    title: 'Error',
    message: 'An unexpected error occurred',
    errorCode: ErrorCodes.INTERNAL_ERROR,
    user: req.user || null,
    csrfToken: res.locals['csrfToken'] || '',
    requestId,
  });
};