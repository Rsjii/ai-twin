"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiRateLimit = exports.inviteCreationRateLimit = exports.profileLinkRateLimit = exports.otpRequestRateLimit = exports.draftGenerationRateLimit = exports.twinCreationRateLimit = exports.globalRateLimit = void 0;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
exports.globalRateLimit = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    message: {
        error: 'Too many requests from this IP, please try again later.',
        retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
});
exports.twinCreationRateLimit = (0, express_rate_limit_1.default)({
    windowMs: 60 * 60 * 1000,
    max: 10,
    keyGenerator: (req) => {
        return req.user?.userId || req.ip || 'unknown';
    },
    message: {
        error: 'Twin creation limit exceeded. You can create 2 twins per hour.',
        retryAfter: '1 hour'
    },
    standardHeaders: true,
    legacyHeaders: false,
});
exports.draftGenerationRateLimit = (0, express_rate_limit_1.default)({
    windowMs: 30 * 1000,
    max: 1,
    keyGenerator: (req) => {
        return req.user?.userId || req.ip || 'unknown';
    },
    message: {
        error: 'Please wait 30 seconds before generating another draft.',
        retryAfter: '30 seconds'
    },
    standardHeaders: true,
    legacyHeaders: false,
});
exports.otpRequestRateLimit = (0, express_rate_limit_1.default)({
    windowMs: 10 * 60 * 1000,
    max: 3,
    message: {
        error: 'Too many OTP requests. Please wait 10 minutes before trying again.',
        retryAfter: '10 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
});
exports.profileLinkRateLimit = (0, express_rate_limit_1.default)({
    windowMs: 60 * 60 * 1000,
    max: 10,
    keyGenerator: (req) => {
        return req.user?.userId || req.ip || 'unknown';
    },
    message: {
        error: 'Profile link generation limit exceeded. You can generate 10 links per hour.',
        retryAfter: '1 hour'
    },
    standardHeaders: true,
    legacyHeaders: false,
});
exports.inviteCreationRateLimit = (0, express_rate_limit_1.default)({
    windowMs: 24 * 60 * 60 * 1000,
    max: 5,
    keyGenerator: (req) => {
        return req.user?.userId || req.ip || 'unknown';
    },
    message: {
        error: 'Invite creation limit exceeded. You can create 5 invites per day.',
        retryAfter: '24 hours'
    },
    standardHeaders: true,
    legacyHeaders: false,
});
exports.apiRateLimit = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 100,
    keyGenerator: (req) => {
        return req.user?.userId || req.ip || 'unknown';
    },
    message: {
        error: 'API rate limit exceeded. Please slow down your requests.',
        retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
});
//# sourceMappingURL=rateLimit.js.map