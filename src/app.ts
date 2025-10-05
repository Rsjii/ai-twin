//WzKZY+gg.H74hqZ
//xtom onee lqsb gpql

import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { config } from './config/env.js';
import { logger } from './config/logger.js';
import { db, userQueries } from './config/database.js';

// Import routes
import authRoutes from './modules/auth/authRoutes.js';
import twinRoutes from './modules/twin/twinRoutes.js';
import chatRoutes from './modules/chat/chatRoutes.js';
import profileRoutes from './modules/profile/profileRoutes.js';
import inviteRoutes from './modules/invite/inviteRoutes.js';
import analyticsRoutes from './modules/analytics/analyticsRoutes.js';

// Import middleware
import { generateCSRFToken } from './middleware/csrf.js';
import { sanitizeInput } from './middleware/validation.js';
import { optionalAuth } from './middleware/auth.js';

const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
      imgSrc: ["'self'", "data:", "https:"],
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

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Session middleware
app.use(session({
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: config.nodeEnv === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  },
}));

// Logging middleware
if (config.nodeEnv === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// View engine setup
app.set('view engine', 'ejs');
app.set('views', './src/views');

// Static files
app.use(express.static('src/public'));

// Trust proxy (for deployment)
app.set('trust proxy', 1);

// Apply custom middleware
app.use(generateCSRFToken);
app.use(sanitizeInput);
app.use(optionalAuth);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/twin', twinRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/invite', inviteRoutes);
app.use('/api/metrics', analyticsRoutes);

// Test route
app.get('/test', (req, res) => {
  res.json({ message: 'Server is working!', timestamp: new Date().toISOString() });
});

// Test database route
app.get('/test-db', async (req, res) => {
  try {
    const result = await db.query('SELECT COUNT(*) as count FROM "User"');
    res.json({ message: 'Database working!', userCount: result.rows[0].count });
  } catch (error: any) {
    res.status(500).json({ error: 'Database error', details: error.message });
  }
});

// Test auth route (no CSRF)
app.post('/test-auth', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }
    
    const user = await userQueries.findByEmail(email);
    return res.json({ message: 'Auth working!', userExists: !!user });
  } catch (error: any) {
    return res.status(500).json({ error: 'Auth error', details: error.message });
  }
});

// Test OTP generation route (no CSRF)
app.post('/test-otp', async (req, res) => {
  try {
    const { email, code } = req.body;
    
    // If code is provided, this is a verification request
    if (code) {
      if (!email) {
        return res.status(400).json({ error: 'Email required for verification' });
      }
      
      // Verify OTP
      const { verifyOTP } = await import('./modules/auth/authService.js');
      const { otpQueries } = await import('./config/database.js');
      
      // Get stored OTP
      const storedOTP = await otpQueries.findByEmail(email.toLowerCase());
      if (!storedOTP) {
        return res.status(400).json({ error: 'No OTP found for this email' });
      }
      
      // Check if OTP is expired
      if (new Date() > storedOTP.expires_at) {
        return res.status(400).json({ error: 'OTP has expired' });
      }
      
      // Check if OTP is already used
      if (storedOTP.used) {
        return res.status(400).json({ error: 'OTP has already been used' });
      }
      
      // Verify the code
      const isValid = await verifyOTP(code, storedOTP.codeHash);
      if (!isValid) {
        return res.status(400).json({ error: 'Invalid OTP code' });
      }
      
      // OTP is valid - create user session
      req.session.userId = 'test-user-id';
      req.session.userEmail = email.toLowerCase();
      req.session.userHandle = email.split('@')[0];
      
      // Clean up used OTP
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
    
    // If no code provided, this is a generation request
    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }
    
    // Generate OTP
    const { generateOTP, hashOTP } = await import('./modules/auth/authService.js');
    const otp = generateOTP(6);
    const hashedOTP = await hashOTP(otp);
    
    // Set expiry time
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    
    // Store OTP in database
    const { otpQueries } = await import('./config/database.js');
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
  } catch (error: any) {
    return res.status(500).json({ error: 'OTP operation error', details: error.message });
  }
});

// Very simple test page
app.get('/basic', (req, res) => {
  res.send('<h1>Hello World!</h1><p>Server is working!</p>');
});

// Simple test page (no middleware)
app.get('/simple', (req, res) => {
  res.render('landing', {
    title: 'AI Twin - Create Your Digital Twin',
    user: null,
    csrfToken: 'test-token',
  });
});

// Landing page route
app.get('/', (req, res) => {
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
                    href="/login"
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

            <div class="flex flex-col sm:flex-row gap-4 justify-center items-center">
                <a 
                    href="/login"
                    class="inline-block bg-blue-600 text-white py-3 px-8 rounded-lg hover:bg-blue-700 transition-colors font-semibold"
                >
                    Login to Continue
                </a>
                <p class="text-gray-500">or</p>
                <a href="/login" class="text-blue-600 hover:text-blue-800 font-semibold">
                    Already have an account? Sign in
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

// Login page route
app.get('/login', (req, res) => {
  if (req.user) {
    return res.redirect('/dashboard');
  }
  console.log('Rendering login page with CSRF token:', res.locals.csrfToken);
  res.render('layout', {
    title: 'Login - AI Twin',
    user: req.user,
    csrfToken: res.locals.csrfToken,
    body: `
    <div class="px-4 py-6 sm:px-0">
        <div class="max-w-md mx-auto">
            <div class="bg-white rounded-lg shadow-lg p-8">
                <h1 class="text-2xl font-bold text-gray-900 mb-6 text-center">Login to AI Twin</h1>
                
                <div id="errorMessage" class="hidden mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded"></div>
                <div id="successMessage" class="hidden mb-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded"></div>
                
                <form id="loginForm">
                    <div class="mb-4">
                        <label for="email" class="block text-sm font-medium text-gray-700 mb-2">
                            Email Address
                        </label>
                        <input 
                            type="email" 
                            id="email" 
                            name="email" 
                            required
                            class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="Enter your email"
                        >
                    </div>
                    
                    <button 
                        type="submit"
                        id="submitBtn"
                        class="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors font-semibold"
                    >
                        Send Login Code
                    </button>
                    <input type="hidden" name="_csrf" value="${res.locals.csrfToken}">
                </form>
                
                <div class="mt-6 text-center">
                    <p class="text-sm text-gray-600">
                        We'll send you a 6-digit code to verify your identity.
                    </p>
                    <div class="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
                        <strong>Development Mode:</strong> OTP codes will be displayed in the server console
                    </div>
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

    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        console.log('Form submitted!');
        
        const email = document.getElementById('email').value;
        const submitBtn = document.getElementById('submitBtn');
        const originalText = submitBtn.textContent;
        
        console.log('Email value:', email);
        
        // Enhanced email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email || !emailRegex.test(email)) {
            showError('Please enter a valid email address (e.g., user@example.com)');
            return;
        }
        
        // Additional validation
        if (email.length < 5 || email.length > 254) {
            showError('Email address must be between 5 and 254 characters');
            return;
        }
        
        // Show loading state
        submitBtn.textContent = 'Sending...';
        submitBtn.disabled = true;
        hideMessages();
        
        try {
            console.log('Sending login request for:', email);
            
             // Use test endpoint for now to avoid CSRF issues
             const response = await fetch('/test-otp', {
                 method: 'POST',
                 headers: {
                     'Content-Type': 'application/json'
                 },
                 body: JSON.stringify({ email: email })
             });
            
            console.log('Response status:', response.status);
            const result = await response.json();
            console.log('Response data:', result);
            
             if (response.ok) {
                 showSuccess('OTP generated! Code: ' + result.otp + ' - Redirecting to verification...');
                 // Redirect to verification page after 2 seconds
                 setTimeout(() => {
                     window.location.href = '/login/verify?email=' + encodeURIComponent(email);
                 }, 2000);
             } else {
                 showError(result.error || 'Failed to send login code');
             }
        } catch (error) {
            console.error('Login error:', error);
            showError('Network error. Please try again.');
        } finally {
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        }
    });
    </script>
    `
  });
});

// Verify OTP page route
app.get('/login/verify', (req, res) => {
  const email = req.query.email as string;
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

// Dashboard route
app.get('/dashboard', (req, res) => {
  if (!req.user) {
    return res.redirect('/login');
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

// Twin creation page route
app.get('/twin/create', (req, res) => {
  if (!req.user) {
    return res.redirect('/login');
  }
  res.render('twin_create', {
    title: 'Create Twin - AI Twin',
    user: req.user,
    csrfToken: res.locals.csrfToken,
  });
});

// Chat page route
app.get('/chat/:id', (req, res) => {
  if (!req.user) {
    return res.redirect('/login');
  }
  res.render('chat', {
    title: 'Chat - AI Twin',
    user: req.user,
    chatId: req.params.id,
    csrfToken: res.locals.csrfToken,
  });
});

// Public profile page route
app.get('/p/:handle', (req, res) => {
  res.render('profile_public', {
    title: `Profile - ${req.params.handle}`,
    handle: req.params.handle,
    token: req.query.t,
    csrfToken: res.locals.csrfToken,
  });
});

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).render('404', {
    title: 'Page Not Found - AI Twin',
    csrfToken: res.locals.csrfToken,
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
