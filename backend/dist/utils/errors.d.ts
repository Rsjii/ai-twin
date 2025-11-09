import { Request, Response, NextFunction } from 'express';
export declare class AppError extends Error {
    statusCode: number;
    message: string;
    errorCode?: string | undefined;
    details?: any | undefined;
    constructor(statusCode: number, message: string, errorCode?: string | undefined, details?: any | undefined);
}
export declare const ErrorCodes: {
    readonly VALIDATION_ERROR: "VALIDATION_ERROR";
    readonly INVALID_INPUT: "INVALID_INPUT";
    readonly MISSING_REQUIRED_FIELD: "MISSING_REQUIRED_FIELD";
    readonly UNAUTHORIZED: "UNAUTHORIZED";
    readonly AUTHENTICATION_REQUIRED: "AUTHENTICATION_REQUIRED";
    readonly INVALID_TOKEN: "INVALID_TOKEN";
    readonly FORBIDDEN: "FORBIDDEN";
    readonly INSUFFICIENT_PERMISSIONS: "INSUFFICIENT_PERMISSIONS";
    readonly NOT_FOUND: "NOT_FOUND";
    readonly RESOURCE_NOT_FOUND: "RESOURCE_NOT_FOUND";
    readonly CHAT_NOT_FOUND: "CHAT_NOT_FOUND";
    readonly TWIN_NOT_FOUND: "TWIN_NOT_FOUND";
    readonly USER_NOT_FOUND: "USER_NOT_FOUND";
    readonly CONFLICT: "CONFLICT";
    readonly DUPLICATE_RESOURCE: "DUPLICATE_RESOURCE";
    readonly RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED";
    readonly INTERNAL_ERROR: "INTERNAL_ERROR";
    readonly DATABASE_ERROR: "DATABASE_ERROR";
    readonly EXTERNAL_API_ERROR: "EXTERNAL_API_ERROR";
};
export declare const createError: {
    validation: (message: string, details?: any) => AppError;
    unauthorized: (message?: string) => AppError;
    forbidden: (message?: string) => AppError;
    notFound: (message?: string, errorCode?: string) => AppError;
    conflict: (message: string, details?: any) => AppError;
    rateLimit: (message?: string) => AppError;
    internal: (message?: string, details?: any) => AppError;
};
export declare const errorHandler: (err: Error, req: Request, res: Response, next: NextFunction) => void;
//# sourceMappingURL=errors.d.ts.map