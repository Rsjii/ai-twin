import { Request, Response } from 'express';
import { db, userQueries, otpQueries } from '../../config/database';
import { EmailService, generateOTP, hashOTP, verifyOTP } from './authService';
import { logger } from '../../config/logger';
import { config } from '../../config/env';
import { z } from 'zod';

const emailService = new EmailService();

const loginStartSchema = z.object({
  email: z.string().email('Invalid email format'),
});

const loginVerifySchema = z.object({
  email: z.string().email('Invalid email format'),
  code: z.string().length(6, 'OTP must be 6 digits').regex(/^\d{6}$/, 'OTP must contain only numbers'),
});

export const loginStart = async (req: Request, res: Response) => {
  try {
    const { email } = loginStartSchema.parse(req.body);
    
    // Generate OTP
    const otp = generateOTP(config.otp.codeLength);
    const hashedOTP = await hashOTP(otp);
    
    // Set expiry time
    const expiresAt = new Date(Date.now() + config.otp.expiryMinutes * 60 * 1000);
    
    // Store OTP in database
    await otpQueries.create(email.toLowerCase(), hashedOTP, expiresAt);
    
    // Send OTP via email
    const emailSent = await emailService.sendOTP(email, otp);
    
    if (!emailSent) {
      return res.status(500).json({ error: 'Failed to send OTP email' });
    }
    
    res.json({ message: 'OTP sent successfully' });
  } catch (error) {
    logger.error('Login start error:', error);
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

export const logout = (req: Request, res: Response) => {
  req.session?.destroy((err) => {
    if (err) {
      logger.error('Session destruction error:', err);
      return res.status(500).json({ error: 'Failed to logout' });
    }
    res.json({ message: 'Logged out successfully' });
  });
};
