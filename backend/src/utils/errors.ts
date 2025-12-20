import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { logger } from '../config/logger';
import { isDev } from '../config/env';

/**
 * Custom Application Error Class
 * Provides structured error responses with status codes and error codes
 */
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public errorCode?: string,
    public details?: any
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Common error codes for consistent error handling
 */
export const ErrorCodes = {
  // Validation errors (400)
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  
  // Authentication errors (401)
  UNAUTHORIZED: 'UNAUTHORIZED',
  AUTHENTICATION_REQUIRED: 'AUTHENTICATION_REQUIRED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  
  // Authorization errors (403)
  FORBIDDEN: 'FORBIDDEN',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  
  // Not found errors (404)
  NOT_FOUND: 'NOT_FOUND',
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  CHAT_NOT_FOUND: 'CHAT_NOT_FOUND',
  TWIN_NOT_FOUND: 'TWIN_NOT_FOUND',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  
  // Conflict errors (409)
  CONFLICT: 'CONFLICT',
  DUPLICATE_RESOURCE: 'DUPLICATE_RESOURCE',
  
  // Rate limiting (429)
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  
  // Internal server errors (500)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  EXTERNAL_API_ERROR: 'EXTERNAL_API_ERROR',
} as const;

/**
 * Helper function to create common errors
 */
export const createError = {
  validation: (message: string, details?: any) => 
    new AppError(400, message, ErrorCodes.VALIDATION_ERROR, details),
  
  unauthorized: (message: string = 'Authentication required', errorCode?: string) => 
    new AppError(401, message, errorCode || ErrorCodes.UNAUTHORIZED),
  
  forbidden: (message: string = 'Access denied', errorCode?: string) => 
    new AppError(403, message, errorCode || ErrorCodes.FORBIDDEN),
  
  notFound: (message: string = 'Resource not found', errorCode?: string) => 
    new AppError(404, message, errorCode || ErrorCodes.NOT_FOUND),
  
  conflict: (message: string, details?: any) => 
    new AppError(409, message, ErrorCodes.CONFLICT, details),
  
  rateLimit: (message: string = 'Too many requests') => 
    new AppError(429, message, ErrorCodes.RATE_LIMIT_EXCEEDED),
  
  internal: (message: string = 'Internal server error', details?: any) => 
    new AppError(500, message, ErrorCodes.INTERNAL_ERROR, details),
};

/**
 * Global error handler middleware
 * Must be added AFTER all routes in app.ts
 */
export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Handle AppError (custom application errors)
  if (err instanceof AppError) {
    logger.warn(`AppError: ${err.errorCode} - ${err.message}`, {
      statusCode: err.statusCode,
      errorCode: err.errorCode,
      path: req.path,
      method: req.method,
      ...(err.details && { details: err.details }),
    });
    
    res.status(err.statusCode).json({
      error: err.message,
      errorCode: err.errorCode,
      // ✅ Details removed from user response - already logged in line 104
    });
    return;
  }

  // Handle Zod validation errors
  if (err instanceof z.ZodError) {
    logger.warn('Validation error:', {
      path: req.path,
      method: req.method,
      errors: err.errors,
    });
    
    res.status(400).json({
      error: 'Validation failed',
      errorCode: ErrorCodes.VALIDATION_ERROR,
      details: err.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    });
    return;
  }

  // Handle unhandled errors (500)
  logger.error('Unhandled error:', {
    error: err,
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  // Don't expose internal error details in production
  const isDevelopment = isDev;
  
  res.status(500).json({
    error: 'Internal server error',
    errorCode: ErrorCodes.INTERNAL_ERROR,
    ...(isDevelopment && { 
      details: err.message,
      stack: err.stack,
    }),
  });
};

