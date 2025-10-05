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
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Your AI Twin Login Code</h2>
            <p>Your verification code is:</p>
            <div style="background-color: #f4f4f4; padding: 20px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px; margin: 20px 0;">
              ${code}
            </div>
            <p>This code will expire in 10 minutes.</p>
            <p>If you didn't request this code, please ignore this email.</p>
          </div>
        `,
      };

      if (config.nodeEnv === 'development') {
        console.log('\n🔐 ===== OTP GENERATED =====');
        console.log(`📧 Email: ${email}`);
        console.log(`🔑 OTP Code: ${code}`);
        console.log('=============================\n');
        logger.info(`OTP for ${email}: ${code}`);
        return true;
      }

      await this.transporter.sendMail(mailOptions);
      return true;
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
