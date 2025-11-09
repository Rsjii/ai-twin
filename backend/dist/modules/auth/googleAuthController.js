"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.googleAuthCallback = exports.googleAuth = void 0;
const passport_1 = __importDefault(require("passport"));
const passport_google_oauth20_1 = require("passport-google-oauth20");
const env_1 = require("../../config/env");
const database_1 = require("../../config/database");
const jwtService_1 = require("../../services/jwtService");
const authService_1 = require("./authService");
const logger_1 = require("../../config/logger");
if (!env_1.config.google || !env_1.config.google.clientId || !env_1.config.google.clientSecret) {
    logger_1.logger.warn('Google OAuth credentials not configured. Google login will not work.');
}
else {
    passport_1.default.use(new passport_google_oauth20_1.Strategy({
        clientID: env_1.config.google.clientId,
        clientSecret: env_1.config.google.clientSecret,
        callbackURL: env_1.config.google.callbackURL
    }, async (accessToken, refreshToken, profile, done) => {
        logger_1.logger.info('=== Google Strategy Callback ===');
        logger_1.logger.info('Profile ID:', profile.id);
        logger_1.logger.info('Profile emails:', profile.emails);
        logger_1.logger.info('Profile displayName:', profile.displayName);
        try {
            const email = profile.emails?.[0]?.value?.toLowerCase();
            const name = profile.displayName || profile.name?.givenName || '';
            const photo = profile.photos?.[0]?.value || null;
            logger_1.logger.info(`Processing Google profile for email: ${email}`);
            if (!email) {
                logger_1.logger.error('No email found in Google profile');
                return done(new Error('No email found in Google profile'), null);
            }
            logger_1.logger.info(`Checking if user exists: ${email}`);
            let user = await database_1.userQueries.findByEmail(email);
            if (user) {
                logger_1.logger.info(`Google OAuth: Existing user found: ${email}`);
                return done(null, user);
            }
            else {
                logger_1.logger.info(`Creating new user: ${email}`);
                const referralCode = (0, authService_1.generateInviteCode)();
                try {
                    user = await database_1.userQueries.create(email, undefined, undefined, referralCode);
                    logger_1.logger.info(`User created successfully: ${user.id}`);
                }
                catch (createError) {
                    logger_1.logger.error('Error creating user:', createError);
                    logger_1.logger.error('Error stack:', createError?.stack);
                    return done(createError, null);
                }
                try {
                    await database_1.userQueries.updateProfile(email, name, undefined, undefined, undefined, undefined, photo);
                    logger_1.logger.info('Profile updated with Google data');
                }
                catch (updateError) {
                    logger_1.logger.error('Error updating profile:', updateError);
                }
                try {
                    await database_1.userQueries.activateUser(email);
                    logger_1.logger.info('User account activated');
                }
                catch (activateError) {
                    logger_1.logger.error('Error activating user:', activateError);
                }
                logger_1.logger.info(`Google OAuth: New user created and activated: ${email}`);
                return done(null, user);
            }
        }
        catch (error) {
            logger_1.logger.error('Google OAuth strategy error:', error);
            logger_1.logger.error('Error stack:', error?.stack);
            logger_1.logger.error('Error message:', error?.message);
            return done(error, null);
        }
    }));
}
passport_1.default.serializeUser((user, done) => {
    done(null, user.id);
});
passport_1.default.deserializeUser(async (id, done) => {
    try {
        const user = await database_1.userQueries.findById(id);
        done(null, user);
    }
    catch (error) {
        done(error, null);
    }
});
const googleAuth = (req, res, next) => {
    if (!env_1.config.google || !env_1.config.google.clientId || !env_1.config.google.clientSecret) {
        logger_1.logger.error('Google OAuth not configured');
        return res.redirect('/auth?error=google_oauth_not_configured');
    }
    passport_1.default.authenticate('google', {
        scope: ['profile', 'email']
    })(req, res, next);
};
exports.googleAuth = googleAuth;
const googleAuthCallback = (req, res, next) => {
    logger_1.logger.info('=== Google OAuth Callback Received ===');
    logger_1.logger.info('Query params:', JSON.stringify(req.query));
    logger_1.logger.info('Request URL:', req.url);
    if (!env_1.config.google || !env_1.config.google.clientId || !env_1.config.google.clientSecret) {
        logger_1.logger.error('Google OAuth not configured');
        return res.redirect('/auth?error=google_oauth_not_configured');
    }
    passport_1.default.authenticate('google', { session: false }, async (err, user, info) => {
        logger_1.logger.info('=== Passport Authenticate Callback ===');
        logger_1.logger.info('Error:', err);
        logger_1.logger.info('User:', user ? { id: user.id, email: user.email } : 'null');
        logger_1.logger.info('Info:', info);
        try {
            if (err) {
                logger_1.logger.error('Google OAuth callback error:', err);
                logger_1.logger.error('Error stack:', err.stack);
                return res.redirect('/auth?error=google_auth_failed&details=' + encodeURIComponent(err.message));
            }
            if (!user) {
                logger_1.logger.error('No user returned from Google OAuth');
                return res.redirect('/auth?error=user_not_found');
            }
            logger_1.logger.info(`Processing Google OAuth for user: ${user.email}`);
            const token = (0, jwtService_1.generateJWT)({
                userId: user.id,
                email: user.email,
                handle: user.handle || ''
            });
            logger_1.logger.info('JWT token generated successfully');
            res.cookie('jwtToken', token, {
                httpOnly: true,
                secure: env_1.config.nodeEnv === 'production',
                sameSite: 'lax',
                path: '/',
                maxAge: 7 * 24 * 60 * 60 * 1000
            });
            logger_1.logger.info('JWT cookie set');
            if (req.session) {
                req.session.userId = user.id;
                req.session.userEmail = user.email;
                req.session.userHandle = user.handle;
                logger_1.logger.info('Session created');
            }
            logger_1.logger.info(`Google OAuth: User logged in successfully: ${user.email}`);
            res.redirect('/dashboard');
        }
        catch (error) {
            logger_1.logger.error('Google OAuth callback processing error:', error);
            logger_1.logger.error('Error stack:', error?.stack);
            logger_1.logger.error('Error message:', error?.message);
            res.redirect('/auth?error=internal_error&details=' + encodeURIComponent(error?.message || 'Unknown error'));
        }
    })(req, res, next);
};
exports.googleAuthCallback = googleAuthCallback;
//# sourceMappingURL=googleAuthController.js.map