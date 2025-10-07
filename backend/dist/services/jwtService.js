"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractTokenFromHeader = exports.verifyJWT = exports.generateJWT = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const logger_1 = require("../config/logger");
const JWT_SECRET = process.env['JWT_SECRET'] || 'your-super-secret-jwt-key-change-in-production';
const JWT_EXPIRES_IN = '7d';
const generateJWT = (payload) => {
    try {
        const jwtPayload = {
            ...payload,
            id: payload.userId,
        };
        const token = jsonwebtoken_1.default.sign(jwtPayload, JWT_SECRET, {
            expiresIn: JWT_EXPIRES_IN,
            issuer: 'ai-twin-app'
        });
        logger_1.logger.info(`JWT generated for user: ${payload.email}`);
        return token;
    }
    catch (error) {
        logger_1.logger.error('JWT generation error:', error);
        throw new Error('Failed to generate JWT token');
    }
};
exports.generateJWT = generateJWT;
const verifyJWT = (token) => {
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        logger_1.logger.info(`JWT verified for user: ${decoded.email}`);
        return decoded;
    }
    catch (error) {
        logger_1.logger.error('JWT verification error:', error);
        throw new Error('Invalid or expired JWT token');
    }
};
exports.verifyJWT = verifyJWT;
const extractTokenFromHeader = (authHeader) => {
    if (!authHeader)
        return null;
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
        return null;
    }
    return parts[1];
};
exports.extractTokenFromHeader = extractTokenFromHeader;
//# sourceMappingURL=jwtService.js.map