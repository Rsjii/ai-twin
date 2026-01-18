import { Request, Response } from 'express';
import { db } from '../config/database';
import { logger } from '../config/logger';
import { createError } from '../utils/errors';
import { handleErrorWithResponse } from '../utils/errorHandler';

/**
 * Test route - Basic health check
 */
export const testRoute = (_req: Request, res: Response) => {
  res.json({ message: 'Server is working!', timestamp: new Date().toISOString() });
};

/**
 * Test session endpoint - Check session data
 */
export const testSession = (req: Request, res: Response) => {
  res.json({ 
    session: req.session,
    userId: req.session?.userId,
    userEmail: req.session?.userEmail,
    testValue: (req.session as any)?.testValue
  });
};

/**
 * Test database route - Check database connection
 */
export const testDatabase = async (_req: Request, res: Response) => {
  try {
    const result = await db.query('SELECT COUNT(*) as count FROM "User"');
    res.json({ message: 'Database working!', userCount: result?.rows[0]?.count });
  } catch (error) {
    logger.error('Test database error:', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    handleErrorWithResponse(error, res, 'Database error');
  }
};

/**
 * Test auth route - Check authentication (no CSRF)
 */
export const testAuth = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) {
      throw createError.validation('Email required');
    }
    
    const { userQueries } = await import('../config/database');
    const user = await userQueries.findByEmail(email);
    return res.json({ message: 'Auth working!', userExists: !!user });
  } catch (error) {
    logger.error('Test auth error:', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    handleErrorWithResponse(error, res, 'Auth error');
  }
};

/**
 * Test OTP generation route (no CSRF)
 */
export const testOTP = async (req: Request, res: Response) => {
  try {
    const { email, code } = req.body;
    
    // If code is provided, this is a verification request
    if (code) {
      if (!email) {
        throw createError.validation('Email required for verification');
      }
      
      const { verifyOTP } = await import('../modules/auth/authService.js');
      const { otpQueries } = await import('../config/database.js');
      
      const storedOTP = await otpQueries.findByEmail(email.toLowerCase(), 'test');
      if (!storedOTP) {
        throw createError.notFound('No OTP found for this email');
      }
      
      if (new Date() > storedOTP.expiresAt) {
        throw createError.validation('OTP has expired');
      }
      
      if (storedOTP.used) {
        throw createError.validation('OTP has already been used');
      }
      
      const isValid = await verifyOTP(code, storedOTP.codeHash);
      if (!isValid) {
        throw createError.validation('Invalid OTP code');
      }
      
      req.session!.userId = 'test-user-id';
      req.session!.userEmail = email.toLowerCase();
      req.session!.userHandle = email.split('@')[0];
      
      await otpQueries.markAsUsed(storedOTP.id);
      
      logger.info('OTP verified (test)', { email });
      
      return res.json({ 
        message: 'OTP verification successful!', 
        email: email,
        userId: 'test-user-id'
      });
    }
    
    // If no code provided, this is a generation request
    if (!email) {
      throw createError.validation('Email required');
    }
    
    const { generateOTP, hashOTP } = await import('../modules/auth/authService.js');
    const otp = generateOTP(6);
    const hashedOTP = await hashOTP(otp);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    
    const { otpQueries } = await import('../config/database.js');
    await otpQueries.create(email.toLowerCase(), hashedOTP, expiresAt, 'test');
    
    logger.info('OTP generated (test)', { email });
    
    return res.json({ 
      message: 'OTP generated successfully!', 
      otp: otp,
      email: email 
    });
  } catch (error) {
    logger.error('Test OTP error:', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    handleErrorWithResponse(error, res, 'OTP operation error');
  }
};

/**
 * Very simple test page
 */
export const basicTest = (_req: Request, res: Response) => {
  res.send('<h1>Hello World!</h1><p>Server is working!</p>');
};

/**
 * Test profile route
 */
export const testProfile = async (req: any, res: Response) => {
  if (!req.user) {
    return res.redirect('/auth');
  }
  
  try {
    const { userQueries } = await import('../config/database');
    const user = await userQueries.findByEmail(req.user.email);
    if (!user) {
      return res.redirect('/auth');
    }

    res.json({
      success: true,
      user: user,
      csrfToken: res.locals['csrfToken']
    });
  } catch (error) {
    logger.error('Test profile error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.id
    });
    handleErrorWithResponse(error, res, 'Internal server error');
  }
};

