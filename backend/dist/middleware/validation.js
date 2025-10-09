"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeInput = exports.validate = exports.handleSchema = exports.messageSchema = exports.samplesSchema = exports.otpCodeSchema = exports.emailSchema = void 0;
const zod_1 = require("zod");
exports.emailSchema = zod_1.z.string().email('Invalid email format');
exports.otpCodeSchema = zod_1.z.string().length(6, 'OTP must be 6 digits').regex(/^\d{6}$/, 'OTP must contain only numbers');
exports.samplesSchema = zod_1.z.string().min(100, 'At least 100 characters required').max(3000, 'Maximum 3000 characters allowed');
exports.messageSchema = zod_1.z.string().min(1, 'Message cannot be empty').max(300, 'Message too long (max 300 characters)');
exports.handleSchema = zod_1.z.string().min(3, 'Handle must be at least 3 characters').max(20, 'Handle too long').regex(/^[a-zA-Z0-9_-]+$/, 'Handle can only contain letters, numbers, hyphens, and underscores');
const validate = (schema, field = 'body') => {
    return (req, res, next) => {
        try {
            const data = field === 'body' ? req.body : req.params;
            schema.parse(data[field === 'body' ? Object.keys(data)[0] : field]);
            next();
        }
        catch (error) {
            if (error instanceof zod_1.z.ZodError) {
                return res.status(400).json({
                    error: 'Validation failed',
                    details: error.errors.map(err => ({
                        field: err.path.join('.'),
                        message: err.message
                    }))
                });
            }
            next(error);
        }
    };
};
exports.validate = validate;
const sanitizeInput = (req, res, next) => {
    const sanitize = (obj) => {
        if (typeof obj === 'string') {
            return obj.trim().replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
        }
        if (Array.isArray(obj)) {
            return obj.map(item => sanitize(item));
        }
        if (typeof obj === 'object' && obj !== null) {
            const sanitized = {};
            for (const key in obj) {
                sanitized[key] = sanitize(obj[key]);
            }
            return sanitized;
        }
        return obj;
    };
    req.body = sanitize(req.body);
    req.query = sanitize(req.query);
    req.params = sanitize(req.params);
    next();
};
exports.sanitizeInput = sanitizeInput;
//# sourceMappingURL=validation.js.map