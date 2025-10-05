"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireJWTFromCookie = exports.extractJWTFromCookie = void 0;
const jwtService_1 = require("../services/jwtService");
const logger_1 = require("../config/logger");
const extractJWTFromCookie = (req, res, next) => {
    try {
        const tokenFromCookie = req.cookies?.jwtToken;
        if (tokenFromCookie) {
            try {
                const decoded = (0, jwtService_1.verifyJWT)(tokenFromCookie);
                req.user = decoded;
                logger_1.logger.info(`JWT extracted from cookie for user: ${decoded.email}`);
                return next();
            }
            catch (error) {
                logger_1.logger.warn('Invalid JWT token in cookie:', error);
                res.clearCookie('jwtToken');
            }
        }
        next();
    }
    catch (error) {
        logger_1.logger.error('JWT cookie extraction error:', error);
        next();
    }
};
exports.extractJWTFromCookie = extractJWTFromCookie;
const requireJWTFromCookie = (req, res, next) => {
    try {
        const tokenFromCookie = req.cookies?.jwtToken;
        if (!tokenFromCookie) {
            logger_1.logger.warn('No JWT token found in cookie');
            return res.redirect('/auth');
        }
        try {
            const decoded = (0, jwtService_1.verifyJWT)(tokenFromCookie);
            req.user = decoded;
            logger_1.logger.info(`JWT verified from cookie for user: ${decoded.email}`);
            next();
        }
        catch (error) {
            logger_1.logger.warn('Invalid JWT token in cookie:', error);
            res.clearCookie('jwtToken');
            return res.redirect('/auth');
        }
    }
    catch (error) {
        logger_1.logger.error('JWT cookie verification error:', error);
        return res.redirect('/auth');
    }
};
exports.requireJWTFromCookie = requireJWTFromCookie;
//# sourceMappingURL=jwtCookie.js.map