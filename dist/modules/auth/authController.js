"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.waitlistSignup = exports.logout = exports.loginVerify = exports.loginStart = void 0;
const database_1 = require("../../config/database");
const authService_1 = require("./authService");
const logger_1 = require("../../config/logger");
const env_1 = require("../../config/env");
const zod_1 = require("zod");
const emailService = new authService_1.EmailService();
const loginStartSchema = zod_1.z.object({
    email: zod_1.z.string().email('Invalid email format'),
});
const loginVerifySchema = zod_1.z.object({
    email: zod_1.z.string().email('Invalid email format'),
    code: zod_1.z.string().length(6, 'OTP must be 6 digits').regex(/^\d{6}$/, 'OTP must contain only numbers'),
});
const waitlistSchema = zod_1.z.object({
    email: zod_1.z.string().email('Invalid email format'),
});
const loginStart = async (req, res) => {
    try {
        const { email } = loginStartSchema.parse(req.body);
        const otp = (0, authService_1.generateOTP)(env_1.config.otp.codeLength);
        const hashedOTP = await (0, authService_1.hashOTP)(otp);
        const expiresAt = new Date(Date.now() + env_1.config.otp.expiryMinutes * 60 * 1000);
        await database_1.otpQueries.create(email.toLowerCase(), hashedOTP, expiresAt);
        const emailSent = await emailService.sendOTP(email, otp);
        if (!emailSent) {
            return res.status(500).json({ error: 'Failed to send OTP email' });
        }
        res.json({ message: 'OTP sent successfully' });
    }
    catch (error) {
        logger_1.logger.error('Login start error:', error);
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: 'Invalid input', details: error.errors });
        }
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.loginStart = loginStart;
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
const logout = (req, res) => {
    req.session?.destroy((err) => {
        if (err) {
            logger_1.logger.error('Session destruction error:', err);
            return res.status(500).json({ error: 'Failed to logout' });
        }
        res.json({ message: 'Logged out successfully' });
    });
};
exports.logout = logout;
const waitlistSignup = async (req, res) => {
    try {
        const { email } = waitlistSchema.parse(req.body);
        const existingUser = await database_1.userQueries.findByEmail(email.toLowerCase());
        if (existingUser) {
            return res.json({ message: 'Email already registered' });
        }
        const user = await database_1.userQueries.create(email.toLowerCase());
        res.json({ message: 'Successfully added to waitlist' });
    }
    catch (error) {
        logger_1.logger.error('Waitlist signup error:', error);
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: 'Invalid input', details: error.errors });
        }
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.waitlistSignup = waitlistSignup;
//# sourceMappingURL=authController.js.map