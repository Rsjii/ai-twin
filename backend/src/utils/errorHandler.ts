import { AppError, createError } from './errors';
import { Response } from 'express';

/**
 * Standard error handler wrapper - throws error
 */
export function handleControllerError(
  error: unknown,
  defaultMessage: string
): never {
  if (error instanceof AppError) {
    throw error;
  }
  throw createError.internal(defaultMessage, error);
}

/**
 * Error handler that returns JSON response instead of throwing
 * Use this for routes that return JSON responses directly
 */
export function handleErrorWithResponse(
  error: unknown,
  res: Response,
  defaultMessage: string,
  defaultErrorCode: string = 'INTERNAL_ERROR'
): void {
  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      error: error.message,
      errorCode: error.errorCode
    });
    return;
  }
  
  const appError = createError.internal(defaultMessage, error);
  res.status(appError.statusCode).json({
    error: appError.message,
    errorCode: appError.errorCode || defaultErrorCode
  });
}

/**
 * Error handler for routes that return { success: false, error, errorCode } format
 */
export function handleErrorWithSuccessFormat(
  error: unknown,
  res: Response,
  defaultMessage: string,
  defaultErrorCode: string = 'INTERNAL_ERROR'
): void {
  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      success: false,
      error: error.message,
      errorCode: error.errorCode
    });
    return;
  }
  
  const appError = createError.internal(defaultMessage, error);
  res.status(appError.statusCode).json({
    success: false,
    error: appError.message,
    errorCode: appError.errorCode || defaultErrorCode
  });
}