import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit'; 
import cookieParser from 'cookie-parser';
import path from 'path';  // ✅ ADD: For path resolution
import fs from 'fs';
import { config, isProd, isDev } from './config/env';
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

import { randomUUID } from 'crypto';

if(config.nodeEnv==='production'){
  learningScheduler.start();
}

// Import JWT middleware
import { requireJWTFromCookie, extractJWTFromCookie } from './middleware/jwtCookie';

// Import middleware
import { generateCSRFToken } from './middleware/csrf';

const app = express();

// ✅ NEW: Global requestId middleware
app.use((req, res, next) => {
  const requestId = randomUUID();
  (req as any).requestId = requestId;
  res.locals.requestId = requestId;

  // Lightweight start log – no heavy data here
  try {
    logger.info('[REQUEST_START]', {
      requestId,
      method: req.method,
      path: req.path,
    });
  } catch {
    // ignore logging errors
  }

  next();
});

// ✅ Disable ETag for all responses (prevents 304 on JSON APIs)
app.set('etag', false);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com"], // ✅ FIX: Allow unpkg.com for AlpineJS
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

// ✅ GLOBAL: force no-cache for all dynamic routes (HTML + JSON) - BRUTEFORCE FIX
app.use((req, res, next) => {
  const path = req.path || '';

  // Allow caching ONLY for static assets
  const isStatic =
    path.startsWith('/css/') ||
    path.startsWith('/js/') ||
    path.startsWith('/images/') ||
    path.startsWith('/uploads/') ||
    path.startsWith('/utils/') ||
    path.startsWith('/favicon') ||
    path.endsWith('.png') ||
    path.endsWith('.jpg') ||
    path.endsWith('.jpeg') ||
    path.endsWith('.svg') ||
    path.endsWith('.ico') ||
    path.endsWith('.woff') ||
    path.endsWith('.woff2') ||
    path.endsWith('.ttf');

  if (!isStatic) {
    // ✅ absolutely disable caching for dynamic stuff (HTML pages + JSON APIs)
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // ✅ Log cache headers being set
    try {
      logger.info('[CACHE_HEADERS_SET]', {
        path,
        method: req.method,
        cacheControl: 'no-store, no-cache, must-revalidate, max-age=0, private',
        clientCacheHeaders: {
          ifNoneMatch: req.headers['if-none-match'] || null,
          ifModifiedSince: req.headers['if-modified-since'] || null,
        },
      });
    } catch (logErr) {
      // Silent fail for logging
    }
  }

  next();
});

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
  // Paths that should NEVER be cached even for anonymous
  const protectedPaths = ['/dashboard', '/chat', '/learning-dashboard', '/profile', '/twin', '/onboarding', '/analytics', '/admin'];

  const pathProtected = protectedPaths.some(path => req.path.startsWith(path));
  const userProtected = !!req.user; // ✅ agar user logged-in hai, koi bhi page cache nahi hoga

  if (pathProtected || userProtected) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }

  next();
});

// Initialize Passport (must be after session middleware)
app.use(passport.initialize());
app.use(passport.session());

// ✅ GLOBAL: expose full user (including profileImage) to EJS
app.use(async (req, res, next) => {
  if (!res.locals.user && req.user) {
    try {
      const { userQueries } = await import('./config/database');
      const fullUser = await userQueries.findByEmail(req.user.email);

      if (fullUser) {
        res.locals.user = {
          id: req.user.userId || req.user.id,
          email: req.user.email,
          handle: req.user.handle,
          name: fullUser.name,
          profileImage: fullUser.profileImage || null,
        };
      } else {
        res.locals.user = {
          id: req.user.userId || req.user.id,
          email: req.user.email,
          handle: req.user.handle,
          profileImage: null,
        };
      }
    } catch (error) {
      res.locals.user = {
        id: req.user.userId || req.user.id,
        email: req.user.email,
        handle: req.user.handle,
        profileImage: null,
      };
    }
  }
  next();
});

// ✅ ADD: Global hasTwins + twinId middleware (for footer + pages)
app.use(async (req, res, next) => {
  // Only set hasTwins if controller hasn't set it AND user is authenticated
  if (res.locals.hasTwins === undefined && req.user && req.user.email) {
    try {
      const { twinQueries } = await import('./config/database');
      const userTwins = await twinQueries.findByUserId(req.user.userId || req.user.id);
      res.locals.hasTwins = userTwins.length > 0;
      const twin = res.locals.hasTwins ? userTwins[0] : null;
      res.locals.twinId = twin && twin.id ? twin.id : null; // ✅ NEW: Set twinId globally
    } catch (error) {
      logger.warn('Error fetching hasTwins in global middleware:', error);
      res.locals.hasTwins = false;
      res.locals.twinId = null;
    }
  } else if (!req.user) {
    res.locals.hasTwins = false;
    res.locals.twinId = null;
  }
  next();
});

// ✅ NEW: Ultra-detailed request context logger (for debugging prod vs dev issues)
app.use((req, res, next) => {
  try {
    const jwtCookieRaw = (req as any).cookies?.['jwtToken'] as string | undefined;
    const jwtCookieShort = jwtCookieRaw
      ? (isDev ? `${jwtCookieRaw.substring(0, 10)}...len=${jwtCookieRaw.length}` : 'present')
      : null;

    logger.info('[REQ_CTX]', {
      method: req.method,
      path: req.path,
      query: req.query,
      userFromReq: req.user
        ? {
            id: (req.user as any).userId || (req.user as any).id,
            email: (req.user as any).email,
            handle: (req.user as any).handle,
          }
        : null,
      userFromLocals: res.locals.user
        ? {
            id: res.locals.user.id,
            email: res.locals.user.email,
            handle: res.locals.user.handle,
          }
        : null,
      hasTwins: typeof res.locals.hasTwins !== 'undefined' ? res.locals.hasTwins : null,
      twinId: typeof res.locals.twinId !== 'undefined' ? res.locals.twinId : null,
      jwtCookiePresent: !!jwtCookieRaw,
      jwtCookiePreview: jwtCookieShort,
      cacheHeadersFromClient: {
        ifNoneMatch: req.headers['if-none-match'] || null,
        ifModifiedSince: req.headers['if-modified-since'] || null,
        cacheControl: req.headers['cache-control'] || null,
        pragma: req.headers['pragma'] || null,
      },
    });
  } catch (logError) {
    logger.warn('Failed to log request context:', logError);
  }

  next();
});

// ✅ NEW: Global render wrapper — ensure `user` / `hasTwins` are always correct for views
app.use((req, res, next) => {
  const originalRender = res.render.bind(res);

  res.render = (view: string, options?: any, callback?: any) => {
    const opts = options || {};

    // If controller did NOT set user, OR set it to null/undefined, use global res.locals.user
    if ((!("user" in opts) || opts.user == null) && res.locals.user) {
      opts.user = res.locals.user;
    }

    // If controller didn't set hasTwins, but global hasTwins exists, use it
    if ((!("hasTwins" in opts)) && typeof res.locals.hasTwins !== 'undefined') {
      opts.hasTwins = res.locals.hasTwins;
    }

    // ✅ Ultra-detailed render logging
    try {
      logger.info('[RENDER_CTX]', {
        view,
        hasUserInOpts: !!opts.user,
        userInOpts: opts.user
          ? {
              id: opts.user.id,
              email: opts.user.email,
              handle: opts.user.handle,
            }
          : null,
        hasUserInLocals: !!res.locals.user,
        userInLocals: res.locals.user
          ? {
              id: res.locals.user.id,
              email: res.locals.user.email,
              handle: res.locals.user.handle,
            }
          : null,
        hasTwinsInOpts: Object.prototype.hasOwnProperty.call(opts, 'hasTwins')
          ? opts.hasTwins
          : undefined,
        hasTwinsInLocals:
          typeof res.locals.hasTwins !== 'undefined' ? res.locals.hasTwins : undefined,
        twinIdInLocals: typeof res.locals.twinId !== 'undefined' ? res.locals.twinId : null,
      });
    } catch (renderLogError) {
      logger.warn('Failed to log render context:', renderLogError);
    }

    return originalRender(view, opts, callback as any);
  };

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

// ✅ SIMPLE STATIC SERVE FOR UPLOADS
const uploadsPath = path.resolve(process.cwd(), 'public/uploads');
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}
logger.info(`📁 Uploads path: ${uploadsPath}`);
app.use('/uploads', express.static(uploadsPath));

// ✅ timeUtils as before
app.use('/utils', express.static(path.resolve(__dirname, '../public/utils')));

// ✅ ADD: Log utils path in production for debugging
if(config.nodeEnv === 'production'){
  const utilsPath = path.resolve(__dirname, '../public/utils');
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

// ✅ FIX: always enable admin analytics in dev; use flag only to disable in prod
if (config.nodeEnv === 'development' || config.enableAdminAnalytics) {
  app.use('/api/admin/analytics', adminAnalyticsRoutes);
}
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
