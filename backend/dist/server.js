"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = __importDefault(require("./app"));
const env_1 = require("./config/env");
const logger_1 = require("./config/logger");
const db_1 = require("./config/db");
const database_1 = require("./config/database");
async function preWarmGroqAPI() {
    try {
        const groqApiKey = process.env.GROQ_API_KEY;
        if (!groqApiKey) {
            logger_1.logger.info('Groq API key not found, skipping pre-warm');
            return;
        }
        logger_1.logger.info('Pre-warming Groq API...');
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${groqApiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'llama-3.1-8b-instant',
                messages: [{ role: 'user', content: 'Ping' }],
                max_tokens: 5
            })
        });
        if (response.ok) {
            logger_1.logger.info('✅ Groq API pre-warmed successfully');
        }
        else {
            const errorText = await response.text();
            logger_1.logger.warn(`⚠️ Groq API pre-warm failed: ${response.status} ${errorText}`);
        }
    }
    catch (error) {
        logger_1.logger.warn('⚠️ Groq API pre-warm error:', error);
    }
}
async function startServer() {
    try {
        await db_1.db.query('SELECT 1');
        logger_1.logger.info('Database connected successfully');
        try {
            await (0, database_1.initializeDatabase)();
            logger_1.logger.info('Database tables initialized');
        }
        catch (dbError) {
            logger_1.logger.warn('Database initialization failed, continuing anyway:', dbError.message);
        }
        preWarmGroqAPI().catch(() => {
        });
        const server = app_1.default.listen(env_1.config.port, () => {
            logger_1.logger.info(`🚀 AI Twin server running on port ${env_1.config.port}`);
            logger_1.logger.info(`📊 Environment: ${env_1.config.nodeEnv}`);
            logger_1.logger.info(`🔗 OpenAI API configured: ${env_1.config.openaiApiKey ? 'Yes' : 'No'}`);
            logger_1.logger.info(`📧 Email configured: ${env_1.config.mail.smtp.user ? 'Yes' : 'No'}`);
            logger_1.logger.info(`✅ Database: Connected`);
        });
        server.on('error', (error) => {
            if (error.syscall !== 'listen') {
                throw error;
            }
            const bind = typeof env_1.config.port === 'string' ? 'Pipe ' + env_1.config.port : 'Port ' + env_1.config.port;
            switch (error.code) {
                case 'EACCES':
                    logger_1.logger.error(`${bind} requires elevated privileges`);
                    process.exit(1);
                    break;
                case 'EADDRINUSE':
                    logger_1.logger.error(`${bind} is already in use`);
                    process.exit(1);
                    break;
                default:
                    throw error;
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to start server:', error);
        process.exit(1);
    }
}
startServer();
//# sourceMappingURL=server.js.map