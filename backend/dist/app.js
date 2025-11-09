"use strict";
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
const env_1 = require("./config/env");
const logger_1 = require("./config/logger");
const database_1 = require("./config/database");
const errors_1 = require("./utils/errors");
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
const routes_1 = __importDefault(require("./routes"));
const learningScheduler_1 = require("./services/learningScheduler");
const chatController_1 = require("./modules/chat/chatController");
const feedbackController_1 = require("./modules/chat/feedbackController");
const testRoutes_1 = __importDefault(require("./routes/testRoutes"));
if (env_1.config.nodeEnv === 'production') {
    learningScheduler_1.learningScheduler.start();
}
const jwtCookie_1 = require("./middleware/jwtCookie");
const csrf_1 = require("./middleware/csrf");
const app = (0, express_1.default)();
app.use((0, helmet_1.default)({
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
const limiter = (0, express_rate_limit_1.default)({
    windowMs: env_1.config.rateLimit.windowMs,
    max: env_1.config.rateLimit.maxRequests,
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});
app.use(limiter);
app.use((0, cookie_parser_1.default)());
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
app.use(passport_1.default.initialize());
app.use(passport_1.default.session());
if (env_1.config.nodeEnv === 'development') {
    app.use((0, morgan_1.default)('dev'));
}
else {
    app.use((0, morgan_1.default)('combined'));
}
app.get('/api/chats', jwtCookie_1.requireJWTFromCookie, chatController_1.getChatHistory);
app.post('/api/chats/new', jwtCookie_1.requireJWTFromCookie, chatController_1.createNewChat);
app.put('/api/chats/:id/title', jwtCookie_1.requireJWTFromCookie, chatController_1.updateChatTitle);
app.get('/api/chats/:id/summary', jwtCookie_1.requireJWTFromCookie, chatController_1.getChatSummary);
app.post('/api/chats/:id/generate-title', jwtCookie_1.requireJWTFromCookie, chatController_1.generateChatTitle);
app.set('view engine', 'ejs');
app.set('views', '../frontend/src/views');
app.use(express_1.default.static('../frontend/src/public'));
app.use('/uploads', express_1.default.static('public/uploads'));
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
app.get('/api/analytics/twin/:twinId/performance', jwtCookie_1.requireJWTFromCookie, analyticsController_1.getTwinPerformance);
app.get('/api/analytics/feedback', jwtCookie_1.requireJWTFromCookie, feedbackController_1.getFeedbackAnalytics);
app.use('/', testRoutes_1.default);
app.use(errors_1.errorHandler);
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