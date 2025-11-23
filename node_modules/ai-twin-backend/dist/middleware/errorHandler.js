"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandlerMiddleware = exports.asyncHandler = void 0;
const errors_1 = require("../utils/errors");
const logger_1 = require("../config/logger");
const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};
exports.asyncHandler = asyncHandler;
const errorHandlerMiddleware = (err, req, res, next) => {
    const isApiRequest = req.path.startsWith('/api/') || req.accepts('json');
    if (err instanceof errors_1.AppError) {
        logger_1.logger.warn(`AppError: ${err.errorCode} - ${err.message}`, {
            statusCode: err.statusCode,
            path: req.path,
        });
        if (isApiRequest) {
            return res.status(err.statusCode).json({
                error: err.message,
                errorCode: err.errorCode,
            });
        }
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
        return res.status(err.statusCode).render('error', {
            title: 'Error',
            message: err.message,
            errorCode: err.errorCode,
            user: req.user || null,
            csrfToken: res.locals['csrfToken'] || ''
        });
    }
    logger_1.logger.error('Unhandled error:', {
        message: err.message,
        stack: err.stack,
        name: err.name,
        path: req.path,
        method: req.method
    });
    if (isApiRequest) {
        return res.status(500).json({
            error: 'Internal server error',
            errorCode: errors_1.ErrorCodes.INTERNAL_ERROR,
        });
    }
    return res.status(500).render('error', {
        title: 'Error',
        message: 'An unexpected error occurred',
        errorCode: errors_1.ErrorCodes.INTERNAL_ERROR,
        user: req.user || null,
        csrfToken: res.locals['csrfToken'] || ''
    });
};
exports.errorHandlerMiddleware = errorHandlerMiddleware;
//# sourceMappingURL=errorHandler.js.map