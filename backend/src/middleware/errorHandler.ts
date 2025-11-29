import { Request, Response, NextFunction } from 'express';
import { AppError, ErrorCodes } from '../utils/errors';
import { logger } from '../config/logger';
import { EventLogger } from '../services/eventLogger';
import { EVENT_TYPES } from '../config/constants';

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
  const isApiRequest = req.path.startsWith('/api/') || req.accepts('json');
  const requestId = (req as any).requestId || null;

  if (err instanceof AppError) {
    logger.warn(`AppError: ${err.errorCode} - ${err.message}`, {
      statusCode: err.statusCode,
      path: req.path,
      method: req.method,
      requestId,
    });

    // ✅ NEW: Log API error into Event table for admin analytics
    try {
      const userId =
        (req as any).user?.userId ||
        (req as any).user?.id ||
        null;

      const meta = {
        path: req.path,
        method: req.method,
        statusCode: err.statusCode,
        errorCode: err.errorCode,
        requestId,
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
      return res.status(err.statusCode).json({
        error: err.message,
        errorCode: err.errorCode,
        requestId,
      });
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

  // Unhandled errors
  logger.error('Unhandled error:', {
    message: err.message,
    stack: err.stack,
    name: err.name,
    path: req.path,
    method: req.method,
    requestId,
  });

  try {
    const userId =
      (req as any).user?.userId ||
      (req as any).user?.id ||
      null;

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
    return res.status(500).json({
      error: 'Internal server error',
      errorCode: ErrorCodes.INTERNAL_ERROR,
      requestId,
    });
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