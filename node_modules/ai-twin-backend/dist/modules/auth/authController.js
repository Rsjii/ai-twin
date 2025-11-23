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
const errorHandler_1 = require("../../utils/errorHandler");
const eventLogger_1 = require("../../services/eventLogger");
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
    handle: zod_1.z.string().min(3, 'Handle must be at least 3 characters').max(30, 'Handle must be less than 30 characters'),
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
        try {
            await (0, eventLogger_1.logEvent)(user.id, 'signup', { email: user.email });
        }
        catch (eventError) {
            logger_1.logger.warn('Failed to log signup event:', eventError);
        }
        if (referrerId) {
            const { db } = await Promise.resolve().then(() => __importStar(require('../../config/database')));
            const { generateId } = await Promise.resolve().then(() => __importStar(require('../../utils/idGenerator')));
            const inviteId = generateId.invite();
            await db.query('INSERT INTO "Invite" (id, code, "inviterId", "acceptedBy") VALUES ($1, $2, $3, $4)', [inviteId, referralCode, referrerId, user.id]);
            await (0, eventLogger_1.logEvent)(referrerId, 'invite_accepted', { referredUserId: user.id });
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
        (0, errorHandler_1.handleErrorWithResponse)(error, res, 'Failed to signup. Please try again.');
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
        (0, errorHandler_1.handleErrorWithResponse)(error, res, 'Failed to verify signup. Please try again.');
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
            sameSite: process.env['NODE_ENV'] === 'production' ? 'lax' : 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000,
            path: '/'
        });
        try {
            await (0, eventLogger_1.logEvent)(user.id, 'profile_completed', {
                name: user.name || name,
                handle: user.handle || handle
            });
        }
        catch (eventError) {
            logger_1.logger.warn('Failed to log profile_completed event:', eventError);
        }
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
        (0, errorHandler_1.handleErrorWithResponse)(error, res, 'Failed to complete profile. Please try again.');
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
        (0, errorHandler_1.handleErrorWithResponse)(error, res, 'Failed to process forgot password. Please try again.');
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
        (0, errorHandler_1.handleErrorWithResponse)(error, res, 'Failed to verify forgot password. Please try again.');
    }
};
exports.forgotPasswordVerify = forgotPasswordVerify;
const resetPassword = async (req, res, next) => {
    try {
        const { email, password } = zod_1.z.object({
            email: zod_1.z.string().email('Invalid email format'),
            password: zod_1.z.string().min(6, 'Password must be at least 6 characters'),
        }).parse(req.body);
        const user = await database_1.userQueries.findByEmail(email.toLowerCase());
        if (!user) {
            throw errors_1.createError.notFound('User not found', errors_1.ErrorCodes.USER_NOT_FOUND);
        }
        if (user.passwordHash) {
            const isSamePassword = await (0, authService_1.verifyPassword)(password, user.passwordHash);
            if (isSamePassword) {
                throw errors_1.createError.validation('Password is same as current password', errors_1.ErrorCodes.VALIDATION_ERROR);
            }
        }
        const passwordHash = await (0, authService_1.hashPassword)(password);
        await database_1.userQueries.updatePassword(email.toLowerCase(), passwordHash);
        res.json({
            message: 'Password reset successfully',
            redirect: '/auth'
        });
    }
    catch (error) {
        logger_1.logger.error('Reset password error:', error);
        (0, errorHandler_1.handleErrorWithResponse)(error, res, 'Failed to reset password. Please try again.');
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
            sameSite: process.env['NODE_ENV'] === 'production' ? 'lax' : 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000,
            path: '/'
        });
        try {
            await (0, eventLogger_1.logEvent)(user.id, 'login', { email: user.email });
        }
        catch (eventError) {
            logger_1.logger.warn('Failed to log login event:', eventError);
        }
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
        (0, errorHandler_1.handleErrorWithResponse)(error, res, 'Failed to login. Please try again.');
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
            sameSite: process.env['NODE_ENV'] === 'production' ? 'lax' : 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000,
            path: '/'
        });
        req.session.userId = user.id;
        req.session.userEmail = user.email;
        req.session.userHandle = user.handle;
        try {
            await (0, eventLogger_1.logEvent)(user.id, 'login', { email: user.email, method: 'otp' });
        }
        catch (eventError) {
            logger_1.logger.warn('Failed to log login event:', eventError);
        }
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
        (0, errorHandler_1.handleErrorWithResponse)(error, res, 'Failed to verify login. Please try again.');
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
            return res.status(401).json({
                error: 'Authentication required',
                errorCode: errors_1.ErrorCodes.UNAUTHORIZED
            });
        }
        const user = await database_1.userQueries.findByEmail(req.user.email);
        if (!user || !user.passwordHash) {
            return res.status(404).json({
                error: 'User not found or no password set',
                errorCode: errors_1.ErrorCodes.USER_NOT_FOUND
            });
        }
        const isValidPassword = await (0, authService_1.verifyPassword)(currentPassword, user.passwordHash);
        if (!isValidPassword) {
            return res.status(400).json({
                error: 'Current password is incorrect',
                errorCode: errors_1.ErrorCodes.VALIDATION_ERROR
            });
        }
        const isSamePassword = await (0, authService_1.verifyPassword)(newPassword, user.passwordHash);
        if (isSamePassword) {
            return res.status(400).json({
                error: 'New password must be different from current password',
                errorCode: errors_1.ErrorCodes.VALIDATION_ERROR
            });
        }
        const passwordHash = await (0, authService_1.hashPassword)(newPassword);
        await database_1.userQueries.updatePassword(user.email, passwordHash);
        logger_1.logger.info(`Password changed for user: ${user.email}`);
        return res.json({
            success: true,
            message: 'Password changed successfully'
        });
    }
    catch (error) {
        logger_1.logger.error('Change password error:', error);
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({
                error: error.errors[0]?.message || 'Validation failed',
                errorCode: errors_1.ErrorCodes.VALIDATION_ERROR,
                details: error.errors
            });
        }
        (0, errorHandler_1.handleErrorWithResponse)(error, res, 'Failed to change password. Please try again.');
    }
};
exports.changePassword = changePassword;
const logout = (req, res, next) => {
    try {
        const userId = req.session?.userId || null;
        if (userId) {
            (0, eventLogger_1.logEvent)(userId, 'logout', {}).catch((eventError) => {
                logger_1.logger.warn('Failed to log logout event:', eventError);
            });
        }
        res.clearCookie('jwtToken', {
            httpOnly: true,
            secure: process.env['NODE_ENV'] === 'production',
            sameSite: process.env['NODE_ENV'] === 'production' ? 'lax' : 'strict',
            path: '/'
        });
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
        (0, errorHandler_1.handleControllerError)(error, 'Failed to logout');
    }
};
exports.logout = logout;
//# sourceMappingURL=authController.js.map