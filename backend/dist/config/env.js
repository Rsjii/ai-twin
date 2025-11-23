"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.openai = exports.config = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const envPath = path_1.default.resolve(__dirname, '../../.env');
dotenv_1.default.config({ path: envPath });
exports.config = {
    databaseUrl: process.env['DATABASE_URL'],
    openaiApiKey: process.env['OPENAI_API_KEY'],
    groqApiKey: process.env['GROQ_API_KEY'],
    sessionSecret: process.env['SESSION_SECRET'],
    mail: {
        from: process.env['MAIL_FROM'],
        smtp: {
            host: process.env['SMTP_HOST'],
            port: Number(process.env['SMTP_PORT']),
            user: process.env['SMTP_USER'],
            pass: process.env['SMTP_PASS']
        }
    },
    google: {
        clientId: process.env['GOOGLE_CLIENT_ID'],
        clientSecret: process.env['GOOGLE_CLIENT_SECRET'],
        callbackURL: process.env['GOOGLE_CALLBACK_URL']
    },
    nodeEnv: process.env['NODE_ENV'],
    port: Number(process.env['PORT']),
    rateLimit: {
        windowMs: Number(process.env['RATE_LIMIT_WINDOW_MS']),
        maxRequests: Number(process.env['RATE_LIMIT_MAX_REQUESTS'])
    },
    otp: {
        expiryMinutes: Number(process.env['OTP_EXPIRY_MINUTES']),
        codeLength: Number(process.env['OTP_CODE_LENGTH'])
    }
};
exports.openai = {
    apiKey: process.env['OPENAI_API_KEY'],
};
exports.default = exports.config;
//# sourceMappingURL=env.js.map