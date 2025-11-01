import { Request, Response } from 'express';
import { db } from '../config/database';
import { logger } from '../config/logger';

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
  } catch (error: any) {
    res.status(500).json({ error: 'Database error', details: error.message });
  }
};

/**
 * Test auth route - Check authentication (no CSRF)
 */
export const testAuth = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }
    
    const { userQueries } = await import('../config/database');
    const user = await userQueries.findByEmail(email);
    return res.json({ message: 'Auth working!', userExists: !!user });
  } catch (error: any) {
    return res.status(500).json({ error: 'Auth error', details: error.message });
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
        return res.status(400).json({ error: 'Email required for verification' });
      }
      
      // Verify OTP
      const { verifyOTP } = await import('../modules/auth/authService.js');
      const { otpQueries } = await import('../config/database.js');
      
      // Get stored OTP
      const storedOTP = await otpQueries.findByEmail(email.toLowerCase());
      if (!storedOTP) {
        return res.status(400).json({ error: 'No OTP found for this email' });
      }
      
      // Check if OTP is expired
      if (new Date() > storedOTP.expires_at) {
        return res.status(400).json({ error: 'OTP has expired' });
      }
      
      // Check if OTP is already used
      if (storedOTP.used) {
        return res.status(400).json({ error: 'OTP has already been used' });
      }
      
      // Verify the code
      const isValid = await verifyOTP(code, storedOTP.codeHash);
      if (!isValid) {
        return res.status(400).json({ error: 'Invalid OTP code' });
      }
      
      // OTP is valid - create user session
      req.session!.userId = 'test-user-id';
      req.session!.userEmail = email.toLowerCase();
      req.session!.userHandle = email.split('@')[0];
      
      // Clean up used OTP
      await otpQueries.markAsUsed(storedOTP.id);
      
      console.log('\n✅ ===== OTP VERIFIED (TEST) =====');
      console.log(`📧 Email: ${email}`);
      console.log(`🔑 OTP Code: ${code}`);
      console.log('=====================================\n');
      
      return res.json({ 
        message: 'OTP verification successful!', 
        email: email,
        userId: 'test-user-id'
      });
    }
    
    // If no code provided, this is a generation request
    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }
    
    // Generate OTP
    const { generateOTP, hashOTP } = await import('../modules/auth/authService.js');
    const otp = generateOTP(6);
    const hashedOTP = await hashOTP(otp);
    
    // Set expiry time
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    
    // Store OTP in database
    const { otpQueries } = await import('../config/database.js');
    await otpQueries.create(email.toLowerCase(), hashedOTP, expiresAt);
    
    console.log('\n🔐 ===== OTP GENERATED (TEST) =====');
    console.log(`📧 Email: ${email}`);
    console.log(`🔑 OTP Code: ${otp}`);
    console.log('=====================================\n');
    
    return res.json({ 
      message: 'OTP generated successfully!', 
      otp: otp,
      email: email 
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'OTP operation error', details: error.message });
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
  } catch (error: any) {
    logger.error('Test profile error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

