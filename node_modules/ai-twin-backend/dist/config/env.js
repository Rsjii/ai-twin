"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.config = {
    databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres.ovqfpobyqbbquvfxhibi:WzKZY+gg.H74hqZ@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres',
    openaiApiKey: process.env.OPENAI_API_KEY || 'sk-proj-6JAVLf9eQwUxU9LQl_5XAo6439h600bQ9n7263806063',
    sessionSecret: process.env.SESSION_SECRET || 'your-super-secret-session-key-here',
    mail: {
        from: process.env.MAIL_FROM || 'noreply@yourdomain.com',
        smtp: {
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: parseInt(process.env.SMTP_PORT || '587'),
            user: process.env.SMTP_USER || 'rsji1806@gmail.com',
            pass: process.env.SMTP_PASS || 'xtomoneelqsbgpql'
        }
    },
    nodeEnv: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '3000'),
    rateLimit: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
        maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '10000')
    },
    otp: {
        expiryMinutes: parseInt(process.env.OTP_EXPIRY_MINUTES || '10'),
        codeLength: parseInt(process.env.OTP_CODE_LENGTH || '6')
    }
};
exports.default = exports.config;
//# sourceMappingURL=env.js.map