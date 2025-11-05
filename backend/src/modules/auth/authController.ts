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
    const { email, password, referralCode } = signupSchema.parse(req.body);
    
    // Check if user already exists
    const existingUser = await userQueries.findByEmail(email.toLowerCase());
    if (existingUser) {
      throw createError.conflict('User already exists');
    }
    
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
    const emailSent = await emailService.sendOTP(email, otp);
    
    if (!emailSent) {
      throw createError.internal('Failed to send OTP');
    }
    
    res.json({ 
      message: 'OTP sent',
      otp: otp,
      redirect: '/signup/verify?email=' + encodeURIComponent(email)
    });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw createError.internal('Failed to signup', error);
  }
};

export const signupVerify = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, code } = signupVerifySchema.parse(req.body);
    
    // Find valid OTP
    const otpRecord = await otpQueries.findByEmail(email.toLowerCase());
    
    if (!otpRecord) {
      throw createError.validation('Invalid or expired OTP');
    }
    
    // Verify OTP
    const isValid = await verifyOTP(code, otpRecord.codeHash);
    if (!isValid) {
      throw createError.validation('Invalid OTP code');
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
    if (error instanceof AppError) {
      throw error;
    }
    throw createError.internal('Failed to verify signup', error);
  }
};

export const completeProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, name, handle, dob, phone, bio, profileImage } = completeProfileSchema.parse(req.body);
    
    // Update user profile
    await userQueries.updateProfile(email.toLowerCase(), name, handle, dob, phone, bio, profileImage);
    
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
    if (error instanceof AppError) {
      throw error;
    }
    throw createError.internal('Failed to complete profile', error);
  }
};

export const forgotPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = forgotPasswordSchema.parse(req.body);
    
    // Check if user exists
    const user = await userQueries.findByEmail(email.toLowerCase());
    if (!user) {
      throw createError.notFound('User not found', ErrorCodes.USER_NOT_FOUND);
    }
    
    // Generate OTP for password reset
    const otp = generateOTP(config.otp.codeLength);
    const hashedOTP = await hashOTP(otp);
    const expiresAt = new Date(Date.now() + config.otp.expiryMinutes * 60 * 1000);
    
    // Store OTP
    await otpQueries.create(email.toLowerCase(), hashedOTP, expiresAt);
    
    // Send OTP via email
    const emailSent = await emailService.sendOTP(email, otp);
    
    if (!emailSent) {
      throw createError.internal('Failed to send OTP email');
    }
    
    res.json({ 
      message: 'OTP sent for password reset', 
      otp: otp, // Include the actual OTP for development
      redirect: '/forgot-password/reset?email=' + encodeURIComponent(email)
    });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw createError.internal('Failed to process forgot password', error);
  }
};

export const forgotPasswordVerify = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, code } = signupVerifySchema.parse(req.body);
    
    // Find valid OTP
    const otpRecord = await otpQueries.findByEmail(email.toLowerCase());
    
    if (!otpRecord) {
      throw createError.validation('Invalid or expired OTP');
    }
    
    // Verify OTP
    const isValid = await verifyOTP(code, otpRecord.codeHash);
    if (!isValid) {
      throw createError.validation('Invalid OTP code');
    }
    
    // Mark OTP as used
    await otpQueries.markAsUsed(otpRecord.id);
    
    res.json({ 
      message: 'OTP verified successfully', 
      redirect: '/reset-password?email=' + encodeURIComponent(email)
    });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw createError.internal('Failed to verify forgot password', error);
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
    if (error instanceof AppError) {
      throw error;
    }
    throw createError.internal('Failed to reset password', error);
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
      throw createError.unauthorized('Invalid email or password');
    }
    
    // Check if user is active
    if (!user.active) {
      throw createError.forbidden('Account not activated. Please check your email for activation link.');
    }
    
    // Verify password
    const isValidPassword = await verifyPassword(password, user.passwordHash);
    if (!isValidPassword) {
      throw createError.unauthorized('Invalid email or password');
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
    if (error instanceof AppError) {
      throw error;
    }
    throw createError.internal('Failed to login', error);
  }
};

export const loginVerify = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, code } = loginVerifySchema.parse(req.body);
    
    // Find valid OTP
    const otpRecord = await otpQueries.findByEmail(email.toLowerCase());
    
    if (!otpRecord) {
      throw createError.validation('Invalid or expired OTP');
    }
    
    // Verify OTP
    const isValid = await verifyOTP(code, otpRecord.codeHash);
    if (!isValid) {
      throw createError.validation('Invalid OTP code');
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
    if (error instanceof AppError) {
      throw error;
    }
    throw createError.internal('Failed to verify login', error);
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
      throw createError.unauthorized();
    }
    
    // Find user
    const user = await userQueries.findByEmail(req.user.email);
    if (!user || !user.passwordHash) {
      throw createError.notFound('User not found or no password set', ErrorCodes.USER_NOT_FOUND);
    }
    
    // Verify current password
    const isValidPassword = await verifyPassword(currentPassword, user.passwordHash);
    if (!isValidPassword) {
      throw createError.validation('Current password is incorrect');
    }
    
    // Hash new password
    const passwordHash = await hashPassword(newPassword);
    
    // Update password
    await userQueries.updatePassword(user.email, passwordHash);
    
    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw createError.internal('Failed to change password', error);
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
