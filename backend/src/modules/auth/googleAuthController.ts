import { Request, Response, NextFunction } from 'express';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { config } from '../../config/env';
import { userQueries, db } from '../../config/database';
import { generateJWT } from '../../services/jwtService';
import { generateInviteCode } from './authService';
import { logger } from '../../config/logger';
import { AppError, createError } from '../../utils/errors';
import { generateId } from '../../utils/idGenerator';

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
      const googleId = profile.id;
      const googleEmail = email;
      // ✅ More reliable email verification check (Google profile structure varies)
      const emailEntry: any = profile.emails?.[0];
      const googleEmailVerified = Boolean(
        emailEntry?.verified ??
        (profile as any)?._json?.email_verified ??
        (profile as any)?._json?.verified_email ??
        false
      );
      const name = profile.displayName || profile.name?.givenName || '';
      const photo = profile.photos?.[0]?.value || null;
      
      logger.info(`Processing Google profile for email: ${email}, googleId: ${googleId}`);
      
      if (!email) {
        logger.error('No email found in Google profile');
        return done(new Error('No email found in Google profile'), null);
      }

      // Check if user exists by email
      logger.info(`Checking if user exists: ${email}`);
      let user = await userQueries.findByEmail(email);
      
      if (user) {
        // User exists with this email
        if (user.googleId && user.googleId !== googleId) {
          // Different Google account with same email → error
          logger.error(`Email ${email} already linked to different Google account`);
          return done(new Error('Email already registered with different Google account'), null);
        }
        
       // ✅ If user is active:
// - allow Google login if it's the SAME googleId (even if passwordHash also exists)
// - block only when it's a password-only account (no googleId)
if (user.active) {
  if (user.googleId) {
    if (user.googleId !== googleId) {
      logger.warn(`Google login blocked: different googleId for same email - ${email}`);
      return done(new Error('Email already registered with different Google account'), null);
    }
    // ✅ same googleId => allow login (continue)
  } else if (user.passwordHash) {
    logger.warn(`Google login blocked: password account exists - ${email}`);
    return done(new Error('This email is already registered with email/password. Please login with your password.'), null);
  }
}
        
        // ✅ Only allow linking if user is INACTIVE (incomplete signup)
        // Link Google account if not already linked
        // ✅ SECURITY: Only link if Google email is verified
        if (!user.googleId) {
          if (!googleEmailVerified) {
            logger.error(`Cannot link Google account: email not verified for ${email}`);
            return done(new Error('Google email is not verified. Please verify your email with Google first.'), null);
          }
          logger.info(`Linking Google account to inactive email user: ${email}`);
          await userQueries.linkGoogleByEmail(email, googleId, googleEmail, googleEmailVerified);
          // Reload user to get updated fields
          user = await userQueries.findByEmail(email);
        }
        
        // Activate user if inactive (e.g., from incomplete email signup)
        if (!user.active) {
          await userQueries.activateUser(email);
          user = await userQueries.findByEmail(email);
        }
        
        logger.info(`Google OAuth: Existing user found/linked: ${email}`);
        return done(null, user);
      } else {
        // Create new OAuth user (no password)
        logger.info(`Creating new OAuth user: ${email}`);
        const referralCode = generateInviteCode();
        const userId = generateId.user();
        const now = new Date();
        
        try {
          const result = await db.query(
            `INSERT INTO "User" (id, email, "googleId", "googleEmail", "googleEmailVerified", "referralCode", active, "createdAt", "updatedAt") 
             VALUES ($1, $2, $3, $4, $5, $6, true, $7, $8) RETURNING *`,
            [userId, email, googleId, googleEmail, googleEmailVerified, referralCode, now, now]
          );
          user = result.rows[0];
          logger.info(`OAuth user created successfully: ${user.id}`);
        } catch (createError: any) {
          logger.error('Error creating OAuth user:', createError);
          logger.error('Error stack:', createError?.stack);
          return done(createError, null);
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