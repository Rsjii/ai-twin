import app from './app';
import { config, isProd } from './config/env';
import { logger } from './config/logger';
import { db } from './config/db';
import { initializeDatabase } from './config/database';
import { initializePostHog, shutdownPostHog } from './services/posthogService';
import { validateEnv } from './config/envValidation';

// ✅ NEW: Global process error handlers (MUST be before startServer)
process.on('uncaughtException', (error: Error) => {
  logger.error('❌ UNCAUGHT EXCEPTION - Process will exit', {
    name: error.name,
    message: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString(),
  });
  
  // Attempt graceful shutdown
  shutdownPostHog();
  
  // Exit with error code so process manager restarts
  process.exit(1);
});

process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  logger.error('❌ UNHANDLED REJECTION - Process will exit', {
    reason: reason instanceof Error ? {
      name: reason.name,
      message: reason.message,
      stack: reason.stack,
    } : reason,
    promise: promise.toString(),
    timestamp: new Date().toISOString(),
  });
  
  // Attempt graceful shutdown
  shutdownPostHog();
  
  // Exit with error code so process manager restarts
  process.exit(1);
});

// ✅ Pre-warm Groq API function
async function preWarmGroqAPI(): Promise<void> {
  try {
    const groqApiKey = process.env.GROQ_API_KEY;
    if (!groqApiKey) {
      logger.info('Groq API key not found, skipping pre-warm');
      return;
    }

    logger.info('Pre-warming Groq API...');
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
      logger.info('✅ Groq API pre-warmed successfully');
    } else {
      const errorText = await response.text();
      logger.warn(`⚠️ Groq API pre-warm failed: ${response.status} ${errorText}`);
    }
  } catch (error) {
    logger.warn('⚠️ Groq API pre-warm error:', error);
    // Don't fail startup if pre-warm fails
  }
}

async function startServer() {
  try {
    // ✅ Validate environment variables first (fail fast)
    validateEnv();
    
    // Initialize PostHog
    initializePostHog();

    // Test database connection
    await db.query('SELECT 1');
    logger.info('Database connected successfully');

    // Initialize database tables (with retry logic)
    try {
      await initializeDatabase();
      logger.info('Database tables initialized');
    } catch (dbError) {
      logger.warn('Database initialization failed, continuing anyway:', dbError.message);
      // Continue startup even if DB init fails (tables might already exist)
    }

    // ✅ Pre-warm Groq API (non-blocking, don't wait for it)
    preWarmGroqAPI().catch(() => {
      // Ignore errors, don't block startup
    });

    // Start server
    const server = app.listen(config.port, () => {
      logger.info(`🚀 TwinOS server running on port ${config.port}`);
      logger.info(`📊 Environment: ${config.nodeEnv}`);
      logger.info(`🔗 OpenAI API configured: ${config.openaiApiKey ? 'Yes' : 'No'}`);
      logger.info(`📧 Email configured: ${config.mail.smtp.user ? 'Yes' : 'No'}`);
      logger.info(`✅ Database: Connected`);
    });

    // Handle server errors
    server.on('error', (error: NodeJS.ErrnoException) => {
      if (error.syscall !== 'listen') {
        throw error;
      }

      const bind = typeof config.port === 'string' ? 'Pipe ' + config.port : 'Port ' + config.port;

      switch (error.code) {
        case 'EACCES':
          logger.error(`${bind} requires elevated privileges`);
          process.exit(1);
          break;
        case 'EADDRINUSE':
          logger.error(`${bind} is already in use`);
          process.exit(1);
          break;
        default:
          throw error;
      }
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      logger.info('SIGTERM received, shutting down gracefully...');
      shutdownPostHog();
      process.exit(0);
    });

    process.on('SIGINT', () => {
      logger.info('SIGINT received, shutting down gracefully...');
      shutdownPostHog();
      process.exit(0);
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();