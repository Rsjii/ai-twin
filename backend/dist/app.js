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
const env_1 = require("./config/env");
const logger_1 = require("./config/logger");
const database_1 = require("./config/database");
const authRoutes_1 = __importDefault(require("./modules/auth/authRoutes"));
const twinRoutes_1 = __importDefault(require("./modules/twin/twinRoutes"));
const chatRoutes_1 = __importDefault(require("./modules/chat/chatRoutes"));
const profileRoutes_1 = __importDefault(require("./modules/profile/profileRoutes"));
const inviteRoutes_1 = __importDefault(require("./modules/invite/inviteRoutes"));
const analyticsRoutes_1 = __importDefault(require("./modules/analytics/analyticsRoutes"));
const csrf_1 = require("./middleware/csrf");
const validation_1 = require("./middleware/validation");
const auth_1 = require("./middleware/auth");
const app = (0, express_1.default)();
app.use((0, helmet_1.default)({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
            imgSrc: ["'self'", "data:", "https:"],
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
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
app.use((0, express_session_1.default)({
    secret: env_1.config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: env_1.config.nodeEnv === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
    },
}));
if (env_1.config.nodeEnv === 'development') {
    app.use((0, morgan_1.default)('dev'));
}
else {
    app.use((0, morgan_1.default)('combined'));
}
app.set('view engine', 'ejs');
app.set('views', '../frontend/src/views');
app.use(express_1.default.static('../frontend/src/public'));
app.set('trust proxy', 1);
app.use(csrf_1.generateCSRFToken);
app.use(validation_1.sanitizeInput);
app.use(auth_1.optionalAuth);
app.use('/api/auth', authRoutes_1.default);
app.use('/api/twin', twinRoutes_1.default);
app.use('/api/chat', chatRoutes_1.default);
app.use('/api/profile', profileRoutes_1.default);
app.use('/api/invite', inviteRoutes_1.default);
app.use('/api/metrics', analyticsRoutes_1.default);
app.get('/test', (req, res) => {
    res.json({ message: 'Server is working!', timestamp: new Date().toISOString() });
});
app.get('/test-db', async (req, res) => {
    try {
        const result = await database_1.db.query('SELECT COUNT(*) as count FROM "User"');
        res.json({ message: 'Database working!', userCount: result.rows[0].count });
    }
    catch (error) {
        res.status(500).json({ error: 'Database error', details: error.message });
    }
});
app.post('/test-auth', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ error: 'Email required' });
        }
        const user = await database_1.userQueries.findByEmail(email);
        return res.json({ message: 'Auth working!', userExists: !!user });
    }
    catch (error) {
        return res.status(500).json({ error: 'Auth error', details: error.message });
    }
});
app.post('/test-otp', async (req, res) => {
    try {
        const { email, code } = req.body;
        if (code) {
            if (!email) {
                return res.status(400).json({ error: 'Email required for verification' });
            }
            const { verifyOTP } = await Promise.resolve().then(() => __importStar(require('./modules/auth/authService.js')));
            const { otpQueries } = await Promise.resolve().then(() => __importStar(require('./config/database.js')));
            const storedOTP = await otpQueries.findByEmail(email.toLowerCase());
            if (!storedOTP) {
                return res.status(400).json({ error: 'No OTP found for this email' });
            }
            if (new Date() > storedOTP.expires_at) {
                return res.status(400).json({ error: 'OTP has expired' });
            }
            if (storedOTP.used) {
                return res.status(400).json({ error: 'OTP has already been used' });
            }
            const isValid = await verifyOTP(code, storedOTP.codeHash);
            if (!isValid) {
                return res.status(400).json({ error: 'Invalid OTP code' });
            }
            req.session.userId = 'test-user-id';
            req.session.userEmail = email.toLowerCase();
            req.session.userHandle = email.split('@')[0];
            await otpQueries.markAsUsed(storedOTP.id);
            console.log('\n✅ ===== OTP VERIFIED (TEST) =====');
            console.log(`📧 Email: ${email}`);
            console.log(`🔑 OTP Code: ${code}`);
            console.log('=====================================\n');
            return res.json({
                message: 'OTP verification successful!',
                email: email,
                userId: 'test-user-id'
            });
        }
        if (!email) {
            return res.status(400).json({ error: 'Email required' });
        }
        const { generateOTP, hashOTP } = await Promise.resolve().then(() => __importStar(require('./modules/auth/authService.js')));
        const otp = generateOTP(6);
        const hashedOTP = await hashOTP(otp);
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
        const { otpQueries } = await Promise.resolve().then(() => __importStar(require('./config/database.js')));
        await otpQueries.create(email.toLowerCase(), hashedOTP, expiresAt);
        console.log('\n🔐 ===== OTP GENERATED (TEST) =====');
        console.log(`📧 Email: ${email}`);
        console.log(`🔑 OTP Code: ${otp}`);
        console.log('=====================================\n');
        return res.json({
            message: 'OTP generated successfully!',
            otp: otp,
            email: email
        });
    }
    catch (error) {
        return res.status(500).json({ error: 'OTP operation error', details: error.message });
    }
});
app.get('/basic', (req, res) => {
    res.send('<h1>Hello World!</h1><p>Server is working!</p>');
});
app.get('/simple', (req, res) => {
    res.render('landing', {
        title: 'AI Twin - Create Your Digital Twin',
        user: null,
        csrfToken: 'test-token',
    });
});
app.get('/', (req, res) => {
    if (req.user) {
        return res.redirect('/dashboard');
    }
    res.render('layout', {
        title: 'AI Twin - Create Your Digital Twin',
        user: req.user,
        csrfToken: res.locals.csrfToken,
        body: `
    <div class="px-4 py-6 sm:px-0">
        <div class="max-w-4xl mx-auto text-center">
            <h1 class="text-5xl font-bold text-gray-900 mb-6">
                Create Your AI Twin
            </h1>
            <p class="text-xl text-gray-600 mb-8">
                Upload your text samples and create an AI version of yourself that chats in your unique style.
            </p>
            
            <div class="bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg shadow-lg p-8 mb-8 text-white">
                <h2 class="text-3xl font-semibold mb-4">Ready to Create Your AI Twin?</h2>
                <p class="text-lg mb-6">Start your journey to create an AI version of yourself that communicates in your unique style.</p>
                <a 
                    href="/auth"
                    class="inline-block bg-white text-blue-600 py-3 px-8 rounded-lg hover:bg-gray-100 transition-colors font-semibold text-lg"
                >
                    Get Started Now
                </a>
            </div>

            <div class="grid md:grid-cols-3 gap-6 mb-8">
                <div class="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow">
                    <div class="text-4xl mb-4">🤖</div>
                    <h3 class="text-xl font-semibold mb-3">AI Style Extraction</h3>
                    <p class="text-gray-600">Upload 3-5 text samples and our AI extracts your unique communication style, tone, and patterns.</p>
                </div>
                <div class="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow">
                    <div class="text-4xl mb-4">💬</div>
                    <h3 class="text-xl font-semibold mb-3">Approve-Only Chat</h3>
                    <p class="text-gray-600">Your AI twin generates drafts that you approve before sending. Full control over every message.</p>
                </div>
                <div class="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow">
                    <div class="text-4xl mb-4">🔗</div>
                    <h3 class="text-xl font-semibold mb-3">Shareable Profiles</h3>
                    <p class="text-gray-600">Create tokenized public profiles to showcase your AI twin's style and capabilities.</p>
                </div>
            </div>

            <div class="bg-green-50 rounded-lg p-6 mb-8">
                <h3 class="text-lg font-semibold text-green-900 mb-2">✨ How It Works</h3>
                <div class="grid md:grid-cols-4 gap-4 text-sm">
                    <div class="text-center">
                        <div class="text-2xl mb-2">1️⃣</div>
                        <p class="text-green-800">Upload your text samples</p>
                    </div>
                    <div class="text-center">
                        <div class="text-2xl mb-2">2️⃣</div>
                        <p class="text-green-800">AI analyzes your style</p>
                    </div>
                    <div class="text-center">
                        <div class="text-2xl mb-2">3️⃣</div>
                        <p class="text-green-800">Create your AI twin</p>
                    </div>
                    <div class="text-center">
                        <div class="text-2xl mb-2">4️⃣</div>
                        <p class="text-green-800">Start chatting!</p>
                    </div>
                </div>
            </div>

            <div class="flex justify-end">
                <a 
                    href="/auth"
                    class="inline-block bg-blue-600 text-white py-3 px-8 rounded-lg hover:bg-blue-700 transition-colors font-semibold"
                >
                    Login / Signup
                </a>
            </div>

            <div class="bg-blue-50 rounded-lg p-6 mt-8">
                <h3 class="text-lg font-semibold text-blue-900 mb-2">🔒 Privacy & Safety</h3>
                <p class="text-blue-800">This is a validation project. All AI-generated content is clearly labeled and you maintain full control over your data.</p>
            </div>
        </div>
    </div>
    `
    });
});
app.get('/auth', (req, res) => {
    if (req.user) {
        return res.redirect('/dashboard');
    }
    res.render('auth', {
        title: 'Login / Signup - AI Twin',
        user: req.user,
        csrfToken: res.locals.csrfToken,
    });
});
app.get('/login', (req, res) => {
    if (req.user) {
        return res.redirect('/dashboard');
    }
    res.redirect('/auth');
});
app.get('/login/verify', (req, res) => {
    const email = req.query.email;
    res.render('layout', {
        title: 'Verify OTP - AI Twin',
        user: req.user,
        csrfToken: res.locals.csrfToken,
        body: `
    <div class="px-4 py-6 sm:px-0">
        <div class="max-w-md mx-auto">
            <div class="bg-white rounded-lg shadow-lg p-8">
                <h1 class="text-2xl font-bold text-gray-900 mb-6 text-center">Verify Your Email</h1>
                
                <div id="errorMessage" class="hidden mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded"></div>
                <div id="successMessage" class="hidden mb-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded"></div>
                
                <div class="mb-4 text-center">
                    <p class="text-sm text-gray-600 mb-2">
                        We sent a 6-digit code to:
                    </p>
                    <p class="font-medium text-gray-900">${email || 'your email'}</p>
                    <div class="mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
                        <strong>Development Mode:</strong> Check the server console for your OTP code
                    </div>
                </div>
                
                <form id="verifyForm">
                    <div class="mb-4">
                        <label for="code" class="block text-sm font-medium text-gray-700 mb-2">
                            Enter Verification Code
                        </label>
                        <input 
                            type="text" 
                            id="code" 
                            name="code" 
                            required
                            maxlength="6"
                            pattern="[0-9]{6}"
                            class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center text-2xl tracking-widest"
                            placeholder="123456"
                        >
                    </div>
                    
                    <button 
                        type="submit"
                        id="verifyBtn"
                        class="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors font-semibold"
                    >
                        Verify Code
                    </button>
                    <input type="hidden" name="_csrf" value="${res.locals.csrfToken}">
                    <input type="hidden" name="email" value="${email || ''}">
                </form>
                
                <div class="mt-6 text-center">
                    <p class="text-sm text-gray-600">
                        Didn't receive the code? 
                        <a href="/login" class="text-blue-600 hover:text-blue-800">Try again</a>
                    </p>
                </div>
            </div>
        </div>
    </div>

    <script>
    function showError(message) {
        const errorDiv = document.getElementById('errorMessage');
        const successDiv = document.getElementById('successMessage');
        errorDiv.textContent = message;
        errorDiv.classList.remove('hidden');
        successDiv.classList.add('hidden');
    }
    
    function showSuccess(message) {
        const errorDiv = document.getElementById('errorMessage');
        const successDiv = document.getElementById('successMessage');
        successDiv.textContent = message;
        successDiv.classList.remove('hidden');
        errorDiv.classList.add('hidden');
    }
    
    function hideMessages() {
        document.getElementById('errorMessage').classList.add('hidden');
        document.getElementById('successMessage').classList.add('hidden');
    }

    // Auto-focus on code input
    document.getElementById('code').focus();

    // Format code input (only numbers, max 6 digits)
    document.getElementById('code').addEventListener('input', function(e) {
        e.target.value = e.target.value.replace(/[^0-9]/g, '').slice(0, 6);
    });

    document.getElementById('verifyForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const code = document.getElementById('code').value;
        const email = document.querySelector('input[name="email"]').value;
        const verifyBtn = document.getElementById('verifyBtn');
        const originalText = verifyBtn.textContent;
        
        // Validate code
        if (!code || code.length !== 6) {
            showError('Please enter a valid 6-digit code');
            return;
        }
        
        // Show loading state
        verifyBtn.textContent = 'Verifying...';
        verifyBtn.disabled = true;
        hideMessages();
        
        try {
            console.log('Verifying code:', code, 'for email:', email);
            
            const response = await fetch('/test-otp', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    email: email,
                    code: code
                })
            });
            
            console.log('Response status:', response.status);
            const result = await response.json();
            console.log('Response data:', result);
            
            if (response.ok) {
                showSuccess('OTP verification successful! Redirecting to dashboard...');
                // Redirect to dashboard after 2 seconds
                setTimeout(() => {
                    window.location.href = '/dashboard';
                }, 2000);
            } else {
                showError(result.error || 'Invalid verification code');
            }
        } catch (error) {
            console.error('Verification error:', error);
            showError('Network error. Please try again.');
        } finally {
            verifyBtn.textContent = originalText;
            verifyBtn.disabled = false;
        }
    });
    </script>
    `
    });
});
app.get('/signup', (req, res) => {
    if (req.user) {
        return res.redirect('/dashboard');
    }
    res.redirect('/auth');
});
app.get('/profile', (req, res) => {
    if (!req.user) {
        return res.redirect('/auth');
    }
    res.render('profile', {
        title: 'Profile - AI Twin',
        user: req.user,
        csrfToken: res.locals.csrfToken,
    });
});
app.get('/dashboard', (req, res) => {
    if (!req.user) {
        return res.redirect('/auth');
    }
    res.render('layout', {
        title: 'Dashboard - AI Twin',
        user: req.user,
        csrfToken: res.locals.csrfToken,
        body: `
    <div class="px-4 py-6 sm:px-0">
        <div class="max-w-7xl mx-auto">
            <div class="mb-8">
                <h1 class="text-3xl font-bold text-gray-900">Welcome back, ${req.user.handle || req.user.email}!</h1>
                <p class="text-gray-600 mt-2">Manage your AI twins and conversations</p>
            </div>
            
            <div class="grid md:grid-cols-2 gap-8">
                <!-- Create New Twin -->
                <div class="bg-white rounded-lg shadow-lg p-6">
                    <h2 class="text-xl font-semibold text-gray-800 mb-4">Create New AI Twin</h2>
                    <p class="text-gray-600 mb-4">
                        Upload your text samples to create an AI version of yourself.
                    </p>
                    <a href="/twin/create" class="inline-block bg-primary text-white py-2 px-4 rounded-md hover:bg-secondary transition-colors font-semibold">
                        Create Twin
                    </a>
                </div>
                
                <!-- My Twins -->
                <div class="bg-white rounded-lg shadow-lg p-6">
                    <h2 class="text-xl font-semibold text-gray-800 mb-4">My AI Twins</h2>
                    <p class="text-gray-600 mb-4">
                        You haven't created any AI twins yet.
                    </p>
                    <a href="/twin/create" class="inline-block bg-gray-500 text-white py-2 px-4 rounded-md hover:bg-gray-600 transition-colors font-semibold">
                        Get Started
                    </a>
                </div>
            </div>
            
            <!-- Recent Activity -->
            <div class="mt-8 bg-white rounded-lg shadow-lg p-6">
                <h2 class="text-xl font-semibold text-gray-800 mb-4">Recent Activity</h2>
                <p class="text-gray-600">No recent activity to show.</p>
            </div>
        </div>
    </div>
    `
    });
});
app.get('/twin/create', (req, res) => {
    if (!req.user) {
        return res.redirect('/auth');
    }
    res.render('twin_create', {
        title: 'Create Twin - AI Twin',
        user: req.user,
        csrfToken: res.locals.csrfToken,
    });
});
app.get('/chat/:id', (req, res) => {
    if (!req.user) {
        return res.redirect('/auth');
    }
    res.render('chat', {
        title: 'Chat - AI Twin',
        user: req.user,
        chatId: req.params.id,
        csrfToken: res.locals.csrfToken,
    });
});
app.get('/p/:handle', (req, res) => {
    res.render('profile_public', {
        title: `Profile - ${req.params.handle}`,
        handle: req.params.handle,
        token: req.query.t,
        csrfToken: res.locals.csrfToken,
    });
});
app.use((err, req, res, next) => {
    logger_1.logger.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});
app.use((req, res) => {
    res.status(404).render('404', {
        title: 'Page Not Found - AI Twin',
        csrfToken: res.locals.csrfToken,
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