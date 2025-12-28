import express from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit'; 
import cookieParser from 'cookie-parser';
import path from 'path';  // ✅ ADD: For path resolution
import fs from 'fs';
import { config, isProd, isDev } from './config/env';
import { logger } from './config/logger';
import { db } from './config/database';
import { pool } from './config/db'; // ✅ Import pool for session store
import { errorHandlerMiddleware } from './middleware/errorHandler';
import passport from 'passport';

const PgSession = connectPgSimple(session);
//import googleAuthRoutes from './modules/auth/googleAuthRoutes';

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

// Rate limiting - ✅ Apply in ALL environments (with different limits)
// ✅ FIX: Skip global limiter for routes that have their own specific rate limiters
// to prevent ERR_ERL_DOUBLE_COUNT errors
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip global limiter for routes that have their own specific rate limiters
    const path = req.path || '';
    // Routes with specific rate limiters (auth, chat, public-chat, etc.)
    return path.startsWith('/api/auth') ||
           path.startsWith('/api/chat') ||
           path.startsWith('/api/public-chat') ||
           path.startsWith('/api/enhanced-chat') ||
           path.startsWith('/api/twin') ||
           path.startsWith('/api/public-twin');
  }
});

if(isProd){
  app.use(limiter); // Production limits (strict)
} else {
  // Development: Use a more lenient limiter (but still protect against abuse)
  const devLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100000, // High limit for dev (but not unlimited)
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      // Skip global limiter for routes that have their own specific rate limiters
      const path = req.path || '';
      return path.startsWith('/api/auth') ||
             path.startsWith('/api/chat') ||
             path.startsWith('/api/public-chat') ||
             path.startsWith('/api/enhanced-chat') ||
             path.startsWith('/api/twin') ||
             path.startsWith('/api/public-twin');
    }
  });
  app.use(devLimiter);
}

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
const forceInsecureCookies = process.env.FORCE_INSECURE_COOKIES === 'true';
// production in real deploy => secure cookies, local http test => allow insecure via env flag
const sessionCookieSecure = isProd && !forceInsecureCookies;

// ✅ FIX: Session store with better error handling
// Note: connect-pg-simple automatically prunes expired sessions in the background
// If pruning fails due to network issues, it's non-critical - sessions still work
const sessionStore = new PgSession({
  pool: pool, // ✅ Use PostgreSQL pool for persistent sessions
  tableName: 'session', // Table name (connect-pg-simple default)
  createTableIfMissing: true, // ✅ Auto-create table if missing
  // pruneSessionInterval is handled internally by connect-pg-simple
  // Errors are caught internally, but we can improve pool-level error handling
});

app.use(session({
  store: sessionStore,
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  name: 'connect.sid',
  cookie: {
    secure: sessionCookieSecure, // ✅ FIX
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 24 * 60 * 60 * 1000,
  },
}));

// ✅ GLOBAL: block access for users with incomplete profile (except auth/signup + static)
app.use(async (req, res, next) => {
  try {
    const path = req.path || '';

    // 0) Always skip static assets (CSS/JS/images/fonts/uploads/etc.)
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

    if (isStatic) {
      return next(); // let express.static handle it
    }

    // 1) If not logged in, nothing to do
    if (!req.user || !req.user.email) {
      return next();
    }

    // 2) Routes where incomplete profile is allowed
    const allowedPrefixes = [
      '/auth',
      '/login',
      '/signup',
      '/signup/profile',   // profile completion page
      '/signup/verify',
      '/forgot-password',
      '/reset-password',
      '/api/auth',         // login/signup/otp/profile APIs
    ];

    const isAllowed = allowedPrefixes.some(prefix => path.startsWith(prefix));
    if (isAllowed) {
      return next();
    }

    // 3) For everything else: check profileCompleted
    const { userQueries } = await import('./config/database');
    const fullUser = await userQueries.findByEmail(req.user.email);

    if (!fullUser) {
      // User row missing: clear auth and send to /auth
      res.clearCookie('jwtToken', {
        httpOnly: true,
        secure: isProd,
        sameSite: isProd ? 'lax' : 'strict',
        path: '/',
      });
      if (req.session) {
        req.session.destroy(() => {});
      }
      return res.redirect('/auth');
    }

    if (!fullUser.profileCompleted) {
      // ❗ As per your requirement: any other endpoint/back → go to auth
      return res.redirect('/auth');
    }

    // Profile completed → proceed
    return next();
  } catch (err) {
    logger.error('ProfileCompletionGuard error:', err);
    return res.redirect('/auth');
  }
});

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
// ✅ FIX: Views path - handle both dev (src) and production (dist) correctly
// If running from dist/, go up 2 levels. If from src/, go up 1 level.
const viewsPath = path.resolve(__dirname, '../../frontend/src/views');

app.set('views', viewsPath);
logger.info('Views directory set to:', viewsPath);

// ✅ FIX: ALWAYS disable EJS cache for development (even if NODE_ENV is set wrong)
app.set('view cache', false);
logger.info('EJS view cache DISABLED. Views path:', viewsPath);

// Verify path exists
if (!fs.existsSync(viewsPath)) {
  logger.error('❌ Views path does not exist:', viewsPath);
  logger.error('Current __dirname:', __dirname);
  logger.error('Resolved viewsPath:', viewsPath);
} else {
  logger.info('✅ Views path verified:', viewsPath);
}

// ✅ FIX: Disable static file cache in development
const staticOptions = config.nodeEnv === 'production' 
  ? { maxAge: '1y', etag: true, lastModified: true }
  : { maxAge: 0, etag: false, lastModified: false }; // No cache in dev

app.use(express.static(path.resolve(__dirname, '../../frontend/src/public'), staticOptions));
logger.info('Static files cache:', config.nodeEnv === 'production' ? 'ENABLED (1y)' : 'DISABLED (dev mode)');

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
  if (fs.existsSync(utilsPath)) {
    logger.info(`✅ Utils directory exists`);
    logger.info(`📁 Utils files: ${fs.readdirSync(utilsPath).join(', ')}`);
  } else {
    logger.error(`❌ Utils directory does not exist: ${utilsPath}`);
  }
}

// Apply custom middleware
// ✅ REMOVE THIS LINE:
// app.use(generateCSRFToken);

// ========== ROUTE MOUNTING ==========
// Page routes (HTML rendering) - these already have generateCSRFToken
app.use('/', pageRoutes);

// API Routes (JSON responses)
app.use('/api/auth', authRoutes);
// ✅ v2: Google OAuth routes - not needed in v1, not needed for mvp
//app.use('/api/auth', googleAuthRoutes); // Add this line
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

// ✅ SECURITY: Admin analytics API only for local/staging (never in prod)
// Double-check: ensure admin routes are completely disabled in production
if (config.enableAdminAnalytics && !isProd) {
  app.use('/api/admin/analytics', adminAnalyticsRoutes);
  logger.info('✅ Admin analytics routes enabled (non-production mode)');
} else if (isProd) {
  // ✅ Explicitly log that admin routes are disabled in production
  logger.info('✅ Admin analytics routes DISABLED in production (security)');
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

// ✅ Health check endpoint (for monitoring)
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// ✅ SMTP test endpoint (for debugging email issues on Railway)
app.get('/api/test/smtp', async (req, res) => {
  try {
    const { EmailService } = await import('./modules/auth/authService');
    const { config, isProd } = await import('./config/env');
    const { logger } = await import('./config/logger');
    
    const testEmail = req.query.email as string || 'test@example.com';
    const emailService = new EmailService();
    
    logger.info('🧪 [SMTP_TEST] Starting SMTP test...', {
      testEmail,
      isProd,
      NODE_ENV: config.nodeEnv,
      APP_ENV: config.appEnv,
      smtpConfig: {
        host: config.mail.smtp.host,
        port: config.mail.smtp.port,
        user: config.mail.smtp.user,
        hasPass: !!config.mail.smtp.pass,
        from: config.mail.from,
      },
      railwayEnv: {
        RAILWAY_ENVIRONMENT: process.env.RAILWAY_ENVIRONMENT || 'NOT_SET',
        RAILWAY_SERVICE_NAME: process.env.RAILWAY_SERVICE_NAME || 'NOT_SET',
      }
    });
    
    // Test email sending
    const result = await emailService.sendOTP(testEmail, '123456', 'signup');
    
    res.json({
      success: result,
      message: result ? 'Email sent successfully' : 'Email sending failed',
      config: {
        host: config.mail.smtp.host,
        port: config.mail.smtp.port,
        user: config.mail.smtp.user,
        hasPassword: !!config.mail.smtp.pass,
        from: config.mail.from,
        isProd,
        NODE_ENV: config.nodeEnv,
        APP_ENV: config.appEnv,
      },
      railway: {
        isRailway: !!process.env.RAILWAY_ENVIRONMENT,
        environment: process.env.RAILWAY_ENVIRONMENT || 'NOT_SET',
        service: process.env.RAILWAY_SERVICE_NAME || 'NOT_SET',
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    const { logger } = await import('./config/logger');
    logger.error('❌ [SMTP_TEST] Test failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack,
    });
  }
});

// Test routes , only in the development
if(isDev){
  // ✅ Add IP whitelist for test routes (extra security)
  app.use('/test', (req, res, next) => {
    const allowedIPs = ['127.0.0.1', '::1'];
    const clientIP = req.ip || req.connection?.remoteAddress || '';
    if (!allowedIPs.includes(clientIP) && !clientIP.includes('127.0.0.1')) {
      return res.status(403).json({ error: 'Test routes only available from localhost' });
    }
    next();
  });
  app.use('/', testRoutes);
}




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
