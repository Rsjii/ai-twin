import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { Resend } from 'resend';
import { config, isProd } from '../../config/env';
import { logger } from '../../config/logger';

// ✅ FIXED OTP for development
const DEV_OTP = '123456';

// Email service - Using Resend API (HTTP-based, works on Railway)
export class EmailService {
  private resend: Resend;

  constructor() {
    const apiKey = config.mail.smtp.pass; // Use SMTP_PASS as Resend API key

    if (!apiKey) {
      logger.error('❌ [EMAIL] Resend API key not configured');
    } else if (!apiKey.startsWith('re_')) {
      logger.error('❌ [EMAIL] Invalid Resend API key format! API key should start with "re_"');
    } else {
      this.resend = new Resend(apiKey);
      logger.info('✅ [EMAIL] Resend API initialized successfully');
    }
  }

  async sendOTP(email: string, code: string, type: 'signup' | 'login' | 'forgot' = 'login'): Promise<boolean> {
    try {
      if (!config.mail.smtp.pass) {
        logger.error('❌ [EMAIL] Resend API key not configured');
        return false;
      }

      if (!this.resend) {
        logger.error('❌ [EMAIL] Resend API not initialized');
        return false;
      }

      if (isProd) {

        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
              <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f5f5f5;">
                <tr>
                  <td align="center" style="padding: 40px 20px;">
                    <table role="presentation" style="max-width: 600px; width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                      <tr>
                        <td style="padding: 40px 30px; text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px 8px 0 0;">
                          <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">AI Twin</h1>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 40px 30px;">
                          <h2 style="margin: 0 0 20px 0; color: #333333; font-size: 24px; font-weight: 600;">Verification Code</h2>
                          <p style="margin: 0 0 30px 0; color: #666666; font-size: 16px; line-height: 1.5;">
                            ${type === 'signup' ? 'Welcome to AI Twin! Use this code to complete your signup:' : type === 'forgot' ? 'Use this code to reset your password:' : 'Use this code to verify your login:'}
                          </p>
                          <div style="background-color: #f8f9fa; border: 2px dashed #667eea; border-radius: 8px; padding: 30px; text-align: center; margin: 30px 0;">
                            <div style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #667eea; font-family: 'Courier New', monospace;">
                              ${code}
                            </div>
                          </div>
                          <p style="margin: 20px 0 0 0; color: #999999; font-size: 14px; line-height: 1.5;">
                            This code will expire in <strong>${config.otp.expiryMinutes} minutes</strong>.
                          </p>
                          <p style="margin: 20px 0 0 0; color: #999999; font-size: 14px; line-height: 1.5;">
                            If you didn't request this code, please ignore this email or contact support if you have concerns.
                          </p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 30px; text-align: center; background-color: #f8f9fa; border-radius: 0 0 8px 8px;">
                          <p style="margin: 0; color: #999999; font-size: 12px;">
                            © ${new Date().getFullYear()} AI Twin. All rights reserved.
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </body>
            </html>
        `;

        try {
          const result = await this.resend.emails.send({
            from: config.mail.from || 'onboarding@resend.dev',
            to: email,
            subject: 'Your AI Twin Verification Code',
            html: htmlContent,
          });

          const { data, error } = result || { data: null, error: null };

          if (error) {
            const err = error as any;
            logger.error('❌ [EMAIL] Resend API error:', {
              statusCode: err?.statusCode,
              name: err?.name,
              message: err?.message || 'Unknown Resend API error',
            });
            return false;
          }

          logger.info(`✅ [EMAIL] OTP email sent successfully`, { emailId: data?.id });
          return true;
        } catch (error: any) {
          logger.error(`❌ [EMAIL] Failed to send OTP email:`, {
            message: error?.message || 'Unknown error',
          });
          return false;
        }
      }
      
      // Development: Don't send email
      return true;
    } catch (error: any) {
      logger.error('❌ [EMAIL] Failed to send OTP email:', error);
      return false;
    }
  }

  async sendContactEmail(name: string, email: string, subject: string, message: string): Promise<boolean> {
    try {
      if (!config.mail.smtp.pass || !this.resend) {
        logger.error('❌ [EMAIL] Resend API not configured. Cannot send contact email.');
        return false;
      }

      const supportEmail = config.mail.supportEmail || config.mail.from || 'onboarding@resend.dev';
      
      const htmlContent = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
            <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f5f5f5;">
              <tr>
                <td align="center" style="padding: 40px 20px;">
                  <table role="presentation" style="max-width: 600px; width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <tr>
                      <td style="padding: 40px 30px; text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px 8px 0 0;">
                        <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">New Contact Form Submission</h1>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 40px 30px;">
                        <h2 style="margin: 0 0 20px 0; color: #333333; font-size: 24px; font-weight: 600;">${subject}</h2>
                        <div style="margin-bottom: 30px;">
                          <p style="margin: 0 0 10px 0; color: #666666; font-size: 16px; line-height: 1.5;">
                            <strong>From:</strong> ${name} (${email})
                          </p>
                          <p style="margin: 0 0 20px 0; color: #666666; font-size: 16px; line-height: 1.5;">
                            <strong>Subject:</strong> ${subject}
                          </p>
                          <div style="background-color: #f8f9fa; border-left: 4px solid #667eea; padding: 20px; margin: 20px 0; border-radius: 4px;">
                            <p style="margin: 0; color: #333333; font-size: 16px; line-height: 1.6; white-space: pre-wrap;">${message.replace(/\n/g, '<br>')}</p>
                          </div>
                        </div>
                        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0;">
                          <p style="margin: 0; color: #999999; font-size: 14px; line-height: 1.5;">
                            You can reply directly to this email to respond to ${name}.
                          </p>
                        </div>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 30px; text-align: center; background-color: #f8f9fa; border-radius: 0 0 8px 8px;">
                        <p style="margin: 0; color: #999999; font-size: 12px;">
                          © ${new Date().getFullYear()} AI Twin. All rights reserved.
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
          </html>
      `;

      try {
        const { data, error } = await this.resend.emails.send({
          from: config.mail.from || 'onboarding@resend.dev',
          to: supportEmail,
          replyTo: email,
          subject: `Contact Form: ${subject}`,
          html: htmlContent,
        });

        if (error) {
          logger.error('❌ [EMAIL] Resend API error (contact form):', {
            statusCode: error?.statusCode,
            message: error?.message,
          });
          return false;
        }

        logger.info(`✅ [EMAIL] Contact form email sent successfully`, { emailId: data?.id });
        return true;
      } catch (error: any) {
        logger.error(`❌ [EMAIL] Failed to send contact form email:`, {
          message: error?.message || 'Unknown error',
        });
        return false;
      }
    } catch (error: any) {
      logger.error('❌ [EMAIL] Failed to send contact form email:', error);
      return false;
    }
  }
}

// OTP utilities
export const generateOTP = (length: number = 6): string => {
  // ✅ Development: Return fixed OTP "123456"
  if (!isProd) {
    return DEV_OTP;
  }
  
  // ✅ Production: Generate random OTP
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
