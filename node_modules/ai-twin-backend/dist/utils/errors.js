"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = exports.createError = exports.ErrorCodes = exports.AppError = void 0;
const zod_1 = require("zod");
const logger_1 = require("../config/logger");
class AppError extends Error {
    statusCode;
    message;
    errorCode;
    details;
    constructor(statusCode, message, errorCode, details) {
        super(message);
        this.statusCode = statusCode;
        this.message = message;
        this.errorCode = errorCode;
        this.details = details;
        this.name = 'AppError';
        Error.captureStackTrace(this, this.constructor);
    }
}
exports.AppError = AppError;
exports.ErrorCodes = {
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    INVALID_INPUT: 'INVALID_INPUT',
    MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
    UNAUTHORIZED: 'UNAUTHORIZED',
    AUTHENTICATION_REQUIRED: 'AUTHENTICATION_REQUIRED',
    INVALID_TOKEN: 'INVALID_TOKEN',
    FORBIDDEN: 'FORBIDDEN',
    INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
    NOT_FOUND: 'NOT_FOUND',
    RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
    CHAT_NOT_FOUND: 'CHAT_NOT_FOUND',
    TWIN_NOT_FOUND: 'TWIN_NOT_FOUND',
    USER_NOT_FOUND: 'USER_NOT_FOUND',
    CONFLICT: 'CONFLICT',
    DUPLICATE_RESOURCE: 'DUPLICATE_RESOURCE',
    RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
    INTERNAL_ERROR: 'INTERNAL_ERROR',
    DATABASE_ERROR: 'DATABASE_ERROR',
    EXTERNAL_API_ERROR: 'EXTERNAL_API_ERROR',
};
exports.createError = {
    validation: (message, details) => new AppError(400, message, exports.ErrorCodes.VALIDATION_ERROR, details),
    unauthorized: (message = 'Authentication required') => new AppError(401, message, exports.ErrorCodes.UNAUTHORIZED),
    forbidden: (message = 'Access denied') => new AppError(403, message, exports.ErrorCodes.FORBIDDEN),
    notFound: (message = 'Resource not found', errorCode) => new AppError(404, message, errorCode || exports.ErrorCodes.NOT_FOUND),
    conflict: (message, details) => new AppError(409, message, exports.ErrorCodes.CONFLICT, details),
    rateLimit: (message = 'Too many requests') => new AppError(429, message, exports.ErrorCodes.RATE_LIMIT_EXCEEDED),
    internal: (message = 'Internal server error', details) => new AppError(500, message, exports.ErrorCodes.INTERNAL_ERROR, details),
};
const errorHandler = (err, req, res, next) => {
    if (err instanceof AppError) {
        logger_1.logger.warn(`AppError: ${err.errorCode} - ${err.message}`, {
            statusCode: err.statusCode,
            errorCode: err.errorCode,
            path: req.path,
            method: req.method,
            ...(err.details && { details: err.details }),
        });
        return res.status(err.statusCode).json({
            error: err.message,
            errorCode: err.errorCode,
            ...(err.details && { details: err.details }),
        });
    }
    if (err instanceof zod_1.z.ZodError) {
        logger_1.logger.warn('Validation error:', {
            path: req.path,
            method: req.method,
            errors: err.errors,
        });
        return res.status(400).json({
            error: 'Validation failed',
            errorCode: exports.ErrorCodes.VALIDATION_ERROR,
            details: err.errors.map(e => ({
                field: e.path.join('.'),
                message: e.message,
            })),
        });
    }
    logger_1.logger.error('Unhandled error:', {
        error: err,
        message: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method,
    });
    const isDevelopment = process.env.NODE_ENV === 'development';
    res.status(500).json({
        error: 'Internal server error',
        errorCode: exports.ErrorCodes.INTERNAL_ERROR,
        ...(isDevelopment && {
            details: err.message,
            stack: err.stack,
        }),
    });
};
exports.errorHandler = errorHandler;
//# sourceMappingURL=errors.js.map