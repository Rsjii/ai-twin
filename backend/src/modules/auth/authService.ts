import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { config, isProd, isDev } from '../../config/env';
import { logger } from '../../config/logger';

// ✅ FIXED OTP for development
const DEV_OTP = '123456';

// Email service
export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    // ✅ ADD: Log SMTP config (password hidden)
    logger.info('📧 Initializing SMTP transporter...', {
      host: config.mail.smtp.host,
      port: config.mail.smtp.port,
      user: config.mail.smtp.user,
      hasPassword: !!config.mail.smtp.pass,
      from: config.mail.from,
      isProd: isProd,
      NODE_ENV: config.nodeEnv,
      APP_ENV: config.appEnv,
    });

    this.transporter = nodemailer.createTransport({
      host: config.mail.smtp.host,
      port: config.mail.smtp.port,
      secure: false, // Port 587 uses STARTTLS
      requireTLS: true, // ✅ ADD: Force TLS for Gmail
      auth: {
        user: config.mail.smtp.user,
        pass: config.mail.smtp.pass,
      },
      tls: {
        rejectUnauthorized: false, // Allow self-signed certs
        minVersion: 'TLSv1.2', // ✅ ADD: Minimum TLS version
      },
      connectionTimeout: 30000, // ✅ INCREASE: 30 seconds for Railway
      greetingTimeout: 30000, // ✅ INCREASE: 30 seconds
      socketTimeout: 30000, // ✅ INCREASE: 30 seconds
      // ✅ ADD: Debug mode for Railway
      debug: isProd, // Enable debug logs in production
      logger: isProd, // Enable logger in production
    });

    // ✅ ADD: Verify connection on startup
    this.transporter.verify((error, success) => {
      if (error) {
        const err = error as any;
        logger.error('❌ SMTP connection verification FAILED:', {
          error: error.message,
          code: err.code,
          command: err.command,
          response: err.response,
          responseCode: err.responseCode,
          responseMessage: err.responseMessage,
          errno: err.errno,
          syscall: err.syscall,
          hostname: err.hostname,
        });
      } else {
        logger.info('✅ SMTP connection verified successfully!');
      }
    });
  }

  async sendOTP(email: string, code: string, type: 'signup' | 'login' | 'forgot' = 'login'): Promise<boolean> {
    try {
      logger.info('📧 [EMAIL] Starting sendOTP...', {
        email,
        type,
        isProd,
        NODE_ENV: config.nodeEnv,
        APP_ENV: config.appEnv,
        hasHost: !!config.mail.smtp.host,
        hasUser: !!config.mail.smtp.user,
        hasPass: !!config.mail.smtp.pass,
      });

      // ✅ Check if SMTP credentials are configured
      if (!config.mail.smtp.host || !config.mail.smtp.user || !config.mail.smtp.pass) {
        logger.error('❌ [EMAIL] SMTP credentials not configured. Missing:', {
          host: !config.mail.smtp.host,
          user: !config.mail.smtp.user,
          pass: !config.mail.smtp.pass,
          actualValues: {
            host: config.mail.smtp.host || 'MISSING',
            user: config.mail.smtp.user || 'MISSING',
            pass: config.mail.smtp.pass ? 'SET (hidden)' : 'MISSING',
          }
        });
        return false;
      }

      logger.info('✅ [EMAIL] SMTP credentials check passed');

      // ✅ Production: Must send email
      if (isProd) {
        logger.info('🚀 [EMAIL] Production mode - will send email');
        const mailOptions = {
          from: config.mail.from || config.mail.smtp.user,
          to: email,
          subject: 'Your AI Twin Verification Code',
          html: `
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
          `,
        };

        logger.info('📧 [EMAIL] Mail options prepared:', {
          from: mailOptions.from,
          to: mailOptions.to,
          subject: mailOptions.subject,
        });

        try {
          logger.info(`📧 [EMAIL] Attempting to send OTP email to ${email} via ${config.mail.smtp.host}:${config.mail.smtp.port}`);
          logger.info(`🌐 [EMAIL] Railway environment check:`, {
            RAILWAY_ENVIRONMENT: process.env.RAILWAY_ENVIRONMENT || 'NOT_SET',
            RAILWAY_SERVICE_NAME: process.env.RAILWAY_SERVICE_NAME || 'NOT_SET',
            RAILWAY_DEPLOYMENT_ID: process.env.RAILWAY_DEPLOYMENT_ID || 'NOT_SET',
          });
          
          // ✅ ADD: Verify transporter before sending with timeout
          logger.info('🔍 [EMAIL] Verifying transporter connection...');
          const verifyStart = Date.now();
          try {
            await Promise.race([
              this.transporter.verify(),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Verification timeout after 30s')), 30000)
              )
            ]);
            const verifyDuration = Date.now() - verifyStart;
            logger.info(`✅ [EMAIL] Transporter verified successfully in ${verifyDuration}ms`);
          } catch (verifyError: any) {
            const verifyDuration = Date.now() - verifyStart;
            logger.error(`❌ [EMAIL] Transporter verification failed after ${verifyDuration}ms:`, {
              error: verifyError.message,
              code: verifyError.code,
              errno: verifyError.errno,
              syscall: verifyError.syscall,
              hostname: verifyError.hostname,
            });
            // Continue anyway - sometimes verify fails but send works
            logger.warn('⚠️ [EMAIL] Continuing with email send despite verification failure...');
          }
          
          logger.info('📤 [EMAIL] Sending email now...');
          const sendStart = Date.now();
          const info = await Promise.race([
            this.transporter.sendMail(mailOptions),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Send timeout after 30s')), 30000)
            )
          ]) as any;
          const sendDuration = Date.now() - sendStart;
          logger.info(`✅ [EMAIL] Email sent in ${sendDuration}ms`);
          
          logger.info(`✅ [EMAIL] OTP email sent successfully to ${email}`, {
            messageId: info.messageId,
            response: info.response,
            accepted: info.accepted,
            rejected: info.rejected,
          });
          return true;
        } catch (error: any) {
          const errorDetails = {
            message: error?.message || 'Unknown error',
            code: error?.code || 'NO_CODE',
            command: error?.command || 'N/A',
            response: error?.response || 'N/A',
            responseCode: error?.responseCode || 'N/A',
            responseMessage: error?.responseMessage || 'N/A',
            errno: error?.errno,
            syscall: error?.syscall,
            hostname: error?.hostname,
            stack: error?.stack ? error.stack.substring(0, 1000) : 'N/A'
          };
          
          logger.error(`❌ [EMAIL] Failed to send OTP email to ${email}:`, errorDetails);
          logger.error(`❌ [EMAIL] Full error object:`, JSON.stringify(errorDetails, null, 2));
          
          // ✅ ADD: Railway-specific error detection
          logger.error(`🌐 [EMAIL] Railway environment info:`, {
            RAILWAY_ENVIRONMENT: process.env.RAILWAY_ENVIRONMENT || 'NOT_SET',
            RAILWAY_SERVICE_NAME: process.env.RAILWAY_SERVICE_NAME || 'NOT_SET',
            RAILWAY_DEPLOYMENT_ID: process.env.RAILWAY_DEPLOYMENT_ID || 'NOT_SET',
            isRailway: !!process.env.RAILWAY_ENVIRONMENT,
          });
          
          // ✅ ADD: Specific error messages
          if (error?.code === 'EAUTH') {
            logger.error('❌ [EMAIL] SMTP Authentication failed! Check SMTP_USER and SMTP_PASS (must be App Password for Gmail)');
            logger.error('💡 [EMAIL] Gmail requires App Password, not regular password. Generate at: https://myaccount.google.com/apppasswords');
          } else if (error?.code === 'ETIMEDOUT' || error?.code === 'ECONNREFUSED') {
            logger.error('❌ [EMAIL] SMTP Connection failed! Check SMTP_HOST and SMTP_PORT');
            logger.error('💡 [EMAIL] Railway might be blocking outbound SMTP connections. Check firewall rules.');
          } else if (error?.code === 'ECONNRESET') {
            logger.error('❌ [EMAIL] SMTP Connection reset! Gmail might be blocking Railway IP addresses');
            logger.error('💡 [EMAIL] Gmail may block connections from cloud providers. Try using a different email service or whitelist Railway IPs.');
          } else if (error?.message?.includes('timeout')) {
            logger.error('❌ [EMAIL] SMTP Timeout! Railway network might be slow or blocked');
          }
          
          return false;          
        }
      }
      
      // ✅ Development: Don't send email, just log
      logger.info(`📧 [EMAIL] Development mode - OTP generated for ${email}: ${code} (email not sent)`);
      return true;
      
    } catch (error: any) {
      logger.error('❌ [EMAIL] Failed to send OTP email (outer catch):', {
        error: error?.message,
        stack: error?.stack?.substring(0, 500),
      });
      return false;
    }
  }

  async sendContactEmail(name: string, email: string, subject: string, message: string): Promise<boolean> {
    try {
      // ✅ Check if SMTP credentials are configured
      if (!config.mail.smtp.host || !config.mail.smtp.user || !config.mail.smtp.pass) {
        logger.error('SMTP credentials not configured. Cannot send contact email.');
        return false;
      }

      const supportEmail = config.mail.from || config.mail.smtp.user;
      
      const mailOptions = {
        from: config.mail.from || config.mail.smtp.user,
        to: supportEmail,
        replyTo: email,
        subject: `Contact Form: ${subject}`,
        html: `
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
        `,
      };

      try {
        logger.info(`Attempting to send contact form email from ${email} to ${supportEmail}`);
        await this.transporter.sendMail(mailOptions);
        logger.info(`✅ Contact form email sent successfully to ${supportEmail}`);
        return true;
      } catch (error: any) {
        const errorDetails = {
          message: error?.message || 'Unknown error',
          code: error?.code || 'NO_CODE',
          stack: error?.stack ? error.stack.substring(0, 500) : 'N/A'
        };
        
        logger.error(`❌ Failed to send contact form email:`, errorDetails);
        return false;
      }
    } catch (error) {
      logger.error('Failed to send contact form email (outer catch):', error);
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
