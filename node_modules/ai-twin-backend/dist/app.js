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
const env_1 = require("./config/env");
const logger_1 = require("./config/logger");
const database_1 = require("./config/database");
const authRoutes_1 = __importDefault(require("./modules/auth/authRoutes"));
const twinRoutes_1 = __importDefault(require("./modules/twin/twinRoutes"));
const chatRoutes_1 = __importDefault(require("./modules/chat/chatRoutes"));
const profileRoutes_1 = __importDefault(require("./modules/profile/profileRoutes"));
const inviteRoutes_1 = __importDefault(require("./modules/invite/inviteRoutes"));
const analyticsRoutes_1 = __importDefault(require("./modules/analytics/analyticsRoutes"));
const jwtCookie_1 = require("./middleware/jwtCookie");
const csrf_1 = require("./middleware/csrf");
const auth_1 = require("./middleware/auth");
const app = (0, express_1.default)();
app.use((0, helmet_1.default)({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com", "https://fonts.googleapis.com"],
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
if (env_1.config.nodeEnv === 'development') {
    app.use((0, morgan_1.default)('dev'));
}
else {
    app.use((0, morgan_1.default)('combined'));
}
app.set('view engine', 'ejs');
app.set('views', '../frontend/src/views');
app.use(express_1.default.static('../frontend/src/public'));
app.use('/uploads', express_1.default.static('public/uploads'));
app.use(csrf_1.generateCSRFToken);
app.use('/api/auth', authRoutes_1.default);
app.use('/api/twin', twinRoutes_1.default);
app.use('/api/chat', chatRoutes_1.default);
app.use('/api/profile', profileRoutes_1.default);
app.use('/api/invite', inviteRoutes_1.default);
app.use('/api/metrics', analyticsRoutes_1.default);
app.get('/test', (req, res) => {
    res.json({ message: 'Server is working!', timestamp: new Date().toISOString() });
});
app.get('/test-session', (req, res) => {
    res.json({
        session: req.session,
        userId: req.session?.userId,
        userEmail: req.session?.userEmail,
        testValue: req.session?.testValue
    });
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
        csrfToken: res.locals['csrfToken'],
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
        csrfToken: res.locals['csrfToken'],
    });
});
app.get('/login', (req, res) => {
    if (req.user) {
        return res.redirect('/dashboard');
    }
    res.redirect('/auth');
});
app.get('/login/verify', (req, res) => {
    const email = req.query['email'];
    res.render('layout', {
        title: 'Verify OTP - AI Twin',
        user: req.user,
        csrfToken: res.locals['csrfToken'],
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
                    <input type="hidden" name="_csrf" value="${res.locals['csrfToken']}">
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
app.get('/verify-otp', (req, res) => {
    const email = req.query['email'];
    const type = req.query['type'];
    const otp = req.query['otp'];
    res.render('verify-otp', {
        title: 'Verify OTP - AI Twin',
        user: req.user,
        csrfToken: res.locals['csrfToken'],
        email: email,
        type: type,
        actualOTP: otp || '123456'
    });
});
app.get('/signup/profile', (req, res) => {
    const email = req.query['email'];
    res.render('signup-profile', {
        title: 'Complete Profile - AI Twin',
        user: req.user,
        csrfToken: res.locals['csrfToken'],
        email: email
    });
});
app.get('/forgot-password', (req, res) => {
    res.render('forgot-password', {
        title: 'Forgot Password - AI Twin',
        user: req.user,
        csrfToken: res.locals['csrfToken']
    });
});
app.get('/forgot-password/verify', (req, res) => {
    const email = req.query['email'];
    res.render('forgot-password-verify', {
        title: 'Verify Reset Code - AI Twin',
        user: req.user,
        csrfToken: res.locals['csrfToken'],
        email: email
    });
});
app.get('/reset-password', (req, res) => {
    const email = req.query['email'];
    res.render('reset-password', {
        title: 'Reset Password - AI Twin',
        user: req.user,
        csrfToken: res.locals['csrfToken'],
        email: email
    });
});
app.get('/test-profile', jwtCookie_1.extractJWTFromCookie, async (req, res) => {
    if (!req.user) {
        return res.redirect('/auth');
    }
    try {
        const user = await database_1.userQueries.findByEmail(req.user.email);
        if (!user) {
            return res.redirect('/auth');
        }
        res.json({
            success: true,
            user: user,
            csrfToken: res.locals['csrfToken']
        });
    }
    catch (error) {
        console.error('Test profile error:', error);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});
app.get('/profile', jwtCookie_1.extractJWTFromCookie, async (req, res) => {
    console.log('Profile route accessed. User:', req.user);
    if (!req.user) {
        console.log('No user in JWT, redirecting to auth');
        return res.redirect('/auth');
    }
    try {
        console.log('Fetching user data for email:', req.user.email);
        const user = await database_1.userQueries.findByEmail(req.user.email);
        console.log('User query result:', user);
        if (!user) {
            console.log('User not found in database, redirecting to auth');
            return res.redirect('/auth');
        }
        console.log('User found, rendering profile page');
        const userWithDefaults = {
            ...user,
            dob: user.dob || null,
            phone: user?.phone || null,
            bio: user?.bio || null
        };
        res.render('profile', {
            title: 'Profile - AI Twin',
            user: userWithDefaults,
            csrfToken: res.locals['csrfToken'],
        });
    }
    catch (error) {
        console.error('Profile page error:', error);
        logger_1.logger.error('Profile page error:', error);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});
app.get('/change-password', jwtCookie_1.extractJWTFromCookie, async (req, res) => {
    if (!req.user) {
        return res.redirect('/auth');
    }
    try {
        const user = await database_1.userQueries.findByEmail(req.user.email);
        if (!user) {
            return res.redirect('/auth');
        }
        res.render('change-password', {
            title: 'Change Password - AI Twin',
            user: user,
            csrfToken: res.locals['csrfToken'],
        });
    }
    catch (error) {
        logger_1.logger.error('Change password page error:', error);
        res.status(500).send('Internal server error');
    }
});
app.get('/dashboard', jwtCookie_1.extractJWTFromCookie, async (req, res) => {
    if (!req.user) {
        return res.redirect('/auth');
    }
    const fullUser = await database_1.userQueries.findByEmail(req.user.email);
    if (!fullUser) {
        return res.redirect('/auth');
    }
    const userTwins = await database_1.twinQueries.findByUserId(fullUser.id);
    const hasTwins = userTwins.length > 0;
    const user = {
        id: fullUser.id,
        email: fullUser.email,
        handle: fullUser.handle,
        name: fullUser.name,
        profileImage: fullUser.profileImage,
    };
    res.render('layout', {
        title: 'Dashboard - AI Twin',
        user: user,
        hasTwins: hasTwins,
        twins: userTwins,
        csrfToken: res.locals['csrfToken'],
        body: `
    <div class="px-4 py-6 sm:px-0">
        <div class="max-w-6xl mx-auto">
            <h1 class="text-3xl font-bold text-gray-900 mb-8">Welcome, ${user?.handle || user?.email || 'User'}!</h1>
            
            <div class="grid md:grid-cols-2 gap-8 mb-8">
                ${hasTwins ? `
                    <!-- Chat with Twin Button -->
                    <div class="bg-white rounded-lg shadow p-6">
                        <h3 class="text-lg font-semibold text-gray-800 mb-2">Chat with Your AI Twin</h3>
                        <p class="text-gray-600 mb-4">Start a conversation with your AI twin</p>
                        <button onclick="startNewChat()" class="bg-primary text-white px-4 py-2 rounded-lg hover:bg-secondary transition-colors">
                            Start Chat
                        </button>
                    </div>
                ` : `
                    <!-- Create Twin Button -->
                    <div class="bg-white rounded-lg shadow p-6">
                        <h3 class="text-lg font-semibold text-gray-800 mb-2">Create New AI Twin</h3>
                        <p class="text-gray-600 mb-4">Upload text samples to create your AI twin</p>
                        <a href="/twin/create" class="bg-primary text-white px-4 py-2 rounded-lg hover:bg-secondary transition-colors">
                            Create Twin
                        </a>
                    </div>
                `}
                
                <!-- My Twins Section -->
                <div class="bg-white rounded-lg shadow p-6">
                    <h3 class="text-lg font-semibold text-gray-800 mb-4">My AI Twins</h3>
                    <p class="text-gray-600 mb-4">
                        ${hasTwins ? `You have ${userTwins.length} AI twin${userTwins.length > 1 ? 's' : ''} created.` : 'You haven\'t created any AI twins yet.'}
                    </p>
                    <a href="/my-twins" class="inline-block bg-primary text-white py-2 px-4 rounded-md hover:bg-secondary transition-colors font-semibold">
                        View My Twins
                    </a>
                    <div id="twinsList" class="mt-4 space-y-3"></div>
                </div>
            </div>
            
            ${hasTwins ? `
            <div class="grid md:grid-cols-2 gap-6 mb-8">
                <div class="bg-white rounded-lg shadow p-6">
                    <h3 class="text-lg font-semibold text-gray-800 mb-2">Profile Link</h3>
                    <p class="text-gray-600 mb-4">Generate shareable profile</p>
                    <button onclick="generateProfileLink()" class="bg-primary text-white px-4 py-2 rounded-lg hover:bg-secondary transition-colors">
                        Generate Link
                    </button>
                </div>
                
                <div class="bg-white rounded-lg shadow p-6">
                    <h3 class="text-lg font-semibold text-gray-800 mb-2">Invite Friends</h3>
                    <p class="text-gray-600 mb-4">Create referral link</p>
                    <button onclick="createInvite()" class="bg-primary text-white px-4 py-2 rounded-lg hover:bg-secondary transition-colors">
                        Create Invite
                    </button>
                </div>
            </div>
            ` : ''}

            <!-- Recent Chats Section -->
            <div class="mt-8 bg-white rounded-lg shadow-lg p-6">
                <h2 class="text-xl font-semibold text-gray-800 mb-4">Recent Chats</h2>
                <div id="chatsList" class="space-y-3">
                    <p class="text-gray-500">Loading chats...</p>
                </div>
            </div>
        </div>
    </div>
    
    <script>
        async function startNewChat() {
            try {
                const response = await fetch('/api/chat/start', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': '${res.locals['csrfToken']}'
                    },
                    body: JSON.stringify({ twinId: 'latest' })
                });
                
                const result = await response.json();
                
                if (response.ok) {
                    window.location.href = result.redirect;
                } else {
                    alert(result.error || 'Failed to start chat');
                }
            } catch (error) {
                console.error('Start chat error:', error);
                alert('Network error. Please try again.');
            }
        }
        
        async function loadTwins() {
            try {
                const response = await fetch('/api/twin', {
                    method: 'GET',
                    credentials: 'include',
                    headers: {
                        'X-CSRF-Token': '${res.locals['csrfToken']}'
                    }
                });
                
                const result = await response.json();
                
                if (response.ok) {
                    const twinsList = document.getElementById('twinsList');
                    if (result.twins.length === 0) {
                        twinsList.innerHTML = '<p class="text-gray-500">No twins created yet.</p>';
                    } else {
                        twinsList.innerHTML = result.twins.map(twin => \`
                            <div class="border rounded-lg p-3">
                                <p class="font-medium">Twin #\${twin.id.slice(-6)}</p>
                                <p class="text-sm text-gray-600">Created: \${new Date(twin.createdAt).toLocaleDateString()}</p>
                            </div>
                        \`).join('');
                    }
                }
            } catch (error) {
                console.error('Load twins error:', error);
            }
        }
        
        async function generateProfileLink() {
            try {
                const response = await fetch('/api/profile/link', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': '${res.locals['csrfToken']}'
                    }
                });
                
                const result = await response.json();
                
                if (response.ok) {
                    navigator.clipboard.writeText(window.location.origin + result.profileUrl);
                    alert('Profile link copied to clipboard!');
                } else {
                    alert(result.error || 'Failed to generate profile link');
                }
            } catch (error) {
                console.error('Generate profile link error:', error);
                alert('Network error. Please try again.');
            }
        }
        
        async function createInvite() {
            try {
                const response = await fetch('/api/invite/create', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': '${res.locals['csrfToken']}'
                    }
                });
                
                const result = await response.json();
                
                if (response.ok) {
                    navigator.clipboard.writeText(window.location.origin + result.inviteUrl);
                    alert('Invite link copied to clipboard!');
                } else {
                    alert(result.error || 'Failed to create invite');
                }
            } catch (error) {
                console.error('Create invite error:', error);
                alert('Network error. Please try again.');
            }
        }
    </script>
    `
    });
});
app.get('/my-twins', jwtCookie_1.requireJWTFromCookie, async (req, res) => {
    try {
        console.log('=== MY TWINS ENDPOINT ===');
        console.log('req.user:', req.user);
        console.log('req.user.id:', req.user?.id);
        console.log('========================');
        if (!req.user || !req.user.id) {
            return res.status(401).json({ error: 'User not authenticated' });
        }
        const twins = await database_1.db.query(`
      SELECT id, "styleVector", "sampleReply", "createdAt" 
      FROM "Twin" 
      WHERE "userId" = $1 
      ORDER BY "createdAt" DESC
    `, [req.user.id]);
        console.log('Found twins:', twins.rows);
        res.render('my-twins', {
            title: 'My AI Twins',
            user: req.user,
            twins: twins.rows
        });
    }
    catch (error) {
        console.error('Error fetching twins:', error);
        res.status(500).json({ error: 'Failed to load twins', details: error.message });
    }
});
app.get('/twin/create', jwtCookie_1.extractJWTFromCookie, auth_1.optionalAuth, (req, res) => {
    const user = req.user || req.user;
    if (!user) {
        return res.redirect('/auth');
    }
    res.render('twin_create', {
        title: 'Create Twin - AI Twin',
        user: user,
        csrfToken: res.locals['csrfToken'],
    });
});
app.get('/chat/history', jwtCookie_1.requireJWTFromCookie, (req, res) => {
    res.render('chat-history', {
        title: 'Chat History - AI Twin',
        user: req.user,
        csrfToken: res.locals['csrfToken'],
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
        csrfToken: res.locals['csrfToken'],
    });
});
app.get('/p/:handle', (req, res) => {
    res.render('profile_public', {
        title: `Profile - ${req.params.handle}`,
        handle: req.params.handle,
        token: req.query['t'],
        csrfToken: res.locals['csrfToken'],
    });
});
app.use((err, req, res, next) => {
    logger_1.logger.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});
app.use((req, res) => {
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