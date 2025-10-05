"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateInviteCode = exports.verifyProfileToken = exports.generateProfileToken = exports.verifyOTP = exports.hashOTP = exports.generateOTP = exports.EmailService = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const crypto_1 = __importDefault(require("crypto"));
const nodemailer_1 = __importDefault(require("nodemailer"));
const env_1 = require("../../config/env");
const logger_1 = require("../../config/logger");
class EmailService {
    constructor() {
        this.transporter = nodemailer_1.default.createTransport({
            host: env_1.config.mail.smtp.host,
            port: env_1.config.mail.smtp.port,
            secure: false,
            auth: {
                user: env_1.config.mail.smtp.user,
                pass: env_1.config.mail.smtp.pass,
            },
        });
    }
    async sendOTP(email, code) {
        try {
            const mailOptions = {
                from: env_1.config.mail.from,
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
            if (env_1.config.nodeEnv === 'development') {
                console.log('\n🔐 ===== OTP GENERATED =====');
                console.log(`📧 Email: ${email}`);
                console.log(`🔑 OTP Code: ${code}`);
                console.log('=============================\n');
                logger_1.logger.info(`OTP for ${email}: ${code}`);
                return true;
            }
            await this.transporter.sendMail(mailOptions);
            return true;
        }
        catch (error) {
            logger_1.logger.error('Failed to send OTP email:', error);
            return false;
        }
    }
}
exports.EmailService = EmailService;
const generateOTP = (length = 6) => {
    const digits = '0123456789';
    let otp = '';
    for (let i = 0; i < length; i++) {
        otp += digits[Math.floor(Math.random() * digits.length)];
    }
    return otp;
};
exports.generateOTP = generateOTP;
const hashOTP = async (otp) => {
    return bcryptjs_1.default.hash(otp, 10);
};
exports.hashOTP = hashOTP;
const verifyOTP = async (otp, hash) => {
    return bcryptjs_1.default.compare(otp, hash);
};
exports.verifyOTP = verifyOTP;
const generateProfileToken = (userId, handle) => {
    const payload = {
        userId,
        handle,
        exp: Math.floor(Date.now() / 1000) + (48 * 60 * 60),
    };
    const token = Buffer.from(JSON.stringify(payload)).toString('base64');
    const signature = crypto_1.default.createHmac('sha256', env_1.config.sessionSecret).update(token).digest('hex');
    return `${token}.${signature}`;
};
exports.generateProfileToken = generateProfileToken;
const verifyProfileToken = (token) => {
    try {
        const [payload, signature] = token.split('.');
        if (!payload || !signature)
            return null;
        const expectedSignature = crypto_1.default.createHmac('sha256', env_1.config.sessionSecret).update(payload).digest('hex');
        if (signature !== expectedSignature)
            return null;
        const decoded = JSON.parse(Buffer.from(payload, 'base64').toString());
        if (decoded.exp < Math.floor(Date.now() / 1000)) {
            return null;
        }
        return { userId: decoded.userId, handle: decoded.handle };
    }
    catch (error) {
        return null;
    }
};
exports.verifyProfileToken = verifyProfileToken;
const generateInviteCode = () => {
    return crypto_1.default.randomBytes(8).toString('hex');
};
exports.generateInviteCode = generateInviteCode;
//# sourceMappingURL=authService.js.map