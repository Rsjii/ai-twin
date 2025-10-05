"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.twinCreationRateLimit = exports.otpRateLimit = exports.draftRateLimit = void 0;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
exports.draftRateLimit = (0, express_rate_limit_1.default)({
    windowMs: 30 * 1000,
    max: 1,
    keyGenerator: (req) => {
        return req.session?.userId || req.ip;
    },
    message: 'You can only generate one draft every 30 seconds. Please wait.',
    standardHeaders: true,
    legacyHeaders: false,
});
exports.otpRateLimit = (0, express_rate_limit_1.default)({
    windowMs: 5 * 60 * 1000,
    max: 50,
    message: 'Too many OTP requests. Please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});
exports.twinCreationRateLimit = (0, express_rate_limit_1.default)({
    windowMs: 60 * 60 * 1000,
    max: 2,
    keyGenerator: (req) => {
        return req.session?.userId || req.ip;
    },
    message: 'You can only create 2 twins per hour. Please wait.',
    standardHeaders: true,
    legacyHeaders: false,
});
//# sourceMappingURL=rateLimit.js.map