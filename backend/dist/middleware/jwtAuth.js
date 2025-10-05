"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.optionalJWT = exports.authenticateJWT = void 0;
const jwtService_1 = require("../services/jwtService");
const logger_1 = require("../config/logger");
const authenticateJWT = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        const token = (0, jwtService_1.extractTokenFromHeader)(authHeader);
        if (!token) {
            logger_1.logger.warn('JWT authentication failed: No token provided');
            return res.status(401).json({ error: 'Authentication required' });
        }
        const decoded = (0, jwtService_1.verifyJWT)(token);
        req.user = decoded;
        logger_1.logger.info(`JWT authentication successful for user: ${decoded.email}`);
        next();
    }
    catch (error) {
        logger_1.logger.error('JWT authentication error:', error);
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
};
exports.authenticateJWT = authenticateJWT;
const optionalJWT = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        const token = (0, jwtService_1.extractTokenFromHeader)(authHeader);
        if (token) {
            const decoded = (0, jwtService_1.verifyJWT)(token);
            req.user = decoded;
            logger_1.logger.info(`Optional JWT authentication successful for user: ${decoded.email}`);
        }
        next();
    }
    catch (error) {
        logger_1.logger.warn('Optional JWT authentication failed, continuing without user:', error);
        next();
    }
};
exports.optionalJWT = optionalJWT;
//# sourceMappingURL=jwtAuth.js.map