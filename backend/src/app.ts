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
import { db, userQueries, twinQueries } from './config/database';
import { prisma } from './config/prisma';

// Import routes
import authRoutes from './modules/auth/authRoutes';
import twinRoutes from './modules/twin/twinRoutes';
import publicTwinRoutes from './modules/twin/publicTwinRoutes';
import chatRoutes from './modules/chat/chatRoutes';
import publicChatRoutes from './modules/chat/publicChatRoutes';
import socialRoutes from './modules/social/socialRoutes';
import discoverRoutes from './modules/discover/discoverRoutes';
import shareRoutes from './modules/share/shareRoutes';
import privacyRoutes from './modules/privacy/privacyRoutes';
import moderationRoutes from './modules/moderation/moderationRoutes';
import profileRoutes from './modules/profile/profileRoutes';
import inviteRoutes from './modules/invite/inviteRoutes';
import analyticsRoutes from './modules/analytics/analyticsRoutes';

// Import JWT middleware
import { authenticateJWT, optionalJWT } from './middleware/jwtAuth';
import { extractJWTFromCookie, requireJWTFromCookie } from './middleware/jwtCookie';

// Import middleware
import { generateCSRFToken } from './middleware/csrf';
import { sanitizeInput } from './middleware/validation';
import { optionalAuth } from './middleware/auth';

const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com", "https://fonts.googleapis.com"],
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

// Logging middleware
if (config.nodeEnv === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// View engine setup
app.set('view engine', 'ejs');
app.set('views', '../frontend/src/views');

// Static files
app.use(express.static('../frontend/src/public'));
app.use('/uploads', express.static('public/uploads'));

// Apply custom middleware
app.use(generateCSRFToken);
// app.use(sanitizeInput); // Temporarily disabled for debugging
// app.use(optionalAuth); // Temporarily disabled for debugging - conflicts with JWT

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/twin', twinRoutes);
app.use('/api/public-twin', publicTwinRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/public-chat', publicChatRoutes);
app.use('/api/social', socialRoutes);
app.use('/api/discover', discoverRoutes);
app.use('/api/share', shareRoutes);
app.use('/api/privacy', privacyRoutes);
app.use('/api/moderation', moderationRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/invite', inviteRoutes);
app.use('/api/metrics', analyticsRoutes);

// Discover page route
app.get('/discover', (req, res) => {
  res.render('discover');
});

// Public twin profile route (twinverse.ai/@handle)
app.get('/@:handle', async (req: any, res) => {
  try {
    const { handle } = req.params;
    
    // Get public twin profile
    const publicTwin = await db.query(`
      SELECT t.*, u.handle as userHandle, u.name as userName
      FROM "Twin" t
      JOIN "User" u ON t."userId" = u.id
      WHERE t."publicHandle" = $1 AND t."isPublic" = true
    `, [handle]);

    if (publicTwin.rows.length === 0) {
      return res.status(404).render('404', { 
        title: 'Twin Not Found',
        message: 'This twin profile is not public or does not exist'
      });
    }

    const twin = publicTwin.rows[0];
    
    // Render public profile page
    res.render('public-profile', {
      title: `@${handle} - AI Twin`,
      twin: {
        id: twin.id,
        publicHandle: twin.publicHandle,
        bio: twin.bio,
        profileImage: twin.profileImage,
        verified: twin.verified,
        likeCount: twin.likeCount,
        followCount: twin.followCount,
        chatCount: twin.chatCount,
        sampleReply: twin.sampleReply,
        createdAt: twin.createdAt,
        userHandle: twin.userHandle,
        userName: twin.userName
      }
    });

  } catch (error) {
    console.error('Public profile error:', error);
    res.status(500).render('404', { 
      title: 'Error',
      message: 'Something went wrong'
    });
  }
});

// Test route
app.get('/test', (req, res) => {
  res.json({ message: 'Server is working!', timestamp: new Date().toISOString() });
});

// Test session endpoint
app.get('/test-session', (req, res) => {
  res.json({ 
    session: req.session,
    userId: req.session?.userId,
    userEmail: req.session?.userEmail,
    testValue: req.session?.testValue
  });
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
  // If user is logged in, redirect to dashboard
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

// Unified Auth page route (Login/Signup)
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

// Login page route (redirects to unified auth)
app.get('/login', (req, res) => {
  if (req.user) {
    return res.redirect('/dashboard');
  }
  res.redirect('/auth');
});

// Verify OTP page route
app.get('/login/verify', (req, res) => {
  const email = req.query['email'] as string;
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

// Signup page route (redirects to unified auth)
app.get('/signup', (req, res) => {
  if (req.user) {
    return res.redirect('/dashboard');
  }
  res.redirect('/auth');
});

// Verify OTP page route
app.get('/verify-otp', (req, res) => {
  const email = req.query['email'] as string;
  const type = req.query['type'] as string; // 'signup' or 'forgot'
  const otp = req.query['otp'] as string; // Get OTP from URL parameters
  
  res.render('verify-otp', {
    title: 'Verify OTP - AI Twin',
    user: req.user,
    csrfToken: res.locals['csrfToken'],
    email: email,
    type: type,
    actualOTP: otp || '123456'
  });
});

// Signup profile completion page route
app.get('/signup/profile', (req, res) => {
  const email = req.query['email'] as string;
  
  res.render('signup-profile', {
    title: 'Complete Profile - AI Twin',
    user: req.user,
    csrfToken: res.locals['csrfToken'],
    email: email
  });
});

// Forgot password page route
app.get('/forgot-password', (req, res) => {
  res.render('forgot-password', {
    title: 'Forgot Password - AI Twin',
    user: req.user,
    csrfToken: res.locals['csrfToken']
  });
});

// Forgot password verification page route
app.get('/forgot-password/verify', (req, res) => {
  const email = req.query['email'] as string;
  
  res.render('forgot-password-verify', {
    title: 'Verify Reset Code - AI Twin',
    user: req.user,
    csrfToken: res.locals['csrfToken'],
    email: email
  });
});

// Reset password page route
app.get('/reset-password', (req, res) => {
  const email = req.query['email'] as string;
  
  res.render('reset-password', {
    title: 'Reset Password - AI Twin',
    user: req.user,
    csrfToken: res.locals['csrfToken'],
    email: email
  });
});

// Test profile route
app.get('/test-profile', extractJWTFromCookie, async (req, res) => {
  if (!req.user) {
    return res.redirect('/auth');
  }
  
  try {
    const user = await userQueries.findByEmail(req.user.email);
    if (!user) {
      return res.redirect('/auth');
    }

    res.json({
      success: true,
      user: user,
      csrfToken: res.locals['csrfToken']
    });
  } catch (error) {
    console.error('Test profile error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Profile page route
app.get('/profile', extractJWTFromCookie, async (req, res) => {
  console.log('Profile route accessed. User:', req.user);
  
  // Check if user is authenticated via JWT
  if (!req.user) {
    console.log('No user in JWT, redirecting to auth');
    return res.redirect('/auth');
  }

  try {
    console.log('Fetching user data for email:', req.user.email);
    // Fetch complete user data from database
    const user = await userQueries.findByEmail(req.user.email);
    console.log('User query result:', user);
    
    if (!user) {
      console.log('User not found in database, redirecting to auth');
      return res.redirect('/auth');
    }

    console.log('User found, rendering profile page');
    // Ensure all profile fields exist with default values
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
  } catch (error) {
    console.error('Profile page error:', error);
    logger.error('Profile page error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Change password page route
app.get('/change-password', extractJWTFromCookie, async (req, res) => {
  // Check if user is authenticated via JWT
  if (!req.user) {
    return res.redirect('/auth');
  }

  try {
    // Fetch complete user data from database
    const user = await userQueries.findByEmail(req.user.email);
    if (!user) {
      return res.redirect('/auth');
    }

    res.render('change-password', {
      title: 'Change Password - AI Twin',
      user: user,
      csrfToken: res.locals['csrfToken'],
    });
  } catch (error) {
    logger.error('Change password page error:', error);
    res.status(500).send('Internal server error');
  }
});

// Dashboard route
app.get('/dashboard', extractJWTFromCookie, generateCSRFToken, async (req: any, res) => {
  // Check if user is authenticated via JWT
  if (!req.user) {
    return res.redirect('/auth');
  }
  
  // Fetch full user data from database
  const fullUser = await userQueries.findByEmail(req.user.email);
  if (!fullUser) {
    return res.redirect('/auth');
  }
  
  // Check if user has created any twins
  const userTwins = await twinQueries.findByUserId(fullUser.id);
  const hasTwins = userTwins.length > 0;
  
  // Set user data with all fields including profileImage
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
                        <a href="/chat/continue" class="bg-primary text-white px-4 py-2 rounded-lg hover:bg-secondary transition-colors">
                            Start Chat
                        </a>
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
            
            <!-- Public Twin Management Section -->
            <div class="mb-8">
                <div class="bg-gradient-to-r from-green-500 to-blue-500 rounded-lg shadow-lg p-6 text-white">
                    <div class="flex items-center mb-4">
                        <div class="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center mr-4">
                            <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9v-9m0-9v9"></path>
                            </svg>
                        </div>
                        <div>
                            <h3 class="text-xl font-bold text-white">🌐 Public Twin Profile</h3>
                            <p class="text-white/90">Make your AI twin public and share it with the world!</p>
                        </div>
                    </div>
                    <div id="publicTwinStatus" class="mb-4">
                        <!-- Status will be loaded here -->
                    </div>
                    <div class="flex space-x-4">
                        <button onclick="loadPublicTwinStatus()" class="flex-1 bg-white/20 backdrop-blur-sm text-white py-3 px-6 rounded-lg hover:bg-white/30 transition-all duration-300 font-semibold border border-white/30">
                            <span class="flex items-center justify-center">
                                <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
                                </svg>
                                Manage Public Profile
                            </span>
                        </button>
                        <a href="/discover" class="flex-1 bg-white/20 backdrop-blur-sm text-white py-3 px-6 rounded-lg hover:bg-white/30 transition-all duration-300 font-semibold inline-flex items-center justify-center border border-white/30">
                            <span class="flex items-center justify-center">
                                <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                                </svg>
                                Discover Twins
                            </span>
                        </a>
                    </div>
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
                // Simply redirect to chat continue route
                window.location.href = '/chat/continue';
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
        
        // Public Twin Management Functions
        async function loadPublicTwinStatus() {
            try {
                const response = await fetch('/api/public-twin/my-profile');
                const data = await response.json();
                
                if (response.ok && data.success) {
                    displayPublicTwinStatus(data.twin);
                } else {
                    displayPublicTwinStatus(null);
                }
            } catch (error) {
                console.error('Load public twin status error:', error);
                displayPublicTwinStatus(null);
            }
        }

        function displayPublicTwinStatus(twin) {
            const statusContainer = document.getElementById('publicTwinStatus');
            
            if (twin && twin.isPublic) {
                statusContainer.innerHTML = \`
                    <div class="bg-white/20 backdrop-blur-sm rounded-lg p-4 border border-white/30">
                        <div class="flex items-center mb-3">
                            <div class="w-8 h-8 bg-green-500/20 rounded-full flex items-center justify-center mr-3">
                                <svg class="w-5 h-5 text-green-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                                </svg>
                            </div>
                            <div>
                                <h4 class="text-lg font-semibold text-white">Your twin is public!</h4>
                                <p class="text-white/80">@\${twin.publicHandle}</p>
                            </div>
                        </div>
                        <div class="grid grid-cols-3 gap-4 text-center mb-4">
                            <div>
                                <div class="text-2xl font-bold text-white">\${twin.likeCount || 0}</div>
                                <div class="text-sm text-white/80">Likes</div>
                            </div>
                            <div>
                                <div class="text-2xl font-bold text-white">\${twin.followCount || 0}</div>
                                <div class="text-sm text-white/80">Followers</div>
                            </div>
                            <div>
                                <div class="text-2xl font-bold text-white">\${twin.chatCount || 0}</div>
                                <div class="text-sm text-white/80">Chats</div>
                            </div>
                        </div>
                        <div class="flex space-x-3">
                            <a href="/@\${twin.publicHandle}" target="_blank" class="flex-1 bg-white/20 text-white py-2 px-4 rounded-lg hover:bg-white/30 transition-colors text-center">
                                View Public Profile
                            </a>
                            <button onclick="sharePublicTwin('\${twin.publicHandle}')" class="flex-1 bg-white/20 text-white py-2 px-4 rounded-lg hover:bg-white/30 transition-colors">
                                Share
                            </button>
                            <button onclick="editPublicProfile()" class="flex-1 bg-white/20 text-white py-2 px-4 rounded-lg hover:bg-white/30 transition-colors">
                                Edit
                            </button>
                        </div>
                    </div>
                \`;
            } else {
                statusContainer.innerHTML = \`
                    <div class="bg-white/20 backdrop-blur-sm rounded-lg p-4 border border-white/30">
                        <div class="flex items-center mb-3">
                            <div class="w-8 h-8 bg-gray-500/20 rounded-full flex items-center justify-center mr-3">
                                <svg class="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21"></path>
                                </svg>
                            </div>
                            <div>
                                <h4 class="text-lg font-semibold text-white">Your twin is private</h4>
                                <p class="text-white/80">Make it public to let others discover and chat with it</p>
                            </div>
                        </div>
                        <button onclick="makeTwinPublic()" class="w-full bg-white/20 text-white py-3 px-6 rounded-lg hover:bg-white/30 transition-colors font-semibold">
                            Make Twin Public
                        </button>
                    </div>
                \`;
            }
        }

        async function makeTwinPublic() {
            try {
                const response = await fetch('/api/public-twin/make-public', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': '${res.locals['csrfToken']}'
                    },
                    body: JSON.stringify({
                        bio: 'Check out my AI twin!',
                        publicHandle: generateHandle()
                    })
                });
                
                const result = await response.json();
                
                if (response.ok && result.success) {
                    alert('Twin made public successfully!');
                    loadPublicTwinStatus();
                } else {
                    alert(result.error || 'Failed to make twin public');
                }
            } catch (error) {
                console.error('Make twin public error:', error);
                alert('Network error. Please try again.');
            }
        }

        async function sharePublicTwin(handle) {
            const url = \`\${window.location.origin}/@\${handle}\`;
            try {
                await navigator.clipboard.writeText(url);
                alert('Public profile link copied to clipboard!');
            } catch (error) {
                console.error('Copy to clipboard error:', error);
                alert('Failed to copy link. Please copy manually: ' + url);
            }
        }

        function editPublicProfile() {
            alert('Edit profile functionality coming soon!');
        }

        function generateHandle() {
            const adjectives = ['cool', 'smart', 'awesome', 'brilliant', 'amazing', 'fantastic', 'incredible', 'wonderful'];
            const nouns = ['twin', 'ai', 'bot', 'assistant', 'helper', 'companion', 'friend', 'buddy'];
            const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
            const noun = nouns[Math.floor(Math.random() * nouns.length)];
            const num = Math.floor(Math.random() * 1000);
            return \`\${adj}\${noun}\${num}\`;
        }
        
        // Load public twin status on page load
        document.addEventListener('DOMContentLoaded', () => {
            loadPublicTwinStatus();
        });
    </script>
    `
  });
});

// My Twins page route
// My Twins page route
app.get('/my-twins', requireJWTFromCookie, async (req: any, res) => {
  try {
    console.log('=== MY TWINS ENDPOINT ===');
    console.log('req.user:', req.user);
    console.log('req.user.id:', (req.user as any)?.id);
    console.log('========================');
    
    if (!req.user || !(req.user as any).id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Fetch user's twins from database
    const twins = await db.query(`
      SELECT id, "styleVector", "sampleReply", "createdAt" 
      FROM "Twin" 
      WHERE "userId" = $1 
      ORDER BY "createdAt" DESC
    `, [(req.user as any).id]);

    console.log('Found twins:', twins.rows);

    res.render('my-twins', { 
      title: 'My AI Twins',
      user: req.user,
      twins: twins.rows
    });
  } catch (error) {
    console.error('Error fetching twins:', error);
    res.status(500).json({ error: 'Failed to load twins', details: error.message });
  }
});

// Twin creation page route
app.get('/twin/create', extractJWTFromCookie, optionalAuth, (req, res) => {
  // Prefer JWT user if present; fallback to session user
  const user = req.user || (req as any).user;
  if (!user) {
    return res.redirect('/auth');
  }
  res.render('twin_create', {
    title: 'Create Twin - AI Twin',
    user: user,
    csrfToken: res.locals['csrfToken'],
  });
});

// Chat continue route - redirect to chat with latest twin
app.get('/chat/continue', extractJWTFromCookie, async (req: any, res) => {
  console.log('🚀 CHAT CONTINUE ROUTE HIT!');
  try {
    console.log('=== CHAT CONTINUE ROUTE ===');
    console.log('req.user:', req.user);
    console.log('req.user.id:', req.user.id);
    console.log('========================');
    
    if (!req.user) {
      console.log('❌ No user, redirecting to auth');
      return res.redirect('/auth');
    }

    // Get user's latest twin using raw SQL like my-twins
    const twins = await db.query(`
      SELECT id, "styleVector", "sampleReply", "createdAt" 
      FROM "Twin" 
      WHERE "userId" = $1 
      ORDER BY "createdAt" DESC
      LIMIT 1
    `, [req.user.id]);

    console.log('Found twins:', twins.rows);

    if (twins.rows.length === 0) {
      console.log('❌ No twin found, redirecting to create');
      return res.redirect('/twin/create');
    }

    const latestTwin = twins.rows[0];
    console.log('✅ Latest twin found:', latestTwin);

    // Find existing chat with this twin or create new one using raw SQL
    let chats = await db.query(`
      SELECT id, "userId", "twinId", "createdAt"
      FROM "Chat"
      WHERE "userId" = $1 AND "twinId" = $2
      ORDER BY "createdAt" DESC
      LIMIT 1
    `, [req.user.id, latestTwin.id]);

    console.log('Existing chats:', chats.rows);

    let chat;
    if (chats.rows.length === 0) {
      // Create new chat using raw SQL with generated ID
      const chatId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const newChat = await db.query(`
        INSERT INTO "Chat" ("id", "userId", "twinId", "createdAt")
        VALUES ($1, $2, $3, NOW())
        RETURNING id
      `, [chatId, req.user.id, latestTwin.id]);
      
      chat = { id: newChat.rows[0].id };
      console.log('Created new chat:', chat);
    } else {
      chat = chats.rows[0];
      console.log('Using existing chat:', chat);
    }

    // Redirect to chat page
    console.log('🎯 SUCCESS! Redirecting to chat:', `/chat/${chat.id}`);
    res.redirect(`/chat/${chat.id}`);
  } catch (error) {
    console.error('💥 Chat continue error:', error);
    console.error('Error details:', error.message);
    console.error('Stack trace:', error.stack);
    res.redirect('/dashboard');
  }
});

// Chat history page route
app.get('/chat/history', requireJWTFromCookie, (req: any, res) => {
  res.render('chat-history', {
    title: 'Chat History - AI Twin',
    user: req.user,
    csrfToken: res.locals['csrfToken'],
  });
});

// Chat page route
app.get('/chat/:id', extractJWTFromCookie, (req: any, res) => {
  try {
    console.log('🚀 CHAT PAGE ROUTE HIT!');
    console.log('Chat ID:', req.params.id);
    console.log('User:', req.user);
    
    if (!req.user) {
      console.log('❌ No user, redirecting to auth');
      return res.redirect('/auth');
    }
    
    console.log('✅ Rendering chat page');
    console.log('CSRF Token:', res.locals['csrfToken']);
    console.log('User data:', JSON.stringify(req.user, null, 2));
    
    console.log('Rendering chat-simple template...');
    console.log('Template data:', {
      title: 'Chat - AI Twin',
      user: req.user,
      chatId: req.params.id,
      csrfToken: res.locals['csrfToken'],
    });
    
    // Test with minimal template first
    res.render('chat-simple', {
      title: 'Chat - AI Twin',
      user: req.user,
      chatId: req.params.id,
      csrfToken: res.locals['csrfToken'],
    });
  } catch (error) {
    console.error('💥 Chat page error:', error);
    console.error('Error details:', error.message);
    console.error('Stack trace:', error.stack);
    console.error('Error type:', typeof error);
    console.error('Error constructor:', error.constructor.name);
    
    // Send detailed error for debugging
    res.status(500).json({ 
      error: 'Internal server error', 
      details: error.message,
      stack: error.stack,
      type: error.constructor.name
    });
  }
});

// Public profile page route
app.get('/p/:handle', (req, res) => {
  res.render('profile_public', {
    title: `Profile - ${req.params.handle}`,
    handle: req.params.handle,
    token: req.query['t'],
    csrfToken: res.locals['csrfToken'],
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
