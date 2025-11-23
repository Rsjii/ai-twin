"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const express_session_1 = __importDefault(require("express-session"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const path_1 = __importDefault(require("path"));
const env_1 = require("./config/env");
const logger_1 = require("./config/logger");
const database_1 = require("./config/database");
const errorHandler_1 = require("./middleware/errorHandler");
const passport_1 = __importDefault(require("passport"));
const googleAuthRoutes_1 = __importDefault(require("./modules/auth/googleAuthRoutes"));
const authRoutes_1 = __importDefault(require("./modules/auth/authRoutes"));
const twinRoutes_1 = __importDefault(require("./modules/twin/twinRoutes"));
const publicTwinRoutes_1 = __importDefault(require("./modules/twin/publicTwinRoutes"));
const chatRoutes_1 = __importDefault(require("./modules/chat/chatRoutes"));
const publicChatRoutes_1 = __importDefault(require("./modules/chat/publicChatRoutes"));
const enhancedChatRoutes_1 = __importDefault(require("./modules/chat/enhancedChatRoutes"));
const socialRoutes_1 = __importDefault(require("./modules/social/socialRoutes"));
const discoverRoutes_1 = __importDefault(require("./modules/discover/discoverRoutes"));
const shareRoutes_1 = __importDefault(require("./modules/share/shareRoutes"));
const privacyRoutes_1 = __importDefault(require("./modules/privacy/privacyRoutes"));
const moderationRoutes_1 = __importDefault(require("./modules/moderation/moderationRoutes"));
const profileRoutes_1 = __importDefault(require("./modules/profile/profileRoutes"));
const inviteRoutes_1 = __importDefault(require("./modules/invite/inviteRoutes"));
const analyticsRoutes_1 = __importDefault(require("./modules/analytics/analyticsRoutes"));
const analyticsController_1 = require("./modules/analytics/analyticsController");
const adminAnalyticsRoutes_1 = __importDefault(require("./modules/analytics/adminAnalyticsRoutes"));
const onboardingRoutes_1 = __importDefault(require("./modules/onboarding/onboardingRoutes"));
const memoryRoutes_1 = __importDefault(require("./modules/memory/memoryRoutes"));
const userRoutes_1 = __importDefault(require("./modules/user/userRoutes"));
const routes_1 = __importDefault(require("./routes"));
const learningScheduler_1 = require("./services/learningScheduler");
const privateChatController_1 = require("./modules/chat/privateChatController");
const feedbackController_1 = require("./modules/chat/feedbackController");
const testRoutes_1 = __importDefault(require("./routes/testRoutes"));
if (env_1.config.nodeEnv === 'production') {
    learningScheduler_1.learningScheduler.start();
}
const jwtCookie_1 = require("./middleware/jwtCookie");
const csrf_1 = require("./middleware/csrf");
const app = (0, express_1.default)();
app.set('etag', false);
app.use((0, helmet_1.default)({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com"],
            imgSrc: ["'self'", "data:", "https:"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
        },
    },
}));
const limiter = (0, express_rate_limit_1.default)({
    windowMs: env_1.config.rateLimit.windowMs,
    max: env_1.config.rateLimit.maxRequests,
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});
app.use((0, cookie_parser_1.default)());
app.use((req, res, next) => {
    const path = req.path || '';
    const isStatic = path.startsWith('/css/') ||
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
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0, private');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        try {
            logger_1.logger.info('[CACHE_HEADERS_SET]', {
                path,
                method: req.method,
                cacheControl: 'no-store, no-cache, must-revalidate, max-age=0, private',
                clientCacheHeaders: {
                    ifNoneMatch: req.headers['if-none-match'] || null,
                    ifModifiedSince: req.headers['if-modified-since'] || null,
                },
            });
        }
        catch (logErr) {
        }
    }
    next();
});
app.use(jwtCookie_1.extractJWTFromCookie);
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
app.set('trust proxy', 1);
app.use((0, express_session_1.default)({
    secret: env_1.config.sessionSecret,
    resave: true,
    saveUninitialized: true,
    cookie: {
        secure: env_1.config.nodeEnv === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
    },
}));
app.use((req, res, next) => {
    const protectedPaths = ['/dashboard', '/chat', '/learning-dashboard', '/profile', '/twin', '/onboarding', '/analytics', '/admin'];
    const pathProtected = protectedPaths.some(path => req.path.startsWith(path));
    const userProtected = !!req.user;
    if (pathProtected || userProtected) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }
    next();
});
app.use(passport_1.default.initialize());
app.use(passport_1.default.session());
app.use((req, res, next) => {
    if (!res.locals.user && req.user) {
        res.locals.user = {
            id: req.user.userId || req.user.id,
            email: req.user.email,
            handle: req.user.handle,
        };
    }
    next();
});
app.use(async (req, res, next) => {
    if (res.locals.hasTwins === undefined && req.user && req.user.email) {
        try {
            const { twinQueries } = await Promise.resolve().then(() => __importStar(require('./config/database')));
            const userTwins = await twinQueries.findByUserId(req.user.userId || req.user.id);
            res.locals.hasTwins = userTwins.length > 0;
            const twin = res.locals.hasTwins ? userTwins[0] : null;
            res.locals.twinId = twin && twin.id ? twin.id : null;
        }
        catch (error) {
            logger_1.logger.warn('Error fetching hasTwins in global middleware:', error);
            res.locals.hasTwins = false;
            res.locals.twinId = null;
        }
    }
    else if (!req.user) {
        res.locals.hasTwins = false;
        res.locals.twinId = null;
    }
    next();
});
app.use((req, res, next) => {
    try {
        const jwtCookieRaw = req.cookies?.['jwtToken'];
        const jwtCookieShort = jwtCookieRaw
            ? `${jwtCookieRaw.substring(0, 10)}...len=${jwtCookieRaw.length}`
            : null;
        logger_1.logger.info('[REQ_CTX]', {
            method: req.method,
            path: req.path,
            query: req.query,
            userFromReq: req.user
                ? {
                    id: req.user.userId || req.user.id,
                    email: req.user.email,
                    handle: req.user.handle,
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
    }
    catch (logError) {
        logger_1.logger.warn('Failed to log request context:', logError);
    }
    next();
});
app.use((req, res, next) => {
    const originalRender = res.render.bind(res);
    res.render = (view, options, callback) => {
        const opts = options || {};
        if ((!("user" in opts) || opts.user == null) && res.locals.user) {
            opts.user = res.locals.user;
        }
        if ((!("hasTwins" in opts)) && typeof res.locals.hasTwins !== 'undefined') {
            opts.hasTwins = res.locals.hasTwins;
        }
        try {
            logger_1.logger.info('[RENDER_CTX]', {
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
                hasTwinsInLocals: typeof res.locals.hasTwins !== 'undefined' ? res.locals.hasTwins : undefined,
                twinIdInLocals: typeof res.locals.twinId !== 'undefined' ? res.locals.twinId : null,
            });
        }
        catch (renderLogError) {
            logger_1.logger.warn('Failed to log render context:', renderLogError);
        }
        return originalRender(view, opts, callback);
    };
    next();
});
if (env_1.config.nodeEnv === 'development') {
    app.use((0, morgan_1.default)('dev'));
}
else {
    app.use((0, morgan_1.default)('combined'));
}
app.get('/api/chats', jwtCookie_1.requireJWTFromCookie, privateChatController_1.getChatHistory);
app.post('/api/chats/new', jwtCookie_1.requireJWTFromCookie, privateChatController_1.createNewChat);
app.put('/api/chats/:id/title', jwtCookie_1.requireJWTFromCookie, privateChatController_1.updateChatTitle);
app.get('/api/chats/:id/summary', jwtCookie_1.requireJWTFromCookie, privateChatController_1.getChatSummary);
app.post('/api/chats/:id/generate-title', jwtCookie_1.requireJWTFromCookie, privateChatController_1.generateChatTitle);
app.set('view engine', 'ejs');
const viewsPath = path_1.default.resolve(__dirname, '../../frontend/src/views');
app.set('views', viewsPath);
if (env_1.config.nodeEnv === 'production') {
    logger_1.logger.info('Views path:', viewsPath);
    const fs = require('fs');
    if (!fs.existsSync(viewsPath)) {
        logger_1.logger.error('Views path does not exist:', viewsPath);
    }
}
else {
    app.set('view cache', false);
}
app.use(express_1.default.static(path_1.default.resolve(__dirname, '../../frontend/src/public'), {
    maxAge: '1y',
    etag: true,
    lastModified: true,
}));
app.use('/uploads', express_1.default.static(path_1.default.resolve(__dirname, '../../public/uploads')));
app.use('/utils', express_1.default.static(path_1.default.resolve(__dirname, '../public/utils')));
if (env_1.config.nodeEnv === 'production') {
    const utilsPath = path_1.default.resolve(__dirname, '../public/utils');
    logger_1.logger.info(`📁 Utils path: ${utilsPath}`);
    const fs = require('fs');
    if (fs.existsSync(utilsPath)) {
        logger_1.logger.info(`✅ Utils directory exists`);
        logger_1.logger.info(`📁 Utils files: ${fs.readdirSync(utilsPath).join(', ')}`);
    }
    else {
        logger_1.logger.error(`❌ Utils directory does not exist: ${utilsPath}`);
    }
}
app.use(csrf_1.generateCSRFToken);
app.use('/', routes_1.default);
app.use('/api/auth', authRoutes_1.default);
app.use('/api/auth', googleAuthRoutes_1.default);
app.use('/api/twin', twinRoutes_1.default);
app.use('/api/public-twin', publicTwinRoutes_1.default);
app.use('/api/chat', chatRoutes_1.default);
app.use('/api/public-chat', publicChatRoutes_1.default);
app.use('/api/enhanced-chat', enhancedChatRoutes_1.default);
app.use('/api/social', socialRoutes_1.default);
app.use('/api/discover', discoverRoutes_1.default);
app.use('/api/share', shareRoutes_1.default);
app.use('/api/privacy', privacyRoutes_1.default);
app.use('/api/moderation', moderationRoutes_1.default);
app.use('/api/profile', profileRoutes_1.default);
app.use('/api/invite', inviteRoutes_1.default);
app.use('/api/metrics', analyticsRoutes_1.default);
app.use('/api/admin/analytics', adminAnalyticsRoutes_1.default);
app.use('/api/onboarding', onboardingRoutes_1.default);
app.use('/api/memory', memoryRoutes_1.default);
app.use('/api/user', userRoutes_1.default);
app.get('/api/analytics/twin/:twinId/performance', jwtCookie_1.requireJWTFromCookie, analyticsController_1.getTwinPerformance);
app.get('/api/analytics/feedback', jwtCookie_1.requireJWTFromCookie, feedbackController_1.getFeedbackAnalytics);
app.use('/', testRoutes_1.default);
app.use(errorHandler_1.errorHandlerMiddleware);
app.use((_req, res) => {
    res.status(404).render('404', {
        title: 'Page Not Found - AI Twin',
        csrfToken: res.locals['csrfToken'],
    });
});
process.on('SIGINT', async () => {
    logger_1.logger.info('Shutting down gracefully...');
    await database_1.db.close();
    process.exit(0);
});
process.on('SIGTERM', async () => {
    logger_1.logger.info('Shutting down gracefully...');
    await database_1.db.close();
    process.exit(0);
});
exports.default = app;
//# sourceMappingURL=app.js.map