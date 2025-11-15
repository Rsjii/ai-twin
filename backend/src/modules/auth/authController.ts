import { Request, Response, NextFunction } from 'express';
import { db, userQueries, otpQueries } from '../../config/database';
import { EmailService, generateOTP, hashOTP, verifyOTP, hashPassword, verifyPassword , generateInviteCode} from './authService';
import { logger } from '../../config/logger';
import { config } from '../../config/env';
import { z } from 'zod';
import { AuthenticatedRequest } from '../../middleware/auth';
import { generateJWT } from '../../services/jwtService';
import { AppError, createError, ErrorCodes } from '../../utils/errors';

const emailService = new EmailService();

const signupSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  referralCode: z.string().optional(),
});

const signupVerifySchema = z.object({
  email: z.string().email('Invalid email format'),
  code: z.string().length(6, 'OTP must be 6 digits').regex(/^\d{6}$/, 'OTP must contain only numbers'),
});

const completeProfileSchema = z.object({
  email: z.string().email('Invalid email format'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  handle: z.string().min(3, 'Handle must be at least 3 characters').optional(),
  dob: z.string().optional(),
  phone: z.string().optional(),
  bio: z.string().optional(),
  profileImage: z.string().nullable().optional(),
});

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email format'),
});

const resetPasswordSchema = z.object({
  email: z.string().email('Invalid email format'),
  code: z.string().length(6, 'OTP must be 6 digits').regex(/^\d{6}$/, 'OTP must contain only numbers'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
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
      logger.warn(`Signup failed: User already exists - ${email}`);
      return res.status(409).json({
        error: 'User already exists. Please login instead.',
        errorCode: 'USER_ALREADY_EXISTS'
      });
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

// If they were referred, link them
if (referrerId) {
  const { db, generateId } = await import('../../config/database');
  
  // Create invite record linking them
  const inviteId = generateId();
  await db.query(
    'INSERT INTO "Invite" (id, code, "inviterId", "acceptedBy") VALUES ($1, $2, $3, $4)',
    [inviteId, referralCode, referrerId, user.id]
  );
  
  // Log event
  const eventId = generateId();
  await db.query(
    'INSERT INTO "Event" (id, "userId", type, meta) VALUES ($1, $2, $3, $4)',
    [eventId, referrerId, 'invite_accepted', JSON.stringify({ referredUserId: user.id })]
  );
}    
    
  // Generate OTP
    const otp = generateOTP(config.otp.codeLength);
    const hashedOTP = await hashOTP(otp);
    const expiresAt = new Date(Date.now() + config.otp.expiryMinutes * 60 * 1000);
    
    await otpQueries.create(email.toLowerCase(), hashedOTP, expiresAt);
    logger.info(`OTP created for ${email}`);
    
    const emailSent = await emailService.sendOTP(email, otp);
    
    // Don't fail signup if email doesn't send (OTP is in response for frontend)
    if (!emailSent) {
      logger.warn(`Email send failed for ${email}, but continuing signup. OTP is in response.`);
      // Continue anyway - OTP is in response for frontend display
    } else {
      logger.info(`Email sent successfully to ${email}`);
    }
    
    logger.info(`Signup successful for ${email}, OTP sent`);
    
    res.json({ 
      message: 'OTP sent',
      otp: otp, // Keep OTP in response for frontend (for now)
      redirect: '/signup/verify?email=' + encodeURIComponent(email)
    });
  } catch (error) {
    logger.error('Signup error:', error);
    if (error instanceof AppError) {
      // Don't throw, send proper error response
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
    if (error instanceof AppError) {
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

export const completeProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, name, handle, dob, phone, bio, profileImage } = completeProfileSchema.parse(req.body);
    
    // Update user profile (provide defaults for optional fields)
    await userQueries.updateProfile(
      email.toLowerCase(), 
      name, 
      handle || '', 
      dob || '', 
      phone || '', 
      bio || '', 
      profileImage || null
    );
    
    // Find user and generate JWT
    const user = await userQueries.findByEmail(email.toLowerCase());
    
    // Generate JWT token
    const token = generateJWT({
      userId: user.id,
      email: user.email,
      handle: user.handle || ''
    });
    
    // Set JWT token in cookie
    res.cookie('jwtToken', token, {
      httpOnly: true,
      secure: process.env['NODE_ENV'] === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
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
  } catch (error) {
    logger.error('Complete profile error:', error);
    if (error instanceof AppError) {
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
    
    // Send OTP via email
    const emailSent = await emailService.sendOTP(email, otp);
    
    // Don't fail if email doesn't send (OTP is in response for frontend)
    if (!emailSent) {
      logger.warn(`Email send failed for ${email}, but continuing. OTP is in response.`);
    }
    
    res.json({ 
      message: 'OTP sent for password reset', 
      otp: otp, // Include the actual OTP for development
      redirect: '/forgot-password/reset?email=' + encodeURIComponent(email)
    });
  } catch (error) {
    logger.error('Forgot password error:', error);
    if (error instanceof AppError) {
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

export const forgotPasswordVerify = async (req: Request, res: Response, next: NextFunction) => {
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
    if (error instanceof AppError) {
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

export const resetPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = z.object({
      email: z.string().email('Invalid email format'),
      password: z.string().min(6, 'Password must be at least 6 characters'),
    }).parse(req.body);
    
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
    if (error instanceof AppError) {
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

const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
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
        error: 'Account not activated. Please check your email for activation link.',
        errorCode: 'ACCOUNT_NOT_ACTIVATED'
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
      secure: process.env['NODE_ENV'] === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
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
  } catch (error) {
    logger.error('Login error:', error);
    if (error instanceof AppError) {
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
      secure: process.env['NODE_ENV'] === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });
    
    // Also create session for backward compatibility
    req.session!.userId = user.id;
    req.session!.userEmail = user.email;
    req.session!.userHandle = user.handle;
    
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
  } catch (error) {
    logger.error('Login verify error:', error);
    if (error instanceof AppError) {
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

const changePasswordSchema = z.object({
  currentPassword: z.string().min(6, 'Current password must be at least 6 characters'),
  newPassword: z.string().min(6, 'New password must be at least 6 characters'),
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
    
    // Handle AppError
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        error: error.message,
        errorCode: error.errorCode
      });
    }
    
    // Handle unexpected errors
    return res.status(500).json({
      error: 'Failed to change password. Please try again.',
      errorCode: ErrorCodes.INTERNAL_ERROR
    });
  }
};

export const logout = (req: Request, res: Response, next: NextFunction) => {
  try {
    // Clear JWT cookie
    res.clearCookie('jwtToken');
    
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
    if (error instanceof AppError) {
      throw error;
    }
    throw createError.internal('Failed to logout', error);
  }
};
