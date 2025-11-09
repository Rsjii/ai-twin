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
exports.logout = exports.changePassword = exports.loginVerify = exports.login = exports.resetPassword = exports.forgotPasswordVerify = exports.forgotPassword = exports.completeProfile = exports.signupVerify = exports.signup = void 0;
const database_1 = require("../../config/database");
const authService_1 = require("./authService");
const logger_1 = require("../../config/logger");
const env_1 = require("../../config/env");
const zod_1 = require("zod");
const jwtService_1 = require("../../services/jwtService");
const errors_1 = require("../../utils/errors");
const emailService = new authService_1.EmailService();
const signupSchema = zod_1.z.object({
    email: zod_1.z.string().email('Invalid email format'),
    password: zod_1.z.string().min(6, 'Password must be at least 6 characters'),
    referralCode: zod_1.z.string().optional(),
});
const signupVerifySchema = zod_1.z.object({
    email: zod_1.z.string().email('Invalid email format'),
    code: zod_1.z.string().length(6, 'OTP must be 6 digits').regex(/^\d{6}$/, 'OTP must contain only numbers'),
});
const completeProfileSchema = zod_1.z.object({
    email: zod_1.z.string().email('Invalid email format'),
    name: zod_1.z.string().min(2, 'Name must be at least 2 characters'),
    handle: zod_1.z.string().min(3, 'Handle must be at least 3 characters').optional(),
    dob: zod_1.z.string().optional(),
    phone: zod_1.z.string().optional(),
    bio: zod_1.z.string().optional(),
    profileImage: zod_1.z.string().nullable().optional(),
});
const forgotPasswordSchema = zod_1.z.object({
    email: zod_1.z.string().email('Invalid email format'),
});
const resetPasswordSchema = zod_1.z.object({
    email: zod_1.z.string().email('Invalid email format'),
    code: zod_1.z.string().length(6, 'OTP must be 6 digits').regex(/^\d{6}$/, 'OTP must contain only numbers'),
    password: zod_1.z.string().min(6, 'Password must be at least 6 characters'),
});
const signup = async (req, res, next) => {
    try {
        logger_1.logger.info('=== SIGNUP REQUEST ===');
        logger_1.logger.info('Request body:', JSON.stringify(req.body));
        logger_1.logger.info('Request method:', req.method);
        logger_1.logger.info('Request path:', req.path);
        const { email, password, referralCode } = signupSchema.parse(req.body);
        logger_1.logger.info(`Attempting signup for email: ${email}`);
        const existingUser = await database_1.userQueries.findByEmail(email.toLowerCase());
        if (existingUser) {
            logger_1.logger.warn(`Signup failed: User already exists - ${email}`);
            return res.status(409).json({
                error: 'User already exists. Please login instead.',
                errorCode: 'USER_ALREADY_EXISTS'
            });
        }
        logger_1.logger.info(`User does not exist, creating new user: ${email}`);
        const passwordHash = await (0, authService_1.hashPassword)(password);
        const userReferralCode = (0, authService_1.generateInviteCode)();
        let referrerId = null;
        if (referralCode) {
            const referrer = await database_1.userQueries.findByReferralCode(referralCode);
            if (referrer) {
                referrerId = referrer.id;
            }
        }
        const user = await database_1.userQueries.create(email.toLowerCase(), undefined, passwordHash, userReferralCode);
        logger_1.logger.info(`User created successfully: ${user.id}`);
        if (referrerId) {
            const { db, generateId } = await Promise.resolve().then(() => __importStar(require('../../config/database')));
            const inviteId = generateId();
            await db.query('INSERT INTO "Invite" (id, code, "inviterId", "acceptedBy") VALUES ($1, $2, $3, $4)', [inviteId, referralCode, referrerId, user.id]);
            const eventId = generateId();
            await db.query('INSERT INTO "Event" (id, "userId", type, meta) VALUES ($1, $2, $3, $4)', [eventId, referrerId, 'invite_accepted', JSON.stringify({ referredUserId: user.id })]);
        }
        const otp = (0, authService_1.generateOTP)(env_1.config.otp.codeLength);
        const hashedOTP = await (0, authService_1.hashOTP)(otp);
        const expiresAt = new Date(Date.now() + env_1.config.otp.expiryMinutes * 60 * 1000);
        await database_1.otpQueries.create(email.toLowerCase(), hashedOTP, expiresAt);
        logger_1.logger.info(`OTP created for ${email}`);
        const emailSent = await emailService.sendOTP(email, otp);
        if (!emailSent) {
            logger_1.logger.warn(`Email send failed for ${email}, but continuing signup. OTP is in response.`);
        }
        else {
            logger_1.logger.info(`Email sent successfully to ${email}`);
        }
        logger_1.logger.info(`Signup successful for ${email}, OTP sent`);
        res.json({
            message: 'OTP sent',
            otp: otp,
            redirect: '/signup/verify?email=' + encodeURIComponent(email)
        });
    }
    catch (error) {
        logger_1.logger.error('Signup error:', error);
        if (error instanceof errors_1.AppError) {
            return res.status(error.statusCode).json({
                error: error.message,
                errorCode: error.errorCode
            });
        }
        return res.status(500).json({
            error: 'Failed to signup. Please try again.',
            errorCode: 'INTERNAL_ERROR'
        });
    }
};
exports.signup = signup;
const signupVerify = async (req, res, next) => {
    try {
        const { email, code } = signupVerifySchema.parse(req.body);
        const otpRecord = await database_1.otpQueries.findByEmail(email.toLowerCase());
        if (!otpRecord) {
            return res.status(400).json({
                error: 'Invalid or expired OTP',
                errorCode: 'INVALID_OTP'
            });
        }
        const isValid = await (0, authService_1.verifyOTP)(code, otpRecord.codeHash);
        if (!isValid) {
            return res.status(400).json({
                error: 'Invalid OTP code',
                errorCode: 'INVALID_OTP'
            });
        }
        await database_1.otpQueries.markAsUsed(otpRecord.id);
        await database_1.userQueries.activateUser(email.toLowerCase());
        res.json({
            message: 'Account activated successfully',
            redirect: '/signup/profile?email=' + encodeURIComponent(email)
        });
    }
    catch (error) {
        logger_1.logger.error('Signup verify error:', error);
        if (error instanceof errors_1.AppError) {
            return res.status(error.statusCode).json({
                error: error.message,
                errorCode: error.errorCode
            });
        }
        return res.status(500).json({
            error: 'Failed to verify signup. Please try again.',
            errorCode: 'INTERNAL_ERROR'
        });
    }
};
exports.signupVerify = signupVerify;
const completeProfile = async (req, res, next) => {
    try {
        const { email, name, handle, dob, phone, bio, profileImage } = completeProfileSchema.parse(req.body);
        await database_1.userQueries.updateProfile(email.toLowerCase(), name, handle || '', dob || '', phone || '', bio || '', profileImage || null);
        const user = await database_1.userQueries.findByEmail(email.toLowerCase());
        const token = (0, jwtService_1.generateJWT)({
            userId: user.id,
            email: user.email,
            handle: user.handle || ''
        });
        res.cookie('jwtToken', token, {
            httpOnly: true,
            secure: process.env['NODE_ENV'] === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });
        res.json({
            message: 'Profile completed successfully',
            redirect: '/dashboard',
            token: token,
            user: {
                id: user.id,
                email: user.email,
                handle: user.handle,
                name: user.name
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Complete profile error:', error);
        if (error instanceof errors_1.AppError) {
            return res.status(error.statusCode).json({
                error: error.message,
                errorCode: error.errorCode
            });
        }
        return res.status(500).json({
            error: 'Failed to complete profile. Please try again.',
            errorCode: 'INTERNAL_ERROR'
        });
    }
};
exports.completeProfile = completeProfile;
const forgotPassword = async (req, res, next) => {
    try {
        const { email } = forgotPasswordSchema.parse(req.body);
        const user = await database_1.userQueries.findByEmail(email.toLowerCase());
        if (!user) {
            return res.status(404).json({
                error: 'User not found',
                errorCode: 'USER_NOT_FOUND'
            });
        }
        const otp = (0, authService_1.generateOTP)(env_1.config.otp.codeLength);
        const hashedOTP = await (0, authService_1.hashOTP)(otp);
        const expiresAt = new Date(Date.now() + env_1.config.otp.expiryMinutes * 60 * 1000);
        await database_1.otpQueries.create(email.toLowerCase(), hashedOTP, expiresAt);
        const emailSent = await emailService.sendOTP(email, otp);
        if (!emailSent) {
            logger_1.logger.warn(`Email send failed for ${email}, but continuing. OTP is in response.`);
        }
        res.json({
            message: 'OTP sent for password reset',
            otp: otp,
            redirect: '/forgot-password/reset?email=' + encodeURIComponent(email)
        });
    }
    catch (error) {
        logger_1.logger.error('Forgot password error:', error);
        if (error instanceof errors_1.AppError) {
            return res.status(error.statusCode).json({
                error: error.message,
                errorCode: error.errorCode
            });
        }
        return res.status(500).json({
            error: 'Failed to process forgot password. Please try again.',
            errorCode: 'INTERNAL_ERROR'
        });
    }
};
exports.forgotPassword = forgotPassword;
const forgotPasswordVerify = async (req, res, next) => {
    try {
        const { email, code } = signupVerifySchema.parse(req.body);
        const otpRecord = await database_1.otpQueries.findByEmail(email.toLowerCase());
        if (!otpRecord) {
            return res.status(400).json({
                error: 'Invalid or expired OTP',
                errorCode: 'INVALID_OTP'
            });
        }
        const isValid = await (0, authService_1.verifyOTP)(code, otpRecord.codeHash);
        if (!isValid) {
            return res.status(400).json({
                error: 'Invalid OTP code',
                errorCode: 'INVALID_OTP'
            });
        }
        await database_1.otpQueries.markAsUsed(otpRecord.id);
        res.json({
            message: 'OTP verified successfully',
            redirect: '/reset-password?email=' + encodeURIComponent(email)
        });
    }
    catch (error) {
        logger_1.logger.error('Forgot password verify error:', error);
        if (error instanceof errors_1.AppError) {
            return res.status(error.statusCode).json({
                error: error.message,
                errorCode: error.errorCode
            });
        }
        return res.status(500).json({
            error: 'Failed to verify forgot password. Please try again.',
            errorCode: 'INTERNAL_ERROR'
        });
    }
};
exports.forgotPasswordVerify = forgotPasswordVerify;
const resetPassword = async (req, res, next) => {
    try {
        const { email, password } = zod_1.z.object({
            email: zod_1.z.string().email('Invalid email format'),
            password: zod_1.z.string().min(6, 'Password must be at least 6 characters'),
        }).parse(req.body);
        const passwordHash = await (0, authService_1.hashPassword)(password);
        await database_1.userQueries.updatePassword(email.toLowerCase(), passwordHash);
        res.json({
            message: 'Password reset successfully',
            redirect: '/auth'
        });
    }
    catch (error) {
        logger_1.logger.error('Reset password error:', error);
        if (error instanceof errors_1.AppError) {
            return res.status(error.statusCode).json({
                error: error.message,
                errorCode: error.errorCode
            });
        }
        return res.status(500).json({
            error: 'Failed to reset password. Please try again.',
            errorCode: 'INTERNAL_ERROR'
        });
    }
};
exports.resetPassword = resetPassword;
const loginSchema = zod_1.z.object({
    email: zod_1.z.string().email('Invalid email format'),
    password: zod_1.z.string().min(6, 'Password must be at least 6 characters'),
});
const loginVerifySchema = zod_1.z.object({
    email: zod_1.z.string().email('Invalid email format'),
    code: zod_1.z.string().length(6, 'OTP must be 6 digits').regex(/^\d{6}$/, 'OTP must contain only numbers'),
});
const login = async (req, res, next) => {
    try {
        const { email, password } = loginSchema.parse(req.body);
        const user = await database_1.userQueries.findByEmail(email.toLowerCase());
        if (!user || !user.passwordHash) {
            return res.status(401).json({
                error: 'Invalid email or password',
                errorCode: 'UNAUTHORIZED'
            });
        }
        if (!user.active) {
            return res.status(403).json({
                error: 'Account not activated. Please check your email for activation link.',
                errorCode: 'ACCOUNT_NOT_ACTIVATED'
            });
        }
        const isValidPassword = await (0, authService_1.verifyPassword)(password, user.passwordHash);
        if (!isValidPassword) {
            return res.status(401).json({
                error: 'Invalid email or password',
                errorCode: 'UNAUTHORIZED'
            });
        }
        const token = (0, jwtService_1.generateJWT)({
            userId: user.id,
            email: user.email,
            handle: user.handle || ''
        });
        res.cookie('jwtToken', token, {
            httpOnly: true,
            secure: process.env['NODE_ENV'] === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });
        res.json({
            message: 'Login successful',
            redirect: '/dashboard',
            token: token,
            user: {
                id: user.id,
                email: user.email,
                handle: user.handle,
                name: user.name
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Login error:', error);
        if (error instanceof errors_1.AppError) {
            return res.status(error.statusCode).json({
                error: error.message,
                errorCode: error.errorCode
            });
        }
        return res.status(500).json({
            error: 'Failed to login. Please try again.',
            errorCode: 'INTERNAL_ERROR'
        });
    }
};
exports.login = login;
const loginVerify = async (req, res, next) => {
    try {
        const { email, code } = loginVerifySchema.parse(req.body);
        const otpRecord = await database_1.otpQueries.findByEmail(email.toLowerCase());
        if (!otpRecord) {
            return res.status(400).json({
                error: 'Invalid or expired OTP',
                errorCode: 'INVALID_OTP'
            });
        }
        const isValid = await (0, authService_1.verifyOTP)(code, otpRecord.codeHash);
        if (!isValid) {
            return res.status(400).json({
                error: 'Invalid OTP code',
                errorCode: 'INVALID_OTP'
            });
        }
        await database_1.otpQueries.markAsUsed(otpRecord.id);
        let user = await database_1.userQueries.findByEmail(email.toLowerCase());
        if (!user) {
            user = await database_1.userQueries.create(email.toLowerCase());
        }
        const token = (0, jwtService_1.generateJWT)({
            userId: user.id,
            email: user.email,
            handle: user.handle || ''
        });
        res.cookie('jwtToken', token, {
            httpOnly: true,
            secure: process.env['NODE_ENV'] === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });
        req.session.userId = user.id;
        req.session.userEmail = user.email;
        req.session.userHandle = user.handle;
        res.json({
            message: 'Login successful',
            redirect: '/dashboard',
            token: token,
            user: {
                id: user.id,
                email: user.email,
                handle: user.handle,
                name: user.name
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Login verify error:', error);
        if (error instanceof errors_1.AppError) {
            return res.status(error.statusCode).json({
                error: error.message,
                errorCode: error.errorCode
            });
        }
        return res.status(500).json({
            error: 'Failed to verify login. Please try again.',
            errorCode: 'INTERNAL_ERROR'
        });
    }
};
exports.loginVerify = loginVerify;
const changePasswordSchema = zod_1.z.object({
    currentPassword: zod_1.z.string().min(6, 'Current password must be at least 6 characters'),
    newPassword: zod_1.z.string().min(6, 'New password must be at least 6 characters'),
});
const changePassword = async (req, res, next) => {
    try {
        const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
        if (!req.user) {
            throw errors_1.createError.unauthorized();
        }
        const user = await database_1.userQueries.findByEmail(req.user.email);
        if (!user || !user.passwordHash) {
            throw errors_1.createError.notFound('User not found or no password set', errors_1.ErrorCodes.USER_NOT_FOUND);
        }
        const isValidPassword = await (0, authService_1.verifyPassword)(currentPassword, user.passwordHash);
        if (!isValidPassword) {
            throw errors_1.createError.validation('Current password is incorrect');
        }
        const passwordHash = await (0, authService_1.hashPassword)(newPassword);
        await database_1.userQueries.updatePassword(user.email, passwordHash);
        res.json({ message: 'Password changed successfully' });
    }
    catch (error) {
        if (error instanceof errors_1.AppError) {
            throw error;
        }
        throw errors_1.createError.internal('Failed to change password', error);
    }
};
exports.changePassword = changePassword;
const logout = (req, res, next) => {
    try {
        res.clearCookie('jwtToken');
        if (req.session) {
            req.session.destroy((err) => {
                if (err) {
                    logger_1.logger.error('Session destruction error:', err);
                }
            });
        }
        res.json({ message: 'Logged out successfully', redirect: '/auth' });
    }
    catch (error) {
        if (error instanceof errors_1.AppError) {
            throw error;
        }
        throw errors_1.createError.internal('Failed to logout', error);
    }
};
exports.logout = logout;
//# sourceMappingURL=authController.js.map