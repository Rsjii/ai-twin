//WzKZY+gg.H74hqZ
//xtom onee lqsb gpql

import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit'; 
import cookieParser from 'cookie-parser';
import { config } from './config/env';
import { logger } from './config/logger';
import { db } from './config/database';
import { errorHandler } from './utils/errors';
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
import { requireJWTFromCookie } from './middleware/jwtCookie';

// Import middleware
import { generateCSRFToken } from './middleware/csrf';

const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
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

app.use(limiter);

// Cookie parser middleware
app.use(cookieParser());

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
app.set('views', '../frontend/src/views');

// Static files
app.use(express.static('../frontend/src/public'));
app.use('/uploads', express.static('public/uploads'));

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
app.use(errorHandler);

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
