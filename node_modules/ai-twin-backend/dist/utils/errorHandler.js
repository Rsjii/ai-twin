"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleControllerError = handleControllerError;
exports.handleErrorWithResponse = handleErrorWithResponse;
exports.handleErrorWithSuccessFormat = handleErrorWithSuccessFormat;
const errors_1 = require("./errors");
function handleControllerError(error, defaultMessage) {
    if (error instanceof errors_1.AppError) {
        throw error;
    }
    throw errors_1.createError.internal(defaultMessage, error);
}
function handleErrorWithResponse(error, res, defaultMessage, defaultErrorCode = 'INTERNAL_ERROR') {
    if (error instanceof errors_1.AppError) {
        res.status(error.statusCode).json({
            error: error.message,
            errorCode: error.errorCode
        });
        return;
    }
    const appError = errors_1.createError.internal(defaultMessage, error);
    res.status(appError.statusCode).json({
        error: appError.message,
        errorCode: appError.errorCode || defaultErrorCode
    });
}
function handleErrorWithSuccessFormat(error, res, defaultMessage, defaultErrorCode = 'INTERNAL_ERROR') {
    if (error instanceof errors_1.AppError) {
        res.status(error.statusCode).json({
            success: false,
            error: error.message,
            errorCode: error.errorCode
        });
        return;
    }
    const appError = errors_1.createError.internal(defaultMessage, error);
    res.status(appError.statusCode).json({
        success: false,
        error: appError.message,
        errorCode: appError.errorCode || defaultErrorCode
    });
}
//# sourceMappingURL=errorHandler.js.map