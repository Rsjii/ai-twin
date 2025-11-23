import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit'; 
import cookieParser from 'cookie-parser';
import path from 'path';  // ✅ ADD: For path resolution
import { config } from './config/env';
import { logger } from './config/logger';
import { db } from './config/database';
import { errorHandlerMiddleware } from './middleware/errorHandler';
import passport from 'passport';
import googleAuthRoutes from './modules/auth/googleAuthRoutes';

// Import API route modules
import authRoutes from './modules/auth/authRoutes';
import twinRoutes from './modules/twin/twinRoutes';
import publicTwinRoutes from './modules/twin/publicTwinRoutes';
import chatRoutes from './modules/chat/chatRoutes';
import publicChatRoutes from './modules/chat/publicChatRoutes';
import enhancedChatRoutes from './modules/chat/enhancedChatRoutes';
import socialRoutes from './modules/social/socialRoutes';
import discoverRoutes from './modules/discover/discoverRoutes';
import shareRoutes from './modules/share/shareRoutes';
import privacyRoutes from './modules/privacy/privacyRoutes';
import moderationRoutes from './modules/moderation/moderationRoutes';
import profileRoutes from './modules/profile/profileRoutes';
import inviteRoutes from './modules/invite/inviteRoutes';
import analyticsRoutes from './modules/analytics/analyticsRoutes';
import { getTwinPerformance } from './modules/analytics/analyticsController';
import adminAnalyticsRoutes from './modules/analytics/adminAnalyticsRoutes';
import onboardingRoutes from './modules/onboarding/onboardingRoutes';
import memoryRoutes from './modules/memory/memoryRoutes';
import userRoutes from './modules/user/userRoutes';

// Import page routes (HTML rendering)
import pageRoutes from './routes';

// Import services (for initialization)
import {learningScheduler} from './services/learningScheduler';

// Import controllers for direct API routes
import { getChatHistory, createNewChat, updateChatTitle, getChatSummary, generateChatTitle } from './modules/chat/privateChatController';
import { getFeedbackAnalytics } from './modules/chat/feedbackController';
// Style anchor imports removed - now handled in twinRoutes.ts

// Import test routes
import testRoutes from './routes/testRoutes';

if(config.nodeEnv==='production'){
  learningScheduler.start();
}

// Import JWT middleware
import { requireJWTFromCookie, extractJWTFromCookie } from './middleware/jwtCookie';

// Import middleware
import { generateCSRFToken } from './middleware/csrf';

const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
    },
  },
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

//app.use(limiter);

// Cookie parser middleware
app.use(cookieParser());

// ✅ GLOBAL: extract JWT for ALL requests (pages + APIs)
app.use(extractJWTFromCookie);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Trust proxy (for deployment) - must be before session
app.set('trust proxy', 1);

// Session middleware
app.use(session({
  secret: config.sessionSecret,
  resave: true, // Changed to true to force session save
  saveUninitialized: true, // Changed to true to save sessions even if not modified
  cookie: {
    secure: config.nodeEnv === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  },
}));

// After session middleware, before routes
app.use((req, res, next) => {
  // Set no-cache headers for all protected pages
  const protectedPaths = ['/dashboard', '/chat', '/learning-dashboard', '/profile', '/twin', '/onboarding', '/analytics', '/admin'];
  const isProtected = protectedPaths.some(path => req.path.startsWith(path));
  
  if (isProtected) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  
  next();
});

// Initialize Passport (must be after session middleware)
app.use(passport.initialize());
app.use(passport.session());

// ✅ GLOBAL: expose user to EJS as `user` if controller ne nahi diya
app.use((req, res, next) => {
  // Agar controller ne already `res.locals.user` set kar diya ho (jaise dashboard),
  // to usko respect karo, overwrite mat karo.
  if (!res.locals.user && req.user) {
    res.locals.user = {
      id: req.user.userId || req.user.id,
      email: req.user.email,
      handle: req.user.handle,
      // profileImage optional hai, header me fallback already hai
    };
  }
  next();
});

// ✅ ADD: Global hasTwins middleware (for footer)
app.use(async (req, res, next) => {
  // Only set hasTwins if controller hasn't set it AND user is authenticated
  if (res.locals.hasTwins === undefined && req.user && req.user.email) {
    try {
      const { twinQueries } = await import('./config/database');
      const userTwins = await twinQueries.findByUserId(req.user.userId || req.user.id);
      res.locals.hasTwins = userTwins.length > 0;
    } catch (error) {
      logger.warn('Error fetching hasTwins in global middleware:', error);
      res.locals.hasTwins = false;
    }
  } else if (!req.user) {
    res.locals.hasTwins = false;
  }
  next();
});

// Logging middleware
if (config.nodeEnv === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Chat management routes
app.get('/api/chats', requireJWTFromCookie, getChatHistory);
app.post('/api/chats/new', requireJWTFromCookie, createNewChat);
app.put('/api/chats/:id/title', requireJWTFromCookie, updateChatTitle);
app.get('/api/chats/:id/summary', requireJWTFromCookie, getChatSummary);
app.post('/api/chats/:id/generate-title', requireJWTFromCookie, generateChatTitle);

// View engine setup
app.set('view engine', 'ejs');
// ✅ FIX: Use absolute path resolution with proper production handling
const viewsPath = path.resolve(__dirname, '../../frontend/src/views');
app.set('views', viewsPath);

// ✅ ADD: Disable EJS caching in development, enable in production
if (config.nodeEnv === 'production') {
  logger.info('Views path:', viewsPath);
  // Verify path exists
  const fs = require('fs');
  if (!fs.existsSync(viewsPath)) {
    logger.error('Views path does not exist:', viewsPath);
  }
} else {
  // Development: disable caching for hot reload
  app.set('view cache', false);
}

// Static files with cache headers
app.use(express.static(path.resolve(__dirname, '../../frontend/src/public'), {
  maxAge: '1y',
  etag: true,
  lastModified: true,
}));
app.use('/uploads', express.static(path.resolve(__dirname, '../../public/uploads')));
app.use('/utils', express.static(path.resolve(__dirname, '../../frontend/src/utils')));

// ✅ ADD: Log utils path in production for debugging
if(config.nodeEnv === 'production'){
  const utilsPath = path.resolve(__dirname, '../../frontend/src/utils');
  logger.info(`📁 Utils path: ${utilsPath}`);
  const fs = require('fs');
  if (fs.existsSync(utilsPath)) {
    logger.info(`✅ Utils directory exists`);
    logger.info(`📁 Utils files: ${fs.readdirSync(utilsPath).join(', ')}`);
  } else {
    logger.error(`❌ Utils directory does not exist: ${utilsPath}`);
  }
}

// Apply custom middleware
app.use(generateCSRFToken);

// ========== ROUTE MOUNTING ==========
// Page routes (HTML rendering)
app.use('/', pageRoutes);

// API Routes (JSON responses)
app.use('/api/auth', authRoutes);
app.use('/api/auth', googleAuthRoutes); // Add this line
app.use('/api/twin', twinRoutes);
app.use('/api/public-twin', publicTwinRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/public-chat', publicChatRoutes);
app.use('/api/enhanced-chat', enhancedChatRoutes);
app.use('/api/social', socialRoutes);
app.use('/api/discover', discoverRoutes);
app.use('/api/share', shareRoutes);
app.use('/api/privacy', privacyRoutes);
app.use('/api/moderation', moderationRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/invite', inviteRoutes);
app.use('/api/metrics', analyticsRoutes);
app.use('/api/admin/analytics', adminAnalyticsRoutes);
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/memory', memoryRoutes);
app.use('/api/user', userRoutes);

// Style anchor routes moved to twinRoutes.ts for consistency
// All style anchor endpoints are now available via /api/twin/:id/style-anchors

// Direct API route - Analytics performance
app.get('/api/analytics/twin/:twinId/performance', requireJWTFromCookie, getTwinPerformance);

// Feedback analytics route
app.get('/api/analytics/feedback', requireJWTFromCookie, getFeedbackAnalytics);

// Test routes
app.use('/', testRoutes);




// Error handling middleware (must be after all routes)
app.use(errorHandlerMiddleware);

// 404 handler
app.use((_req, res) => {
  res.status(404).render('404', {
    title: 'Page Not Found - AI Twin',
    csrfToken: res.locals['csrfToken'],
  });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down gracefully...');
  await db.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Shutting down gracefully...');
  await db.close();
  process.exit(0);
});


export default app;
