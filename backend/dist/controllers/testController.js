"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.testProfile = exports.basicTest = exports.testOTP = exports.testAuth = exports.testDatabase = exports.testSession = exports.testRoute = void 0;
const database_1 = require("../config/database");
const logger_1 = require("../config/logger");
const errors_1 = require("../utils/errors");
const errorHandler_1 = require("../utils/errorHandler");
const testRoute = (_req, res) => {
    res.json({ message: 'Server is working!', timestamp: new Date().toISOString() });
};
exports.testRoute = testRoute;
const testSession = (req, res) => {
    res.json({
        session: req.session,
        userId: req.session?.userId,
        userEmail: req.session?.userEmail,
        testValue: req.session?.testValue
    });
};
exports.testSession = testSession;
const testDatabase = async (_req, res) => {
    try {
        const result = await database_1.db.query('SELECT COUNT(*) as count FROM "User"');
        res.json({ message: 'Database working!', userCount: result?.rows[0]?.count });
    }
    catch (error) {
        logger_1.logger.error('Test database error:', {
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        (0, errorHandler_1.handleErrorWithResponse)(error, res, 'Database error');
    }
};
exports.testDatabase = testDatabase;
const testAuth = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            throw errors_1.createError.validation('Email required');
        }
        const { userQueries } = await Promise.resolve().then(() => __importStar(require('../config/database')));
        const user = await userQueries.findByEmail(email);
        return res.json({ message: 'Auth working!', userExists: !!user });
    }
    catch (error) {
        logger_1.logger.error('Test auth error:', {
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        (0, errorHandler_1.handleErrorWithResponse)(error, res, 'Auth error');
    }
};
exports.testAuth = testAuth;
const testOTP = async (req, res) => {
    try {
        const { email, code } = req.body;
        if (code) {
            if (!email) {
                throw errors_1.createError.validation('Email required for verification');
            }
            const { verifyOTP } = await Promise.resolve().then(() => __importStar(require('../modules/auth/authService.js')));
            const { otpQueries } = await Promise.resolve().then(() => __importStar(require('../config/database.js')));
            const storedOTP = await otpQueries.findByEmail(email.toLowerCase());
            if (!storedOTP) {
                throw errors_1.createError.notFound('No OTP found for this email');
            }
            if (new Date() > storedOTP.expires_at) {
                throw errors_1.createError.validation('OTP has expired');
            }
            if (storedOTP.used) {
                throw errors_1.createError.validation('OTP has already been used');
            }
            const isValid = await verifyOTP(code, storedOTP.codeHash);
            if (!isValid) {
                throw errors_1.createError.validation('Invalid OTP code');
            }
            req.session.userId = 'test-user-id';
            req.session.userEmail = email.toLowerCase();
            req.session.userHandle = email.split('@')[0];
            await otpQueries.markAsUsed(storedOTP.id);
            logger_1.logger.info('OTP verified (test)', { email });
            return res.json({
                message: 'OTP verification successful!',
                email: email,
                userId: 'test-user-id'
            });
        }
        if (!email) {
            throw errors_1.createError.validation('Email required');
        }
        const { generateOTP, hashOTP } = await Promise.resolve().then(() => __importStar(require('../modules/auth/authService.js')));
        const otp = generateOTP(6);
        const hashedOTP = await hashOTP(otp);
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
        const { otpQueries } = await Promise.resolve().then(() => __importStar(require('../config/database.js')));
        await otpQueries.create(email.toLowerCase(), hashedOTP, expiresAt);
        logger_1.logger.info('OTP generated (test)', { email });
        return res.json({
            message: 'OTP generated successfully!',
            otp: otp,
            email: email
        });
    }
    catch (error) {
        logger_1.logger.error('Test OTP error:', {
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        (0, errorHandler_1.handleErrorWithResponse)(error, res, 'OTP operation error');
    }
};
exports.testOTP = testOTP;
const basicTest = (_req, res) => {
    res.send('<h1>Hello World!</h1><p>Server is working!</p>');
};
exports.basicTest = basicTest;
const testProfile = async (req, res) => {
    if (!req.user) {
        return res.redirect('/auth');
    }
    try {
        const { userQueries } = await Promise.resolve().then(() => __importStar(require('../config/database')));
        const user = await userQueries.findByEmail(req.user.email);
        if (!user) {
            return res.redirect('/auth');
        }
        res.json({
            success: true,
            user: user,
            csrfToken: res.locals['csrfToken']
        });
    }
    catch (error) {
        logger_1.logger.error('Test profile error:', {
            error: error instanceof Error ? error.message : 'Unknown error',
            userId: req.user?.id
        });
        (0, errorHandler_1.handleErrorWithResponse)(error, res, 'Internal server error');
    }
};
exports.testProfile = testProfile;
//# sourceMappingURL=testController.js.map