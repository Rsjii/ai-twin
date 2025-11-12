import app from './app';
import { config } from './config/env';
import { logger } from './config/logger';
import { db } from './config/db';
import { initializeDatabase } from './config/database';

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
        model: 'mixtral-8x7b-32768',
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
      logger.info(`🚀 AI Twin server running on port ${config.port}`);
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

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();