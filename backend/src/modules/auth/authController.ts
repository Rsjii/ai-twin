import { Request, Response, NextFunction } from 'express';
import { userQueries, otpQueries, db } from '../../config/database';
import { EmailService, generateOTP, hashOTP, verifyOTP, hashPassword, verifyPassword , generateInviteCode} from './authService';
import { logger } from '../../config/logger';
import { config, isProd } from '../../config/env';
import { z } from 'zod';
import { AuthenticatedRequest } from '../../middleware/auth';
import { generateJWT } from '../../services/jwtService';
import { createError, ErrorCodes } from '../../utils/errors';
import { handleErrorWithResponse } from '../../utils/errorHandler';
import { logEvent } from '../../services/eventLogger';
import { EventLogger } from '../../services/eventLogger';
import { EVENT_TYPES } from '../../config/constants';
import { identifyPostHogUser } from '../../services/posthogService';

const emailService = new EmailService();

const signupSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  referralCode: z.string().optional(),
});

const signupVerifySchema = z.object({
  email: z.string().email('Invalid email format'),
  code: z.string().length(6, 'OTP must be 6 digits').regex(/^\d{6}$/, 'OTP must contain only numbers'),
});

const completeProfileSchema = z.object({
  email: z.string().email('Valid email is required'),
  name: z.string()
    .min(1, 'Name is required')
    .min(3, 'Name must be at least 3 characters')
    .max(50, 'Name is too long'),
  handle: z.string()
    .min(1, 'Username is required')
    .min(3, 'Username must be at least 3 characters')
    .max(20, 'Username must be at most 20 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
    dob: z.string()
    .min(1, 'Date of birth is required')
    // 1) Valid date format
    .refine((val) => {
      const date = new Date(val);
      return !isNaN(date.getTime());
    }, {
      message: 'Date of birth must be a valid date'
    })
    // 2) Not in future
    .refine((val) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const dobDate = new Date(val);
      dobDate.setHours(0, 0, 0, 0);
      return dobDate <= today;
    }, {
      message: 'Date of birth cannot be in the future'
    })
    // 3) Minimum age 13 years
    .refine((val) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const dobDate = new Date(val);
      dobDate.setHours(0, 0, 0, 0);
      const minAge = new Date(today);
      minAge.setFullYear(today.getFullYear() - 13);
      return dobDate <= minAge;
    }, {
      message: 'You must be at least 13 years old'
    })
    // 4) Maximum age 150 years
    .refine((val) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const dobDate = new Date(val);
      dobDate.setHours(0, 0, 0, 0);
      const maxAge = new Date(today);
      maxAge.setFullYear(today.getFullYear() - 150);
      return dobDate >= maxAge;
    }, {
      message: 'Date of birth is too far in the past (maximum 150 years)'
    }),    
  phone: z.string()
    .optional()
    .refine((value) => {
      // ✅ Optional field - allow empty
      if (!value || value.trim() === '') return true;
      
      // ✅ MUST start with +
      if (!value.trim().startsWith('+')) {
        return false;
      }
      
      // ✅ Split by space: +[country code] [phone number]
      const parts = value.trim().split(/\s+/);
      
      // ✅ Must have exactly 2 parts: [+countryCode] and [phoneNumber]
      if (parts.length !== 2) {
        return false;
      }
      
      const countryCodePart = parts[0]; // e.g. "+91"
      const phoneNumberPart = parts[1];  // e.g. "1234567890"
      
      // ✅ Country code part: must be + followed by 1-3 digits
      if (!/^\+[1-9]\d{0,2}$/.test(countryCodePart)) {
        return false; // +1, +91, +123 valid; +0, +01, +0123 invalid
      }
      
      // ✅ Phone number part: must be exactly 10 digits
      if (!/^\d{10}$/.test(phoneNumberPart)) {
        return false;
      }
      
      return true;
    }, 'Phone number must be in format: +[country code] [10 digits] (e.g. +91 1234567890 or +1 1234567890)'),
  bio: z.string().max(300, 'Bio must be at most 300 characters').optional(),
  profileImage: z.string().nullable().optional(),
});

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email format'),
});

// Schema for forgot-password/verify (includes OTP code)
const forgotPasswordVerifySchema = z.object({
  email: z.string().email('Invalid email format'),
  code: z.string().length(6, 'OTP must be 6 digits').regex(/^\d{6}$/, 'OTP must contain only numbers'),
});

// Schema for reset-password (no code needed, already verified)
const resetPasswordSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
});

export const signup = async (req: Request, res: Response, next: NextFunction) => {
  try {
    logger.info('=== SIGNUP REQUEST ===');
    logger.info('Request body:', JSON.stringify(req.body));
    logger.info('Request method:', req.method);
    logger.info('Request path:', req.path);
    
    const { email, password, referralCode } = signupSchema.parse(req.body);
    
    logger.info(`Attempting signup for email: ${email}`);
    
    // Check if user already exists
    const existingUser = await userQueries.findByEmail(email.toLowerCase());
    if (existingUser) {
      // ✅ NEW: If user exists but NOT verified, allow signup again (delete incomplete user)
      if (!existingUser.verified) {
        logger.info(`User ${email} exists but not verified. Deleting incomplete user and allowing fresh signup.`);
        
        // Delete incomplete user (cascade will delete related data)
        await db.query(`DELETE FROM "User" WHERE id = $1`, [existingUser.id]);
        
        // Also delete any pending OTP for this email
        await otpQueries.deleteByEmail(email.toLowerCase());
        
        logger.info(`Incomplete user deleted. Proceeding with fresh signup.`);
        // Continue to create new user below
      } else {
        // User exists and is verified → normal error
        logger.warn(`Signup failed: User already exists and verified - ${email}`);
        return res.status(409).json({
          error: 'User already exists. Please login instead.',
          errorCode: 'USER_ALREADY_EXISTS'
        });
      }
    }    
    
    logger.info(`User does not exist, creating new user: ${email}`);
    
    // Hash password
    const passwordHash = await hashPassword(password);
    
    // Generate unique referral code for NEW user
    const userReferralCode = generateInviteCode();
    
    // Check if referral code is valid (find referrer)
    let referrerId = null;
    if (referralCode) {
      const referrer = await userQueries.findByReferralCode(referralCode);
      if (referrer) {
        referrerId = referrer.id;
      }
    }
    
    // Create user with their own referral code
    const user = await userQueries.create(
      email.toLowerCase(), 
      undefined, 
      passwordHash, 
      userReferralCode
    );
    
    logger.info(`User created successfully: ${user.id}`);

    // Log signup event
    try {
      await EventLogger.logSignup(user.id, {
        source: referralCode ? 'referral' : 'direct'
      });
    } catch (eventError) {
      logger.warn('Failed to log signup event:', eventError);
    }

    // ✅ Identify user in PostHog
    identifyPostHogUser(user.id, {
      handle: user.handle,
      createdAt: user.createdAt.toISOString()
    });

// If they were referred, link them
if (referrerId) {
  const { db } = await import('../../config/database');
  const { generateId } = await import('../../utils/idGenerator');
  
  // Create invite record linking them
  const inviteId = generateId.invite();
  await db.query(
    'INSERT INTO "Invite" (id, code, "inviterId", "acceptedBy") VALUES ($1, $2, $3, $4)',
    [inviteId, referralCode, referrerId, user.id]
  );
  
  // Log event
  await EventLogger.logInviteAccepted(user.id, referralCode, referrerId);
}    
    
  // Generate OTP
    const otp = generateOTP(config.otp.codeLength);
    const hashedOTP = await hashOTP(otp);
    const expiresAt = new Date(Date.now() + config.otp.expiryMinutes * 60 * 1000);
    
    await otpQueries.create(email.toLowerCase(), hashedOTP, expiresAt);
    logger.info(`OTP created for ${email}`);
    
    // ✅ Send OTP via email (only in production)
    const emailSent = await emailService.sendOTP(email, otp, 'signup');
    
    if (isProd) {
      if (!emailSent) {
        logger.error(`Email send failed for ${email} in production. Check SMTP configuration.`);
        return res.status(500).json({
          error: 'Failed to send verification email. Please check your email configuration or try again later.',
          errorCode: 'EMAIL_SEND_FAILED',
          details: 'SMTP email service is not configured or email sending failed. Please contact support.'
        });
      }
      logger.info(`✅ Email sent successfully to ${email}`);
    } else {
      // Development: OTP is fixed, no email needed
      logger.info(`Development mode: OTP ${otp} generated (not sent via email)`);
    }
    
    res.json({ 
      message: 'OTP sent to your email',
      // ✅ REMOVED: otp: otp (never send OTP in response)
      redirect: '/signup/verify?email=' + encodeURIComponent(email)
    });
  } catch (error) {
    logger.error('Signup error:', error);
    
    // Handle Zod validation errors with proper messages
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: error.errors[0]?.message || 'Validation failed',
        errorCode: ErrorCodes.VALIDATION_ERROR,
        details: error.errors
      });
    }
    
    // Handle other errors
    handleErrorWithResponse(error, res, 'Failed to signup. Please try again.');
  }
};

export const signupVerify = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, code } = signupVerifySchema.parse(req.body);
    
    // Find valid OTP
    const otpRecord = await otpQueries.findByEmail(email.toLowerCase());
    
    if (!otpRecord) {
      return res.status(400).json({
        error: 'Invalid or expired OTP',
        errorCode: 'INVALID_OTP'
      });
    }
    
    // ✅ Check if OTP is expired
    const now = new Date();
    if (new Date(otpRecord.expiresAt) < now) {
      logger.warn(`OTP expired for ${email}. ExpiresAt: ${otpRecord.expiresAt}, Now: ${now}`);
      return res.status(400).json({
        error: 'OTP has expired. Please request a new one.',
        errorCode: 'OTP_EXPIRED'
      });
    }
    
    // ✅ Check if OTP is already used
    if (otpRecord.used) {
      logger.warn(`OTP already used for ${email}`);
      return res.status(400).json({
        error: 'This OTP has already been used. Please request a new one.',
        errorCode: 'OTP_ALREADY_USED'
      });
    }
    
    // Verify OTP
    const isValid = await verifyOTP(code, otpRecord.codeHash);
    if (!isValid) {
      return res.status(400).json({
        error: 'Invalid OTP code',
        errorCode: 'INVALID_OTP'
      });
    }
    
    // Mark OTP as used
    await otpQueries.markAsUsed(otpRecord.id);
    
    // Activate user account
    await userQueries.activateUser(email.toLowerCase());
    
    res.json({ 
      message: 'Account activated successfully', 
      redirect: '/signup/profile?email=' + encodeURIComponent(email)
    });
  } catch (error) {
    logger.error('Signup verify error:', error);
    
    // Handle Zod validation errors with proper messages
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: error.errors[0]?.message || 'Validation failed',
        errorCode: ErrorCodes.VALIDATION_ERROR,
        details: error.errors
      });
    }
    
    // Handle other errors
    handleErrorWithResponse(error, res, 'Failed to verify signup. Please try again.');
  }
};

export const completeProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, name, handle, dob, phone, bio, profileImage } = completeProfileSchema.parse(req.body);
    
    // Update user profile (provide defaults for optional fields)
    await userQueries.updateProfile(
      email.toLowerCase(), 
      name, 
      handle || '', 
      dob || null, 
      phone || '', 
      bio || '', 
      profileImage || null
    );
    
    // Find user and generate JWT
    const user = await userQueries.findByEmail(email.toLowerCase());
    if (!user) {
      logger.error('Complete profile: User not found after update');
      throw createError.notFound('User not found');
    }
    
    // ✅ Profile exists via User.handle - no TwinProfile needed
    // Profile URL /@handle works immediately after signup
    
    // Generate JWT token
    const token = generateJWT({
      userId: user.id,
      email: user.email,
      handle: user.handle || ''
    });
    
    // Set JWT token in cookie
    res.cookie('jwtToken', token, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'lax' : 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/'
    });

    // Log profile completed event
    try {
      await EventLogger.logUserEvent(user.id, EVENT_TYPES.PROFILE_COMPLETED, { 
        name: user.name || name,
        handle: user.handle || handle
      });
    } catch (eventError) {
      logger.warn('Failed to log profile_completed event:', eventError);
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
  } catch (error: any) {
    logger.error('Complete profile error:', error);

    // ✅ 1) Zod validation errors → fieldErrors map (already there)
    if (error instanceof z.ZodError) {
      // Format errors for frontend
      const fieldErrors: Record<string, string> = {};
      error.errors.forEach((err) => {
        const field = err.path[0] as string;
        if (!fieldErrors[field]) {
          fieldErrors[field] = err.message;
        }
      });
      
      return res.status(400).json({
        error: 'Validation failed',
        errorCode: ErrorCodes.VALIDATION_ERROR,
        details: error.errors,
        fieldErrors: fieldErrors,
      });
    }

    // ✅ 2) NEW: duplicate username / handle (unique constraint)
    if (error?.code === '23505' && error?.constraint === 'User_handle_key') {
      return res.status(409).json({
        error: 'Username is already taken',
        errorCode: ErrorCodes.VALIDATION_ERROR,
        fieldErrors: {
          handle: 'This username is already taken. Please choose another.',
        },
      });
    }

    // ✅ 3) Fallback: other errors
    handleErrorWithResponse(error, res, 'Failed to complete profile. Please try again.');
  }
};

export const forgotPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = forgotPasswordSchema.parse(req.body);
    
    // Check if user exists
    const user = await userQueries.findByEmail(email.toLowerCase());
    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        errorCode: 'USER_NOT_FOUND'
      });
    }
    
    // Generate OTP for password reset
    const otp = generateOTP(config.otp.codeLength);
    const hashedOTP = await hashOTP(otp);
    const expiresAt = new Date(Date.now() + config.otp.expiryMinutes * 60 * 1000);
    
    // Store OTP
    await otpQueries.create(email.toLowerCase(), hashedOTP, expiresAt);
    
    // ✅ Send OTP via email (only in production)
    const emailSent = await emailService.sendOTP(email, otp, 'forgot');
    
    if (isProd) {
      if (!emailSent) {
        logger.error(`Email send failed for ${email} in production. Check SMTP configuration.`);
        return res.status(500).json({
          error: 'Failed to send verification email. Please check your email configuration or try again later.',
          errorCode: 'EMAIL_SEND_FAILED',
          details: 'SMTP email service is not configured or email sending failed. Please contact support.'
        });
      }
      logger.info(`✅ Email sent successfully to ${email}`);
    } else {
      logger.info(`Development mode: OTP ${otp} generated (not sent via email)`);
    }
    
    res.json({ 
      message: 'OTP sent to your email',
      // ✅ REMOVED: otp: otp
      redirect: '/forgot-password/reset?email=' + encodeURIComponent(email)
    });
  } catch (error) {
    logger.error('Forgot password error:', error);
    
    // Handle Zod validation errors with proper messages
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: error.errors[0]?.message || 'Validation failed',
        errorCode: ErrorCodes.VALIDATION_ERROR,
        details: error.errors
      });
    }
    
    // Handle other errors
    handleErrorWithResponse(error, res, 'Failed to process forgot password. Please try again.');
  }
};

export const forgotPasswordVerify = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, code } = forgotPasswordVerifySchema.parse(req.body);
    
    // Find valid OTP
    const otpRecord = await otpQueries.findByEmail(email.toLowerCase());
    
    if (!otpRecord) {
      return res.status(400).json({
        error: 'Invalid or expired OTP',
        errorCode: 'INVALID_OTP'
      });
    }
    
    // ✅ Check if OTP is expired
    const now = new Date();
    if (new Date(otpRecord.expiresAt) < now) {
      logger.warn(`OTP expired for ${email}. ExpiresAt: ${otpRecord.expiresAt}, Now: ${now}`);
      return res.status(400).json({
        error: 'OTP has expired. Please request a new one.',
        errorCode: 'OTP_EXPIRED'
      });
    }
    
    // ✅ Check if OTP is already used
    if (otpRecord.used) {
      logger.warn(`OTP already used for ${email}`);
      return res.status(400).json({
        error: 'This OTP has already been used. Please request a new one.',
        errorCode: 'OTP_ALREADY_USED'
      });
    }
    
    // Verify OTP
    const isValid = await verifyOTP(code, otpRecord.codeHash);
    if (!isValid) {
      return res.status(400).json({
        error: 'Invalid OTP code',
        errorCode: 'INVALID_OTP'
      });
    }
    
    // Mark OTP as used
    await otpQueries.markAsUsed(otpRecord.id);
    
    res.json({ 
      message: 'OTP verified successfully', 
      redirect: '/reset-password?email=' + encodeURIComponent(email)
    });
  } catch (error) {
    logger.error('Forgot password verify error:', error);
    
    // Handle Zod validation errors with proper messages
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: error.errors[0]?.message || 'Validation failed',
        errorCode: ErrorCodes.VALIDATION_ERROR,
        details: error.errors
      });
    }
    
    // Handle other errors
    handleErrorWithResponse(error, res, 'Failed to verify forgot password. Please try again.');
  }
};

export const resetPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // ✅ Use resetPasswordSchema instead of inline schema for consistency
    const { email, password } = resetPasswordSchema.parse(req.body);

    // Check if password is same as current password
    const user = await userQueries.findByEmail(email.toLowerCase());
    if (!user) {
      throw createError.notFound('User not found', ErrorCodes.USER_NOT_FOUND);
    }

     // Check if user has a password set
     if (user.passwordHash) {
      const isSamePassword = await verifyPassword(password, user.passwordHash);
      if (isSamePassword) {
        throw createError.validation('Password is same as current password', ErrorCodes.VALIDATION_ERROR);
      }
    }
    
    // Hash new password
    const passwordHash = await hashPassword(password);
    
    // Update password
    await userQueries.updatePassword(email.toLowerCase(), passwordHash);
    
    res.json({ 
      message: 'Password reset successfully', 
      redirect: '/auth'
    });
  } catch (error) {
    logger.error('Reset password error:', error);
    
    // Handle Zod validation errors with proper messages
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: error.errors[0]?.message || 'Validation failed',
        errorCode: ErrorCodes.VALIDATION_ERROR,
        details: error.errors
      });
    }
    
    // Handle other errors
    handleErrorWithResponse(error, res, 'Failed to reset password. Please try again.');
  }
};

const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

const loginVerifySchema = z.object({
  email: z.string().email('Invalid email format'),
  code: z.string().length(6, 'OTP must be 6 digits').regex(/^\d{6}$/, 'OTP must contain only numbers'),
});

export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    
    // Find user
    const user = await userQueries.findByEmail(email.toLowerCase());
    
    if (!user || !user.passwordHash) {
      return res.status(401).json({
        error: 'Invalid email or password',
        errorCode: 'UNAUTHORIZED'
      });
    }
    
    // Check if user is active
    if (!user.active) {
      return res.status(403).json({
        error: 'Account not activated. Please signup again to activate your account.',
        errorCode: 'ACCOUNT_NOT_VERIFIED',
      });
    }
    
    // Verify password
    const isValidPassword = await verifyPassword(password, user.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({
        error: 'Invalid email or password',
        errorCode: 'UNAUTHORIZED'
      });
    }
    
    // Generate JWT token
    const token = generateJWT({
      userId: user.id,
      email: user.email,
      handle: user.handle || ''
    });
    
    // Set JWT token in cookie
    res.cookie('jwtToken', token, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'lax' : 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/' // ✅ ADD: Explicit path      
    });

    // Log login event
    try {
      await EventLogger.logLogin(user.id, {
        source: 'direct'
      });
    } catch (eventError) {
      logger.warn('Failed to log login event:', eventError);
    }

    // ✅ Identify user in PostHog (optional - can do on first login only)
    identifyPostHogUser(user.id, {
      handle: user.handle
    });

    const nextRedirect = user.profileCompleted
    ? '/dashboard'
    : '/signup/profile?email=' + encodeURIComponent(user.email);
  
  res.json({ 
    message: 'Login successful', 
    redirect: nextRedirect,
    token: token,
    user: {
      id: user.id,
      email: user.email,
      handle: user.handle,
      name: user.name
    }
  });    
  } catch (error) {
    logger.error('Login error:', error);
    
    // Handle Zod validation errors with proper messages
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: error.errors[0]?.message || 'Validation failed',
        errorCode: ErrorCodes.VALIDATION_ERROR,
        details: error.errors
      });
    }
    
    // Handle other errors
    handleErrorWithResponse(error, res, 'Failed to login. Please try again.');
  }
};

export const loginVerify = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, code } = loginVerifySchema.parse(req.body);
    
    // Find valid OTP
    const otpRecord = await otpQueries.findByEmail(email.toLowerCase());
    
    if (!otpRecord) {
      return res.status(400).json({
        error: 'Invalid or expired OTP',
        errorCode: 'INVALID_OTP'
      });
    }
    
    // ✅ Check if OTP is expired
    const now = new Date();
    if (new Date(otpRecord.expiresAt) < now) {
      logger.warn(`OTP expired for ${email}. ExpiresAt: ${otpRecord.expiresAt}, Now: ${now}`);
      return res.status(400).json({
        error: 'OTP has expired. Please request a new one.',
        errorCode: 'OTP_EXPIRED'
      });
    }
    
    // ✅ Check if OTP is already used
    if (otpRecord.used) {
      logger.warn(`OTP already used for ${email}`);
      return res.status(400).json({
        error: 'This OTP has already been used. Please request a new one.',
        errorCode: 'OTP_ALREADY_USED'
      });
    }
    
    // Verify OTP
    const isValid = await verifyOTP(code, otpRecord.codeHash);
    if (!isValid) {
      return res.status(400).json({
        error: 'Invalid OTP code',
        errorCode: 'INVALID_OTP'
      });
    }
    
    // Mark OTP as used
    await otpQueries.markAsUsed(otpRecord.id);
    
    // Find or create user
    let user = await userQueries.findByEmail(email.toLowerCase());
    
    if (!user) {
      user = await userQueries.create(email.toLowerCase());
    }
    
    // Generate JWT token
    const token = generateJWT({
      userId: user.id,
      email: user.email,
      handle: user.handle || ''
    });
    
    // Set JWT token in cookie
    res.cookie('jwtToken', token, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'lax' : 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/' // ✅ ADD: Explicit path      
    });
    
    // Also create session for backward compatibility
    req.session!.userId = user.id;
    req.session!.userEmail = user.email;
    req.session!.userHandle = user.handle;

    // Log login event (for OTP-based login)
    try {
      await EventLogger.logLogin(user.id, {
        source: 'direct'
      });
    } catch (eventError) {
      logger.warn('Failed to log login event:', eventError);
    }

    const nextRedirect = user.profileCompleted
    ? '/dashboard'
    : '/signup/profile?email=' + encodeURIComponent(user.email);
  
  res.json({ 
    message: 'Login successful', 
    redirect: nextRedirect,
    token: token,
    user: {
      id: user.id,
      email: user.email,
      handle: user.handle,
      name: user.name
    }
  });    
  } catch (error) {
    logger.error('Login verify error:', error);
    
    // Handle Zod validation errors with proper messages
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: error.errors[0]?.message || 'Validation failed',
        errorCode: ErrorCodes.VALIDATION_ERROR,
        details: error.errors
      });
    }
    
    // Handle other errors
    handleErrorWithResponse(error, res, 'Failed to verify login. Please try again.');
  }
};

const changePasswordSchema = z.object({
  // ✅ currentPassword: NO length validation - just check if it's not empty
  // Wrong password will be caught by verifyPassword() check below
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string()
    .min(8, 'New password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),  
});

export const changePassword = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
    
    // Check if user is logged in
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        errorCode: ErrorCodes.UNAUTHORIZED
      });
    }
    
    // Find user
    const user = await userQueries.findByEmail(req.user.email);
    if (!user || !user.passwordHash) {
      return res.status(404).json({
        error: 'User not found or no password set',
        errorCode: ErrorCodes.USER_NOT_FOUND
      });
    }
    
    // Verify current password
    const isValidPassword = await verifyPassword(currentPassword, user.passwordHash);
    if (!isValidPassword) {
      return res.status(400).json({
        error: 'Current password is incorrect',
        errorCode: ErrorCodes.VALIDATION_ERROR
      });
    }
    
    // Check if new password is same as current password
    const isSamePassword = await verifyPassword(newPassword, user.passwordHash);
    if (isSamePassword) {
      return res.status(400).json({
        error: 'New password must be different from current password',
        errorCode: ErrorCodes.VALIDATION_ERROR
      });
    }
    
    // Hash new password
    const passwordHash = await hashPassword(newPassword);
    
    // Update password
    await userQueries.updatePassword(user.email, passwordHash);
    
    logger.info(`Password changed for user: ${user.email}`);
    
    return res.json({ 
      success: true,
      message: 'Password changed successfully' 
    });
  } catch (error) {
    logger.error('Change password error:', error);
    
    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: error.errors[0]?.message || 'Validation failed',
        errorCode: ErrorCodes.VALIDATION_ERROR,
        details: error.errors
      });
    }
    
    // Handle other errors
    handleErrorWithResponse(error, res, 'Failed to change password. Please try again.');
  }
};

export const logout = (req: Request, res: Response, next: NextFunction) => {
  try {
    // Get userId before clearing session
    const userId = req.session?.userId || null;

    // Log logout event (if userId available)
    if (userId) {
      EventLogger.logUserEvent(userId, EVENT_TYPES.LOGOUT, {}).catch((eventError) => {
        logger.warn('Failed to log logout event:', eventError);
      });
    }

   // Clear JWT cookie
   res.clearCookie('jwtToken', {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'lax' : 'strict',
    path: '/'
  });    
    
    // Also clear session if it exists (for backward compatibility)
    if (req.session) {
      req.session.destroy((err) => {
        if (err) {
          logger.error('Session destruction error:', err);
        }
      });
    }
    
    res.json({ message: 'Logged out successfully', redirect: '/auth' });
  } catch (error) {
    logger.error('Failed to logout:', error);
    return next(error);
  }
};

// ✅ ADD: Resend OTP Schema
const resendOtpSchema = z.object({
  email: z.string().email('Invalid email address'),
  type: z.enum(['signup', 'login', 'forgot']).optional()
});

// ✅ ADD: Resend OTP Function
export const resendOTP = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, type = 'signup' } = resendOtpSchema.parse(req.body);
    
    logger.info(`Resend OTP request for: ${email}, type: ${type}`);
    
    // Check if user exists (for signup/login)
    if (type === 'signup' || type === 'login') {
      const user = await userQueries.findByEmail(email.toLowerCase());
      
      if (type === 'signup') {
        // For signup: user should exist but not verified
        if (!user) {
          return res.status(404).json({
            error: 'No signup request found for this email. Please signup first.',
            errorCode: 'NO_SIGNUP_REQUEST'
          });
        }
        if (user.verified) {
          return res.status(409).json({
            error: 'Account already verified. Please login instead.',
            errorCode: 'ALREADY_VERIFIED'
          });
        }
      } else if (type === 'login') {
        // For login: user should exist
        if (!user) {
          return res.status(404).json({
            error: 'User not found. Please signup first.',
            errorCode: 'USER_NOT_FOUND'
          });
        }
      }
    } else if (type === 'forgot') {
      // For forgot password: user must exist
      const user = await userQueries.findByEmail(email.toLowerCase());
      if (!user) {
        return res.status(404).json({
          error: 'User not found',
          errorCode: 'USER_NOT_FOUND'
        });
      }
    }
    
    // Delete old OTP
    await otpQueries.deleteByEmail(email.toLowerCase());
    
    // Generate new OTP
    const otp = generateOTP(config.otp.codeLength);
    const hashedOTP = await hashOTP(otp);
    const expiresAt = new Date(Date.now() + config.otp.expiryMinutes * 60 * 1000);
    
    // Store OTP
    await otpQueries.create(email.toLowerCase(), hashedOTP, expiresAt);
    
    logger.info(`OTP created for ${email}`);
    
    // ✅ Send OTP via email (only in production)
    const emailSent = await emailService.sendOTP(email, otp, type);
    
    if (isProd) {
      if (!emailSent) {
        logger.error(`Email send failed for ${email} in production. Check SMTP configuration.`);
        return res.status(500).json({
          error: 'Failed to send verification email. Please check your email configuration or try again later.',
          errorCode: 'EMAIL_SEND_FAILED',
          details: 'SMTP email service is not configured or email sending failed. Please contact support.'
        });
      }
      logger.info(`✅ Email sent successfully to ${email}`);
    } else {
      logger.info(`Development mode: OTP ${otp} generated (not sent via email)`);
    }
    
    res.json({ 
      message: 'OTP sent to your email'
    });
  } catch (error) {
    logger.error('Resend OTP error:', error);
    
    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: error.errors[0]?.message || 'Validation failed',
        errorCode: ErrorCodes.VALIDATION_ERROR,
        details: error.errors
      });
    }
    
    handleErrorWithResponse(error, res, 'Failed to resend OTP. Please try again.');
  }
};
