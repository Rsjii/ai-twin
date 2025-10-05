"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logout = exports.changePassword = exports.loginVerify = exports.login = exports.resetPassword = exports.forgotPasswordVerify = exports.forgotPassword = exports.completeProfile = exports.signupVerify = exports.signup = void 0;
const database_1 = require("../../config/database");
const authService_1 = require("./authService");
const logger_1 = require("../../config/logger");
const env_1 = require("../../config/env");
const zod_1 = require("zod");
const jwtService_1 = require("../../services/jwtService");
const emailService = new authService_1.EmailService();
const signupSchema = zod_1.z.object({
    email: zod_1.z.string().email('Invalid email format'),
    password: zod_1.z.string().min(6, 'Password must be at least 6 characters'),
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
});
const forgotPasswordSchema = zod_1.z.object({
    email: zod_1.z.string().email('Invalid email format'),
});
const resetPasswordSchema = zod_1.z.object({
    email: zod_1.z.string().email('Invalid email format'),
    code: zod_1.z.string().length(6, 'OTP must be 6 digits').regex(/^\d{6}$/, 'OTP must contain only numbers'),
    password: zod_1.z.string().min(6, 'Password must be at least 6 characters'),
});
const signup = async (req, res) => {
    try {
        const { email, password } = signupSchema.parse(req.body);
        const existingUser = await database_1.userQueries.findByEmail(email.toLowerCase());
        if (existingUser) {
            return res.status(400).json({ error: 'User already exists. Please login instead.' });
        }
        const passwordHash = await (0, authService_1.hashPassword)(password);
        const user = await database_1.userQueries.create(email.toLowerCase(), undefined, passwordHash);
        const otp = (0, authService_1.generateOTP)(env_1.config.otp.codeLength);
        const hashedOTP = await (0, authService_1.hashOTP)(otp);
        const expiresAt = new Date(Date.now() + env_1.config.otp.expiryMinutes * 60 * 1000);
        await database_1.otpQueries.create(email.toLowerCase(), hashedOTP, expiresAt);
        const emailSent = await emailService.sendOTP(email, otp);
        if (!emailSent) {
            return res.status(500).json({ error: 'Failed to send OTP email' });
        }
        res.json({
            message: 'OTP sent for account activation',
            otp: otp,
            redirect: '/signup/verify?email=' + encodeURIComponent(email)
        });
    }
    catch (error) {
        logger_1.logger.error('Signup error:', error);
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: 'Invalid input', details: error.errors });
        }
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.signup = signup;
const signupVerify = async (req, res) => {
    try {
        const { email, code } = signupVerifySchema.parse(req.body);
        const otpRecord = await database_1.otpQueries.findByEmail(email.toLowerCase());
        if (!otpRecord) {
            return res.status(400).json({ error: 'Invalid or expired OTP' });
        }
        const isValid = await (0, authService_1.verifyOTP)(code, otpRecord.codeHash);
        if (!isValid) {
            return res.status(400).json({ error: 'Invalid OTP code' });
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
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: 'Invalid input', details: error.errors });
        }
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.signupVerify = signupVerify;
const completeProfile = async (req, res) => {
    try {
        const { email, name, handle, dob, phone, bio } = completeProfileSchema.parse(req.body);
        await database_1.userQueries.updateProfile(email.toLowerCase(), name, handle, dob, phone, bio);
        const user = await database_1.userQueries.findByEmail(email.toLowerCase());
        const token = (0, jwtService_1.generateJWT)({
            userId: user.id,
            email: user.email,
            handle: user.handle || ''
        });
        res.cookie('jwtToken', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
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
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: 'Invalid input', details: error.errors });
        }
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.completeProfile = completeProfile;
const forgotPassword = async (req, res) => {
    try {
        const { email } = forgotPasswordSchema.parse(req.body);
        const user = await database_1.userQueries.findByEmail(email.toLowerCase());
        if (!user) {
            return res.status(400).json({ error: 'User not found' });
        }
        const otp = (0, authService_1.generateOTP)(env_1.config.otp.codeLength);
        const hashedOTP = await (0, authService_1.hashOTP)(otp);
        const expiresAt = new Date(Date.now() + env_1.config.otp.expiryMinutes * 60 * 1000);
        await database_1.otpQueries.create(email.toLowerCase(), hashedOTP, expiresAt);
        const emailSent = await emailService.sendOTP(email, otp);
        if (!emailSent) {
            return res.status(500).json({ error: 'Failed to send OTP email' });
        }
        res.json({
            message: 'OTP sent for password reset',
            otp: otp,
            redirect: '/forgot-password/reset?email=' + encodeURIComponent(email)
        });
    }
    catch (error) {
        logger_1.logger.error('Forgot password error:', error);
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: 'Invalid input', details: error.errors });
        }
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.forgotPassword = forgotPassword;
const forgotPasswordVerify = async (req, res) => {
    try {
        const { email, code } = signupVerifySchema.parse(req.body);
        const otpRecord = await database_1.otpQueries.findByEmail(email.toLowerCase());
        if (!otpRecord) {
            return res.status(400).json({ error: 'Invalid or expired OTP' });
        }
        const isValid = await (0, authService_1.verifyOTP)(code, otpRecord.codeHash);
        if (!isValid) {
            return res.status(400).json({ error: 'Invalid OTP code' });
        }
        await database_1.otpQueries.markAsUsed(otpRecord.id);
        res.json({
            message: 'OTP verified successfully',
            redirect: '/reset-password?email=' + encodeURIComponent(email)
        });
    }
    catch (error) {
        logger_1.logger.error('Forgot password verify error:', error);
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: 'Invalid input', details: error.errors });
        }
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.forgotPasswordVerify = forgotPasswordVerify;
const resetPassword = async (req, res) => {
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
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: 'Invalid input', details: error.errors });
        }
        res.status(500).json({ error: 'Internal server error' });
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
const login = async (req, res) => {
    try {
        const { email, password } = loginSchema.parse(req.body);
        const user = await database_1.userQueries.findByEmail(email.toLowerCase());
        if (!user || !user.passwordHash) {
            return res.status(400).json({ error: 'Invalid email or password' });
        }
        if (!user.active) {
            return res.status(400).json({ error: 'Account not activated. Please check your email for activation link.' });
        }
        const isValidPassword = await (0, authService_1.verifyPassword)(password, user.passwordHash);
        if (!isValidPassword) {
            return res.status(400).json({ error: 'Invalid email or password' });
        }
        const token = (0, jwtService_1.generateJWT)({
            userId: user.id,
            email: user.email,
            handle: user.handle || ''
        });
        res.cookie('jwtToken', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
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
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: 'Invalid input', details: error.errors });
        }
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.login = login;
const loginVerify = async (req, res) => {
    try {
        const { email, code } = loginVerifySchema.parse(req.body);
        const otpRecord = await database_1.otpQueries.findByEmail(email.toLowerCase());
        if (!otpRecord) {
            return res.status(400).json({ error: 'Invalid or expired OTP' });
        }
        const isValid = await (0, authService_1.verifyOTP)(code, otpRecord.codeHash);
        if (!isValid) {
            return res.status(400).json({ error: 'Invalid OTP code' });
        }
        await database_1.otpQueries.markAsUsed(otpRecord.id);
        let user = await database_1.userQueries.findByEmail(email.toLowerCase());
        if (!user) {
            user = await database_1.userQueries.create(email.toLowerCase());
        }
        req.session.userId = user.id;
        req.session.userEmail = user.email;
        req.session.userHandle = user.handle;
        res.json({ message: 'Login successful', redirect: '/dashboard' });
    }
    catch (error) {
        logger_1.logger.error('Login verify error:', error);
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: 'Invalid input', details: error.errors });
        }
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.loginVerify = loginVerify;
const changePasswordSchema = zod_1.z.object({
    currentPassword: zod_1.z.string().min(6, 'Current password must be at least 6 characters'),
    newPassword: zod_1.z.string().min(6, 'New password must be at least 6 characters'),
});
const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const user = await database_1.userQueries.findByEmail(req.user.email);
        if (!user || !user.passwordHash) {
            return res.status(400).json({ error: 'User not found or no password set' });
        }
        const isValidPassword = await (0, authService_1.verifyPassword)(currentPassword, user.passwordHash);
        if (!isValidPassword) {
            return res.status(400).json({ error: 'Current password is incorrect' });
        }
        const passwordHash = await (0, authService_1.hashPassword)(newPassword);
        await database_1.userQueries.updatePassword(user.email, passwordHash);
        res.json({ message: 'Password changed successfully' });
    }
    catch (error) {
        logger_1.logger.error('Change password error:', error);
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: 'Invalid input', details: error.errors });
        }
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.changePassword = changePassword;
const logout = (req, res) => {
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
        logger_1.logger.error('Logout error:', error);
        res.status(500).json({ error: 'Failed to logout' });
    }
};
exports.logout = logout;
//# sourceMappingURL=authController.js.map