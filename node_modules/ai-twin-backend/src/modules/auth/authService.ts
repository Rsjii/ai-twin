import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { config } from '../../config/env';
import { logger } from '../../config/logger';

// Email service
export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: config.mail.smtp.host,
      port: config.mail.smtp.port,
      secure: false,
      auth: {
        user: config.mail.smtp.user,
        pass: config.mail.smtp.pass,
      },
    });
  }

  async sendOTP(email: string, code: string): Promise<boolean> {
    try {
      const mailOptions = {
        from: config.mail.from,
        to: email,
        subject: 'Your AI Twin Login Code',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #333;">Your AI Twin Login Code</h2>
            <p>Your verification code is:</p>
            <div style="background-color: #f4f4f4; padding: 20px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px; margin: 20px 0; border-radius: 8px;">
              ${code}
            </div>
            <p>This code will expire in ${config.otp.expiryMinutes} minutes.</p>
            <p style="color: #666; font-size: 12px;">If you didn't request this code, please ignore this email.</p>
          </div>
        `,
      };

      // Development mode: Log to console + try to send actual email
      if (config.nodeEnv === 'development') {
        console.log('\n🔐 ===== OTP GENERATED =====');
        console.log(`📧 Email: ${email}`);
        console.log(`🔑 OTP Code: ${code}`);
        console.log('=============================\n');
        logger.info(`OTP for ${email}: ${code}`);
        
        // Try to send actual email in development
        try {
          await this.transporter.sendMail(mailOptions);
          logger.info(`✅ OTP email sent successfully to ${email}`);
          return true;
        } catch (emailError: any) {
          logger.warn(`⚠️ Failed to send OTP email in development:`, emailError?.message || emailError);
          // Still return true so signup doesn't fail - OTP is in console + response
          return true;
        }
      }

      // Production mode: Send actual email
      try {
        await this.transporter.sendMail(mailOptions);
        logger.info(`✅ OTP email sent successfully to ${email}`);
        return true;
      } catch (error: any) {
        logger.error(`❌ Failed to send OTP email to ${email}:`, error?.message || error);
        
        // Log error details
        if (error instanceof Error) {
          logger.error(`Email error: ${error.message}`);
        }
        
        return false;
      }
    } catch (error) {
      logger.error('Failed to send OTP email:', error);
      return false;
    }
  }  
}

// OTP utilities
export const generateOTP = (length: number = 6): string => {
  const digits = '0123456789';
  let otp = '';
  for (let i = 0; i < length; i++) {
    otp += digits[Math.floor(Math.random() * digits.length)];
  }
  return otp;
};

export const hashOTP = async (otp: string): Promise<string> => {
  return bcrypt.hash(otp, 10);
};

export const verifyOTP = async (otp: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(otp, hash);
};

// Password utilities
export const hashPassword = async (password: string): Promise<string> => {
  return bcrypt.hash(password, 12);
};

export const verifyPassword = async (password: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};

// Token utilities for public profiles
export const generateProfileToken = (userId: string, handle: string): string => {
  const payload = {
    userId,
    handle,
    exp: Math.floor(Date.now() / 1000) + (48 * 60 * 60), // 48 hours
  };
  
  const token = Buffer.from(JSON.stringify(payload)).toString('base64');
  const signature = crypto.createHmac('sha256', config.sessionSecret).update(token).digest('hex');
  
  return `${token}.${signature}`;
};

export const verifyProfileToken = (token: string): { userId: string; handle: string } | null => {
  try {
    const [payload, signature] = token.split('.');
    if (!payload || !signature) return null;
    
    const expectedSignature = crypto.createHmac('sha256', config.sessionSecret).update(payload).digest('hex');
    if (signature !== expectedSignature) return null;
    
    const decoded = JSON.parse(Buffer.from(payload, 'base64').toString());
    
    if (decoded.exp < Math.floor(Date.now() / 1000)) {
      return null; // Token expired
    }
    
    return { userId: decoded.userId, handle: decoded.handle };
  } catch (error) {
    return null;
  }
};

// Invite code generation
export const generateInviteCode = (): string => {
  return crypto.randomBytes(8).toString('hex');
};
