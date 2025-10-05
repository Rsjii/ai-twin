import { Request, Response } from 'express';
import { db, userQueries, otpQueries } from '../../config/database';
import { EmailService, generateOTP, hashOTP, verifyOTP, hashPassword, verifyPassword } from './authService';
import { logger } from '../../config/logger';
import { config } from '../../config/env';
import { z } from 'zod';
import { AuthenticatedRequest } from '../../middleware/auth';

const emailService = new EmailService();

const signupSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
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
});

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email format'),
});

const resetPasswordSchema = z.object({
  email: z.string().email('Invalid email format'),
  code: z.string().length(6, 'OTP must be 6 digits').regex(/^\d{6}$/, 'OTP must contain only numbers'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const signup = async (req: Request, res: Response) => {
  try {
    const { email, password } = signupSchema.parse(req.body);
    
    // Check if user already exists
    const existingUser = await userQueries.findByEmail(email.toLowerCase());
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists. Please login instead.' });
    }
    
    // Hash password
    const passwordHash = await hashPassword(password);
    
    // Create user with password (inactive)
    const user = await userQueries.create(email.toLowerCase(), undefined, passwordHash);
    
    // Generate OTP for account activation
    const otp = generateOTP(config.otp.codeLength);
    const hashedOTP = await hashOTP(otp);
    const expiresAt = new Date(Date.now() + config.otp.expiryMinutes * 60 * 1000);
    
    // Store OTP
    await otpQueries.create(email.toLowerCase(), hashedOTP, expiresAt);
    
    // Send OTP via email
    const emailSent = await emailService.sendOTP(email, otp);
    
    if (!emailSent) {
      return res.status(500).json({ error: 'Failed to send OTP email' });
    }
    
    res.json({ 
      message: 'OTP sent for account activation', 
      otp: otp, // Include the actual OTP for development
      redirect: '/signup/verify?email=' + encodeURIComponent(email)
    });
  } catch (error) {
    logger.error('Signup error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const signupVerify = async (req: Request, res: Response) => {
  try {
    const { email, code } = signupVerifySchema.parse(req.body);
    
    // Find valid OTP
    const otpRecord = await otpQueries.findByEmail(email.toLowerCase());
    
    if (!otpRecord) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }
    
    // Verify OTP
    const isValid = await verifyOTP(code, otpRecord.codeHash);
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid OTP code' });
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
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const completeProfile = async (req: Request, res: Response) => {
  try {
    const { email, name, handle, dob, phone, bio } = completeProfileSchema.parse(req.body);
    
    // Update user profile
    await userQueries.updateProfile(email.toLowerCase(), name, handle, dob, phone, bio);
    
    // Find user and create session
    const user = await userQueries.findByEmail(email.toLowerCase());
    
    // Create session
    req.session!.userId = user.id;
    req.session!.userEmail = user.email;
    req.session!.userHandle = user.handle;
    
    // Explicitly save session
    req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
        return res.status(500).json({ error: 'Session error' });
      }
      
      res.json({ 
        message: 'Profile completed successfully', 
        redirect: '/dashboard'
      });
    });
  } catch (error) {
    logger.error('Complete profile error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email } = forgotPasswordSchema.parse(req.body);
    
    // Check if user exists
    const user = await userQueries.findByEmail(email.toLowerCase());
    if (!user) {
      return res.status(400).json({ error: 'User not found' });
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
      return res.status(500).json({ error: 'Failed to send OTP email' });
    }
    
    res.json({ 
      message: 'OTP sent for password reset', 
      otp: otp, // Include the actual OTP for development
      redirect: '/forgot-password/reset?email=' + encodeURIComponent(email)
    });
  } catch (error) {
    logger.error('Forgot password error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const forgotPasswordVerify = async (req: Request, res: Response) => {
  try {
    const { email, code } = signupVerifySchema.parse(req.body);
    
    // Find valid OTP
    const otpRecord = await otpQueries.findByEmail(email.toLowerCase());
    
    if (!otpRecord) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }
    
    // Verify OTP
    const isValid = await verifyOTP(code, otpRecord.codeHash);
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid OTP code' });
    }
    
    // Mark OTP as used
    await otpQueries.markAsUsed(otpRecord.id);
    
    res.json({ 
      message: 'OTP verified successfully', 
      redirect: '/reset-password?email=' + encodeURIComponent(email)
    });
  } catch (error) {
    logger.error('Forgot password verify error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const resetPassword = async (req: Request, res: Response) => {
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
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    res.status(500).json({ error: 'Internal server error' });
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

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    
    // Find user
    const user = await userQueries.findByEmail(email.toLowerCase());
    
    if (!user || !user.passwordHash) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }
    
    // Check if user is active
    if (!user.active) {
      return res.status(400).json({ error: 'Account not activated. Please check your email for activation link.' });
    }
    
    // Verify password
    const isValidPassword = await verifyPassword(password, user.passwordHash);
    if (!isValidPassword) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }
    
    // Create session
    req.session!.userId = user.id;
    req.session!.userEmail = user.email;
    req.session!.userHandle = user.handle;
    
    // Explicitly save session
    req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
        return res.status(500).json({ error: 'Session error' });
      }
      
      res.json({ message: 'Login successful', redirect: '/dashboard' });
    });
  } catch (error) {
    logger.error('Login error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const loginVerify = async (req: Request, res: Response) => {
  try {
    const { email, code } = loginVerifySchema.parse(req.body);
    
    // Find valid OTP
    const otpRecord = await otpQueries.findByEmail(email.toLowerCase());
    
    if (!otpRecord) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }
    
    // Verify OTP
    const isValid = await verifyOTP(code, otpRecord.codeHash);
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid OTP code' });
    }
    
    // Mark OTP as used
    await otpQueries.markAsUsed(otpRecord.id);
    
    // Find or create user
    let user = await userQueries.findByEmail(email.toLowerCase());
    
    if (!user) {
      user = await userQueries.create(email.toLowerCase());
    }
    
    // Create session
    req.session!.userId = user.id;
    req.session!.userEmail = user.email;
    req.session!.userHandle = user.handle;
    
    res.json({ message: 'Login successful', redirect: '/dashboard' });
  } catch (error) {
    logger.error('Login verify error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};

const changePasswordSchema = z.object({
  currentPassword: z.string().min(6, 'Current password must be at least 6 characters'),
  newPassword: z.string().min(6, 'New password must be at least 6 characters'),
});

export const changePassword = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
    
    // Check if user is logged in
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Find user
    const user = await userQueries.findByEmail(req.user.email);
    if (!user || !user.passwordHash) {
      return res.status(400).json({ error: 'User not found or no password set' });
    }
    
    // Verify current password
    const isValidPassword = await verifyPassword(currentPassword, user.passwordHash);
    if (!isValidPassword) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }
    
    // Hash new password
    const passwordHash = await hashPassword(newPassword);
    
    // Update password
    await userQueries.updatePassword(user.email, passwordHash);
    
    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    logger.error('Change password error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const logout = (req: AuthenticatedRequest, res: Response) => {
  req.session?.destroy((err) => {
    if (err) {
      logger.error('Session destruction error:', err);
      return res.status(500).json({ error: 'Failed to logout' });
    }
    res.json({ message: 'Logged out successfully', redirect: '/auth' });
  });
};
