// ✅ v2: Google OAuth routes - not needed in v1, not needed for mvp

/*
import { Request, Response, NextFunction } from 'express';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { config } from '../../config/env';
import { userQueries } from '../../config/database';
import { generateJWT } from '../../services/jwtService';
import { generateInviteCode } from './authService';
import { logger } from '../../config/logger';
import { AppError, createError } from '../../utils/errors';

// Validate Google OAuth config
if (!config.google || !config.google.clientId || !config.google.clientSecret) {
  logger.warn('Google OAuth credentials not configured. Google login will not work.');
} else {
  // Configure Google OAuth Strategy
  // Configure Google OAuth Strategy
  passport.use(new GoogleStrategy({
    clientID: config.google.clientId,
    clientSecret: config.google.clientSecret,
    callbackURL: config.google.callbackURL
  }, async (accessToken, refreshToken, profile, done) => {
    logger.info('=== Google Strategy Callback ===');
    logger.info('Profile ID:', profile.id);
    logger.info('Profile emails:', profile.emails);
    logger.info('Profile displayName:', profile.displayName);
    
    try {
      const email = profile.emails?.[0]?.value?.toLowerCase();
      const name = profile.displayName || profile.name?.givenName || '';
      const photo = profile.photos?.[0]?.value || null;
      
      logger.info(`Processing Google profile for email: ${email}`);
      
      if (!email) {
        logger.error('No email found in Google profile');
        return done(new Error('No email found in Google profile'), null);
      }

      // Check if user exists
      logger.info(`Checking if user exists: ${email}`);
      let user = await userQueries.findByEmail(email);
      
      if (user) {
        // User exists - update last login
        logger.info(`Google OAuth: Existing user found: ${email}`);
        return done(null, user);
      } else {
        // Create new user
        logger.info(`Creating new user: ${email}`);
        const referralCode = generateInviteCode();
        
        try {
          user = await userQueries.create(
            email,
            undefined, // handle - will be set later
            undefined, // passwordHash - not needed for OAuth
            referralCode
          );
          logger.info(`User created successfully: ${user.id}`);
        } catch (createError: any) {
          logger.error('Error creating user:', createError);
          logger.error('Error stack:', createError?.stack);
          return done(createError, null);
        }
        
        // ✅ REMOVE: Don't call updateProfile - it sets profileCompleted = true
        // User will complete profile via /signup/profile form
        
        // Activate user account (email verified via Google)
        try {
          await userQueries.activateUser(email);
          logger.info('User account activated (email verified via Google)');
        } catch (activateError: any) {
          logger.error('Error activating user:', activateError);
          // Don't fail if activation fails
        }
        
        logger.info(`Google OAuth: New user created (profile incomplete): ${email}`);
        return done(null, user);
      }
    } catch (error: any) {
      logger.error('Google OAuth strategy error:', error);
      logger.error('Error stack:', error?.stack);
      logger.error('Error message:', error?.message);
      return done(error, null);
    }
  }));  
}

// Serialize user for session
passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await userQueries.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

// Initiate Google OAuth
export const googleAuth = (req: Request, res: Response, next: NextFunction) => {
  // Check if Google OAuth is configured
  if (!config.google || !config.google.clientId || !config.google.clientSecret) {
    logger.error('Google OAuth not configured');
    return res.redirect('/auth?error=google_oauth_not_configured');
  }
  
  passport.authenticate('google', {
    scope: ['profile', 'email']
  })(req, res, next);
};

// Handle Google OAuth callback
export const googleAuthCallback = (req: Request, res: Response, next: NextFunction) => {
    logger.info('=== Google OAuth Callback Received ===');
    logger.info('Query params:', JSON.stringify(req.query));
    logger.info('Request URL:', req.url);
    
    // Check if Google OAuth is configured
    if (!config.google || !config.google.clientId || !config.google.clientSecret) {
      logger.error('Google OAuth not configured');
      return res.redirect('/auth?error=google_oauth_not_configured');
    }
    
    passport.authenticate('google', { session: false }, async (err: any, user: any, info: any) => {
      logger.info('=== Passport Authenticate Callback ===');
      logger.info('Error:', err);
      logger.info('User:', user ? { id: user.id, email: user.email } : 'null');
      logger.info('Info:', info);
      
      try {
        if (err) {
          logger.error('Google OAuth callback error:', err);
          logger.error('Error stack:', err.stack);
          return res.redirect('/auth?error=google_auth_failed&details=' + encodeURIComponent(err.message));
        }
        
        if (!user) {
          logger.error('No user returned from Google OAuth');
          return res.redirect('/auth?error=user_not_found');
        }
  
        logger.info(`Processing Google OAuth for user: ${user.email}`);
  
        // Generate JWT token
        const token = generateJWT({
          userId: user.id,
          email: user.email,
          handle: user.handle || ''
        });
        
        logger.info('JWT token generated successfully');
  
        // Set JWT token in cookie
        res.cookie('jwtToken', token, {
          httpOnly: true,
          secure: config.nodeEnv === 'production',
          sameSite: 'lax',
          path: '/',
          maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });
        
        logger.info('JWT cookie set');
  
        // Create session for backward compatibility
        if (req.session) {
          req.session.userId = user.id;
          req.session.userEmail = user.email;
          req.session.userHandle = user.handle;
          logger.info('Session created');
        }
  
        logger.info(`Google OAuth: User logged in successfully: ${user.email}`);
        
        // ✅ Check if profile is completed
        const userWithProfile = await userQueries.findByEmail(user.email);
        const isProfileCompleted = userWithProfile?.profileCompleted || false;
        
        // ✅ Redirect based on profile completion
        if (isProfileCompleted) {
          // Profile completed - go to dashboard
          res.redirect('/dashboard');
        } else {
          // ✅ Profile incomplete - redirect to profile completion form
          logger.info(`Google OAuth: Profile incomplete, redirecting to profile form`);
          res.redirect('/signup/profile?email=' + encodeURIComponent(user.email));
        }
      } catch (error: any) {
        logger.error('Google OAuth callback processing error:', error);
        logger.error('Error stack:', error?.stack);
        logger.error('Error message:', error?.message);
        res.redirect('/auth?error=internal_error&details=' + encodeURIComponent(error?.message || 'Unknown error'));
      }
    })(req, res, next);
  };
  */