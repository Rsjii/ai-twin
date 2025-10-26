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

// Import routes
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
import adminAnalyticsRoutes from './modules/analytics/adminAnalyticsRoutes';
import onboardingRoutes from './modules/onboarding/onboardingRoutes';
import memoryRoutes from './modules/memory/memoryRoutes';
import {learningScheduler} from './services/learningScheduler';
import { systemPromptUpdater} from './services/systemPromptUpdater';
import { getChatHistory, createNewChat, updateChatTitle, getChatSummary, generateChatTitle } from './modules/chat/chatManagementController';
// Import style anchor controller
import { 
  getTwinAnchors, 
  addTwinAnchor, 
  updateTwinAnchor, 
  deleteTwinAnchor 
} from './modules/twin/styleAnchorController';

if(config.nodeEnv==='production'){
  learningScheduler.start();
}

// Import JWT middleware
import { extractJWTFromCookie, requireJWTFromCookie } from './middleware/jwtCookie';

// Import middleware
import { generateCSRFToken } from './middleware/csrf';
import { optionalAuth } from './middleware/auth';

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
// app.use(sanitizeInput); // Temporarily disabled for debugging
// app.use(optionalAuth); // Temporarily disabled for debugging - conflicts with JWT

// API Routes
app.use('/api/auth', authRoutes);
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

// Add style anchor routes
app.get('/api/twin/:id/anchors', requireJWTFromCookie, getTwinAnchors);
app.post('/api/twin/:id/anchors', requireJWTFromCookie, addTwinAnchor);
app.put('/api/twin/:id/anchors/:anchorId', requireJWTFromCookie, updateTwinAnchor);
app.delete('/api/twin/:id/anchors/:anchorId', requireJWTFromCookie, deleteTwinAnchor);

// Discover page route
app.get('/discover', (req, res) => {
  res.render('discover');
});

// Enhanced onboarding page route
app.get('/onboarding', requireJWTFromCookie, generateCSRFToken, (req: any, res) => {
  res.render('onboarding', { 
    title: 'Create Your AI Twin - Enhanced Onboarding',
    user: req.user,
    csrfToken: res.locals['csrfToken']
  });
});

// Memory Management page route
app.get('/memory-management', requireJWTFromCookie, generateCSRFToken, (req: any, res) => {
  res.render('memory-management', { 
    title: 'Memory Management - AI Twin',
    user: req.user,
    twinId: req.query.twinId || 'default',
    csrfToken: res.locals['csrfToken']
  });
});

// Enhanced Chat page route
app.get('/chat-enhanced', requireJWTFromCookie, generateCSRFToken, async (req: any, res) => {
  try {
    console.log('🚀 ENHANCED CHAT ROUTE HIT!');
    console.log('req.user:', req.user);
    
    if (!req.user) {
      console.log('❌ No user, redirecting to auth');
      return res.redirect('/auth');
    }

    // Get user's latest twin
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

    // Find existing chat with this twin or create new one
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
      // Create new chat
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

    // Render enhanced chat page with proper chatId
    res.render('chat-enhanced', { 
      title: 'Enhanced Chat - AI Twin',
      user: req.user,
      chatId: chat.id,
      twinId: latestTwin.id,
      csrfToken: res.locals['csrfToken']
    });
  } catch (error) {
    console.error('💥 Enhanced chat route error:', error);
    res.redirect('/dashboard');
  }
});

// Admin Analytics dashboard route
app.get('/admin/analytics', requireJWTFromCookie, generateCSRFToken, async (req: any, res) => {
  // Check if user is admin
  const adminEmails = ['admin@aitwin.com', 'i@gmail.com'];
  if (!req.user || !req.user.email || !adminEmails.includes(req.user.email)) {
    return res.status(403).render('403', { 
      title: 'Access Denied',
      message: 'Admin access required'
    });
  }

  // Fetch full user data from database
  const fullUser = await userQueries.findByEmail(req.user.email);
  if (!fullUser) {
    return res.redirect('/auth');
  }

  res.render('admin-analytics', {
    title: 'Admin Analytics Dashboard - AI Twin',
    user: {
      id: fullUser.id,
      email: fullUser.email,
      handle: fullUser.handle,
      name: fullUser.name,
      profileImage: fullUser.profileImage
    },
    csrfToken: res.locals['csrfToken']
  });
});

// Admin Analytics detailed pages routes
app.get('/admin/analytics/page/:type', requireJWTFromCookie, generateCSRFToken, async (req: any, res) => {
  // Check if user is admin
  const adminEmails = ['admin@aitwin.com', 'i@gmail.com'];
  if (!req.user || !req.user.email || !adminEmails.includes(req.user.email)) {
    return res.status(403).render('403', { 
      title: 'Access Denied',
      message: 'Admin access required'
    });
  }

  const { type } = req.params;
  const validTypes = ['users', 'twins', 'chats', 'messages'];
  
  if (!validTypes.includes(type)) {
    return res.status(404).render('404', {
      title: 'Page Not Found',
      message: 'Invalid page type'
    });
  }

  // Fetch full user data from database
  const fullUser = await userQueries.findByEmail(req.user.email);
  if (!fullUser) {
    return res.redirect('/auth');
  }

  res.render(`admin-analytics-${type}`, {
    title: `Admin Analytics - ${type.charAt(0).toUpperCase() + type.slice(1)} - AI Twin`,
    user: {
      id: fullUser.id,
      email: fullUser.email,
      handle: fullUser.handle,
      name: fullUser.name,
      profileImage: fullUser.profileImage
    },
    pageType: type,
    csrfToken: res.locals['csrfToken']
  });
});

// Analytics dashboard route
app.get('/analytics', requireJWTFromCookie, generateCSRFToken, async (req: any, res) => {
  
  // Fetch full user data from database
  const fullUser = await userQueries.findByEmail(req.user.email);
  if (!fullUser) {
    return res.redirect('/auth');
  }
  
  // Set user data
  const user = {
    id: fullUser.id,
    email: fullUser.email,
    handle: fullUser.handle,
    name: fullUser.name,
    profileImage: fullUser.profileImage,
  };
  
  res.render('layout', {
    title: 'Analytics Dashboard - AI Twin',
    user: user,
    csrfToken: res.locals['csrfToken'],
    body: `
    <div class="px-4 py-6 sm:px-0">
        <div class="max-w-7xl mx-auto">
            <h1 class="text-3xl font-bold text-gray-900 mb-8">Analytics Dashboard</h1>
            
            <!-- Overview Cards -->
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div class="bg-white rounded-lg shadow p-6">
                    <div class="flex items-center">
                        <div class="p-2 bg-blue-100 rounded-lg">
                            <svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
                            </svg>
                        </div>
                        <div class="ml-4">
                            <p class="text-sm font-medium text-gray-600">Total Views</p>
                            <p class="text-2xl font-semibold text-gray-900" id="totalViews">-</p>
                        </div>
                    </div>
                </div>
                
                <div class="bg-white rounded-lg shadow p-6">
                    <div class="flex items-center">
                        <div class="p-2 bg-green-100 rounded-lg">
                            <svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path>
                            </svg>
                        </div>
                        <div class="ml-4">
                            <p class="text-sm font-medium text-gray-600">Total Likes</p>
                            <p class="text-2xl font-semibold text-gray-900" id="totalLikes">-</p>
                        </div>
                    </div>
                </div>
                
                <div class="bg-white rounded-lg shadow p-6">
                    <div class="flex items-center">
                        <div class="p-2 bg-purple-100 rounded-lg">
                            <svg class="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path>
                            </svg>
                        </div>
                        <div class="ml-4">
                            <p class="text-sm font-medium text-gray-600">Total Followers</p>
                            <p class="text-2xl font-semibold text-gray-900" id="totalFollowers">-</p>
                        </div>
                    </div>
                </div>
                
                <div class="bg-white rounded-lg shadow p-6">
                    <div class="flex items-center">
                        <div class="p-2 bg-orange-100 rounded-lg">
                            <svg class="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path>
                            </svg>
                        </div>
                        <div class="ml-4">
                            <p class="text-sm font-medium text-gray-600">Total Chats</p>
                            <p class="text-2xl font-semibold text-gray-900" id="totalChats">-</p>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Charts Section -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                <div class="bg-white rounded-lg shadow p-6">
                    <h3 class="text-lg font-semibold text-gray-900 mb-4">Engagement Over Time</h3>
                    <div id="engagementChart" class="h-64 flex items-center justify-center text-gray-500">
                        <p>Chart will be loaded here</p>
                    </div>
                </div>
                
                <div class="bg-white rounded-lg shadow p-6">
                    <h3 class="text-lg font-semibold text-gray-900 mb-4">Top Performing Content</h3>
                    <div id="topContent" class="space-y-3">
                        <p class="text-gray-500">Loading...</p>
                    </div>
                </div>
            </div>

            <!-- Feedback Analytics Section -->
<div class="bg-white rounded-lg shadow p-6 mb-8">
    <h3 class="text-lg font-semibold text-gray-900 mb-4">Feedback Analytics</h3>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="text-center">
            <p class="text-2xl font-bold text-green-600" id="positiveFeedback">-</p>
            <p class="text-sm text-gray-600">Positive Feedback</p>
        </div>
        <div class="text-center">
            <p class="text-2xl font-bold text-red-600" id="negativeFeedback">-</p>
            <p class="text-sm text-gray-600">Negative Feedback</p>
        </div>
        <div class="text-center">
            <p class="text-2xl font-bold text-blue-600" id="satisfactionScore">-</p>
            <p class="text-sm text-gray-600">Satisfaction Score</p>
        </div>
    </div>
</div>
            
            <!-- Recent Activity -->
            <div class="bg-white rounded-lg shadow">
                <div class="px-6 py-4 border-b border-gray-200">
                    <h3 class="text-lg font-semibold text-gray-900">Recent Activity</h3>
                </div>
                <div class="p-6">
                    <div id="recentActivity" class="space-y-4">
                        <p class="text-gray-500">Loading recent activity...</p>
                    </div>
                </div>
            </div>
            
            <!-- Debug Section -->
            <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-6">
                <h3 class="text-lg font-semibold text-yellow-800 mb-2">Debug Tools</h3>
                <p class="text-sm text-yellow-700 mb-4">Use these tools to debug analytics data</p>
                <div class="flex space-x-3">
                    <button onclick="debugUserData()" class="bg-yellow-600 text-white px-4 py-2 rounded hover:bg-yellow-700 text-sm">
                        Debug User Data
                    </button>
                    <button onclick="createSampleData()" class="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 text-sm">
                        Create Sample Data
                    </button>
                    <button onclick="loadAnalytics()" class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-sm">
                        Refresh Analytics
                    </button>
                </div>
            </div>
        </div>
    </div>
    
    <script>
        // Debug function to check user data
        async function debugUserData() {
            try {
                console.log('=== DEBUGGING USER DATA ===');
                const response = await fetch('/api/metrics/debug');
                const data = await response.json();
                console.log('Debug data:', data);
                
                if (data.success) {
                    alert(\`Debug Info:\\nUser: \${data.user?.email || 'No user'}\\nTwins: \${data.counts?.twins || 0}\\nChats: \${data.counts?.chats || 0}\\nEvents: \${data.counts?.events || 0}\`);
                } else {
                    alert('Debug failed: ' + data.error);
                }
            } catch (error) {
                console.error('Debug error:', error);
                alert('Debug error: ' + error.message);
            }
        }
        
        // Create sample data function
        async function createSampleData() {
            try {
                console.log('Creating sample data...');
                const response = await fetch('/api/metrics/create-sample', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    }
                });
                const data = await response.json();
                console.log('Sample data response:', data);
                
                if (data.success) {
                    alert('Sample data created successfully! Refreshing analytics...');
                    loadAnalytics();
                } else {
                    alert('Failed to create sample data: ' + data.error);
                }
            } catch (error) {
                console.error('Create sample data error:', error);
                alert('Error creating sample data: ' + error.message);
            }
        }
        
        // Load analytics data
        async function loadAnalytics() {
            try {
                console.log('Loading analytics data...');
                
                // Load user analytics
                const response = await fetch('/api/metrics/user');
                const data = await response.json();

                        // Load feedback analytics
        const feedbackResponse = await fetch('/api/analytics/feedback');
        const feedbackData = await feedbackResponse.json();
        
        if (feedbackData.success) {
            document.getElementById('positiveFeedback').textContent = feedbackData.analytics.positiveFeedback;
            document.getElementById('negativeFeedback').textContent = feedbackData.analytics.negativeFeedback;
            document.getElementById('satisfactionScore').textContent = feedbackData.analytics.satisfactionScore + '%';
        }
                
                console.log('Raw analytics response:', data);
                
                if (data.success) {
                    console.log('Analytics data:', data);
                    
                    // Update overview cards
                    document.getElementById('totalViews').textContent = data.analytics?.totalViews || 0;
                    document.getElementById('totalLikes').textContent = data.analytics?.totalLikes || 0;
                    document.getElementById('totalFollowers').textContent = data.analytics?.totalFollowers || 0;
                    document.getElementById('totalChats').textContent = data.analytics?.totalChats || 0;
                    
                    // Update recent activity
                    const activityContainer = document.getElementById('recentActivity');
                    if (data.analytics?.recentActivity && data.analytics.recentActivity.length > 0) {
                        activityContainer.innerHTML = data.analytics.recentActivity.map(activity => \`
                            <div class="flex items-center space-x-3">
                                <div class="w-2 h-2 bg-blue-500 rounded-full"></div>
                                <div class="flex-1">
                                    <p class="text-sm text-gray-900">\${activity.description}</p>
                                    <p class="text-xs text-gray-500">\${new Date(activity.timestamp).toLocaleString()}</p>
                                </div>
                            </div>
                        \`).join('');
                    } else {
                        activityContainer.innerHTML = '<p class="text-gray-500">No recent activity</p>';
                    }
                } else {
                    console.error('Failed to load analytics:', data.error);
                    // Show error message to user
                    document.getElementById('totalViews').textContent = 'Error';
                    document.getElementById('totalLikes').textContent = 'Error';
                    document.getElementById('totalFollowers').textContent = 'Error';
                    document.getElementById('totalChats').textContent = 'Error';
                }
            } catch (error) {
                console.error('Analytics loading error:', error);
                // Show error message to user
                document.getElementById('totalViews').textContent = 'Error';
                document.getElementById('totalLikes').textContent = 'Error';
                document.getElementById('totalFollowers').textContent = 'Error';
                document.getElementById('totalChats').textContent = 'Error';
            }
        }
        
        // Load analytics on page load
        document.addEventListener('DOMContentLoaded', () => {
            loadAnalytics();
        });
    </script>
    `
  });
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
                    <!-- Chat with Twin Buttons -->
                    <div class="bg-white rounded-lg shadow p-6">
                        <h3 class="text-lg font-semibold text-gray-800 mb-2">Chat with Your AI Twin</h3>
                        <p class="text-gray-600 mb-4">Start a conversation with your AI twin</p>
                        <div class="space-y-3">
                            <a href="/chat/continue" class="block bg-primary text-white px-4 py-2 rounded-lg hover:bg-secondary transition-colors text-center">
                                Start Regular Chat
                            </a>
                            <a href="/chat-enhanced" class="block bg-gradient-to-r from-purple-600 to-pink-600 text-white px-4 py-2 rounded-lg hover:from-purple-700 hover:to-pink-700 transition-colors text-center relative">
                                <span class="inline-flex items-center">
                                    🚀 Enhanced Chat (Beta)
                                    <span class="ml-2 text-xs bg-white/20 px-2 py-1 rounded-full">NEW</span>
                                </span>
                            </a>
                        </div>
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
                        <a href="/analytics" class="flex-1 bg-white/20 backdrop-blur-sm text-white py-3 px-6 rounded-lg hover:bg-white/30 transition-all duration-300 font-semibold inline-flex items-center justify-center border border-white/30">
                            <span class="flex items-center justify-center">
                                <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
                                </svg>
                                Analytics
                            </span>
                        </a>
                    </div>
                </div>
            </div>
            
            ${hasTwins ? `
            <!-- Twin Management Section -->
            <div class="grid md:grid-cols-3 gap-6 mb-8">
                <div class="bg-white rounded-lg shadow p-6">
                    <h3 class="text-lg font-semibold text-gray-800 mb-2">Edit Twin Style</h3>
                    <p class="text-gray-600 mb-4">Customize your twin's communication style</p>
                    <a href="/twin/${userTwins[0].id}/ai-edit" class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
                        Edit Twin
                    </a>
                </div>
                
                <div class="bg-white rounded-lg shadow p-6">
                    <h3 class="text-lg font-semibold text-gray-800 mb-2">Style Sandbox</h3>
                    <p class="text-gray-600 mb-4">Preview style changes before applying</p>
                    <a href="/twin/${userTwins[0].id}/style-customize" class="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors">
                        Style Sandbox
                    </a>
                </div>
                
                <div class="bg-white rounded-lg shadow p-6">
                    <h3 class="text-lg font-semibold text-gray-800 mb-2">Learning Progress</h3>
                    <p class="text-gray-600 mb-4">View how your twin is learning</p>
                    <a href="/analytics" class="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors">
                        View Analytics
                    </a>
                </div>
            </div>
            
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
                console.log('🔍 Loading public twin status...');
                const response = await fetch('/api/public-twin/my-profile');
                console.log('Response status:', response.status);
                const data = await response.json();
                console.log('Response data:', data);
                
                if (response.ok && data.success) {
                    console.log('✅ Twin found, displaying status');
                    displayPublicTwinStatus(data.twin);
                } else {
                    console.log('❌ No twin found or error, showing private status');
                    displayPublicTwinStatus(null);
                }
            } catch (error) {
                console.error('❌ Load public twin status error:', error);
                displayPublicTwinStatus(null);
            }
        }

        function displayPublicTwinStatus(twin) {
            console.log('🎨 Displaying public twin status for:', twin);
            const statusContainer = document.getElementById('publicTwinStatus');
            console.log('Status container found:', statusContainer);
            
            if (twin && twin.isPublic) {
                console.log('✅ Twin is public, showing public status');
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
                            <a href="/@\${twin.publicHandle}"  class="flex-1 bg-white/20 text-white py-2 px-4 rounded-lg hover:bg-white/30 transition-colors text-center">
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
                console.log('❌ Twin is private, showing private status');
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
                        <button id="makeTwinPublicBtn" class="w-full bg-white/20 text-white py-3 px-6 rounded-lg hover:bg-white/30 transition-colors font-semibold">
                            Make Twin Public
                        </button>
                    </div>
                \`;
            }
        }

        async function makeTwinPublic() {
            try {
                console.log('🚀 Making twin public...');
                
                const handle = generateHandle();
                console.log('Generated handle:', handle);
                
                const response = await fetch('/api/public-twin/make-public', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': '${res.locals['csrfToken']}'
                    },
                    body: JSON.stringify({
                        bio: 'Check out my AI twin!',
                        publicHandle: handle
                    })
                });
                
                console.log('Response status:', response.status);
                const result = await response.json();
                console.log('Response data:', result);
                
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
            const url = window.location.origin + '/@' + handle;
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
            return adj + noun + num;
        }
        
        // Load public twin status on page load
        document.addEventListener('DOMContentLoaded', () => {
            console.log('🚀 DOM loaded, loading public twin status...');
            loadPublicTwinStatus();
        });
        
        // Also call immediately in case DOM is already loaded
        console.log('🚀 Script loaded, calling loadPublicTwinStatus immediately...');
        setTimeout(() => {
            loadPublicTwinStatus();
        }, 1000);
        
        // Add event listener for make twin public button
        setTimeout(() => {
            const makePublicBtn = document.getElementById('makeTwinPublicBtn');
            if (makePublicBtn) {
                console.log('✅ Make Twin Public button found, adding event listener');
                makePublicBtn.addEventListener('click', function() {
                    console.log('🔥 Make Twin Public button clicked!');
                    makeTwinPublic();
                });
            } else {
                console.log('❌ Make Twin Public button not found');
            }
        }, 2000);
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

// AI Edit page route
app.get('/twin/:id/ai-edit', requireJWTFromCookie, generateCSRFToken, async (req: any, res) => {
  try {
    const { id: twinId } = req.params;
    const userId = req.user.id;
    
    // Verify twin ownership
    const twinResult = await db.query(`
      SELECT id, "styleVector", "personaData", "systemPrompt", "sampleReply", "createdAt", "last_updated", "style_version"
      FROM "Twin" 
      WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);
    
    if (twinResult.rows.length === 0) {
      return res.status(404).render('error', { 
        message: 'Twin not found or access denied',
        user: req.user 
      });
    }
    
    res.render('ai-edit', { 
      title: 'AI Edit - AI Twin',
      user: req.user,
      twinId: twinId,
      csrfToken: res.locals['csrfToken']
    });
  } catch (error) {
    console.error('AI edit route error:', error);
    res.status(500).render('error', { 
      message: 'Internal server error',
      user: req.user 
    });
  }
});

// Style Customize page route (replaces both twin-edit and style-sandbox)
app.get('/twin/:id/style-customize', requireJWTFromCookie, generateCSRFToken, async (req: any, res) => {
  try {
    const { id: twinId } = req.params;
    const userId = req.user.id;
    
    // Verify twin ownership
    const twinResult = await db.query(`
      SELECT id, "styleVector", "personaData", "systemPrompt", "sampleReply", "createdAt", "last_updated", "style_version"
      FROM "Twin" 
      WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);
    
    if (twinResult.rows.length === 0) {
      return res.status(404).render('error', { 
        message: 'Twin not found or access denied',
        user: req.user 
      });
    }
    
    res.render('style-customize', { 
      title: 'Style Customize - AI Twin',
      user: req.user,
      twinId: twinId,
      csrfToken: res.locals['csrfToken']
    });
  } catch (error) {
    console.error('Style customize route error:', error);
    res.status(500).render('error', { 
      message: 'Internal server error',
      user: req.user 
    });
  }
});

// Learning Dashboard page route
app.get('/twin/:id/learning-dashboard', requireJWTFromCookie, generateCSRFToken, async (req: any, res) => {
  try {
    const { id: twinId } = req.params;
    const userId = req.user.id;
    
    // Verify twin ownership
    const twinResult = await db.query(`
      SELECT id, "styleVector", "personaData", "systemPrompt", "sampleReply", "createdAt", "last_updated", "style_version"
      FROM "Twin" 
      WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);
    
    if (twinResult.rows.length === 0) {
      return res.status(404).render('error', { 
        message: 'Twin not found or access denied',
        user: req.user 
      });
    }
    
    res.render('learning-dashboard', { 
      title: 'Learning Dashboard - AI Twin',
      user: req.user,
      twinId: twinId,
      csrfToken: res.locals['csrfToken']
    });
  } catch (error) {
    console.error('Learning dashboard route error:', error);
    res.status(500).render('error', { 
      message: 'Internal server error',
      user: req.user 
    });
  }
});

// Add these API endpoints after line 1943

// API endpoint for loading twin edit data
app.get('/api/twin/:id/edit-data', requireJWTFromCookie, async (req: any, res) => {
  try {
    const { id: twinId } = req.params;
    const userId = req.user.id;
    
    const twinResult = await db.query(`
      SELECT id, "styleVector", "personaData", "systemPrompt", "sampleReply", "createdAt", "last_updated", "style_version"
      FROM "Twin" 
      WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);
    
    if (twinResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Twin not found' });
    }
    
    res.json({ success: true, twin: twinResult.rows[0] });
  } catch (error) {
    console.error('Edit data API error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// API endpoint for updating AI (system prompt, persona, memory)
app.post('/api/twin/:id/update-ai', requireJWTFromCookie, async (req: any, res) => {
  try {
    const { id: twinId } = req.params;
    const userId = req.user.id;
    const { systemPrompt, personaData } = req.body;
    
    // Verify ownership
    const twinResult = await db.query(`
      SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);
    
    if (twinResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Twin not found' });
    }
    
    // Update twin data
    await db.query(`
      UPDATE "Twin" 
      SET "systemPrompt" = $1, "personaData" = $2, "last_updated" = NOW()
      WHERE id = $3
    `, [systemPrompt, JSON.stringify(personaData), twinId]);
    
    res.json({ success: true, message: 'AI settings updated successfully' });
  } catch (error) {
    console.error('Update AI API error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// API endpoint for regenerating system prompt
app.post('/api/twin/:id/regenerate-prompt', requireJWTFromCookie, async (req: any, res) => {
  try {
    const { id: twinId } = req.params;
    const userId = req.user.id;
    
    // Verify ownership
    const twinResult = await db.query(`
      SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);
    
    if (twinResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Twin not found' });
    }
    
    // Update system prompt
    const success = await systemPromptUpdater.updateTwinSystemPrompt(twinId);
    
    if (success) {
      res.json({ success: true, message: 'System prompt regenerated successfully' });
    } else {
      res.status(500).json({ success: false, error: 'Failed to regenerate system prompt' });
    }
  } catch (error) {
    console.error('Regenerate prompt API error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// API endpoint for updating style
app.post('/api/twin/:id/update-style', requireJWTFromCookie, async (req: any, res) => {
  try {
    const { id: twinId } = req.params;
    const userId = req.user.id;
    const styleUpdates = req.body;
    
    // Verify ownership
    const twinResult = await db.query(`
      SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);
    
    if (twinResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Twin not found' });
    }
    
    // Update style vector
    await db.query(`
      UPDATE "Twin" 
      SET "styleVector" = $1, "last_updated" = NOW()
      WHERE id = $2
    `, [JSON.stringify(styleUpdates), twinId]);
    
    res.json({ success: true, message: 'Style updated successfully' });
  } catch (error) {
    console.error('Update style API error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// API endpoint for loading style data
app.get('/api/twin/:id/style-data', requireJWTFromCookie, async (req: any, res) => {
  try {
    const { id: twinId } = req.params;
    const userId = req.user.id;
    
    const twinResult = await db.query(`
      SELECT id, "styleVector", "personaData", "systemPrompt", "sampleReply", "createdAt", "last_updated", "style_version"
      FROM "Twin" 
      WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);
    
    if (twinResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Twin not found' });
    }
    
    res.json({ success: true, twin: twinResult.rows[0] });
  } catch (error) {
    console.error('Style data API error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// API endpoint for style preview (sandbox)
app.post('/api/twin/:id/style-preview', requireJWTFromCookie, async (req: any, res) => {
  try {
    const { id: twinId } = req.params;
    const userId = req.user.id;
    const { styleChanges, testMessage } = req.body;
    
    // Verify ownership
    const twinResult = await db.query(`
      SELECT id, "styleVector" FROM "Twin" WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);
    
    if (twinResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Twin not found' });
    }
    
    // For now, return mock data (implement AI generation later)
    const originalResponse = "This is how your twin currently responds to: " + testMessage;
    const newResponse = "This is how your twin would respond with the new style settings to: " + testMessage;
    
    res.json({ 
      success: true, 
      originalResponse, 
      newResponse 
    });
  } catch (error) {
    console.error('Style preview API error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// API endpoint for loading learning data
app.get('/api/twin/:id/learning-data', requireJWTFromCookie, async (req: any, res) => {
  try {
    const { id: twinId } = req.params;
    const userId = req.user.id;
    
    // Verify ownership
    const twinResult = await db.query(`
      SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);
    
    if (twinResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Twin not found' });
    }
    
// Real learning data from database
const learningData = {
  totalInteractions: 0,
  learningScore: 0,
  styleAccuracy: 0,
  events: []
};

try {
  // Get real analytics from database
  const analyticsResult = await db.query(`
    SELECT 
      COUNT(DISTINCT c.id) as total_chats,
      COUNT(m.id) as total_messages,
      COUNT(CASE WHEN cf.rating = 'positive' THEN 1 END) as positive_feedback,
      COUNT(CASE WHEN cf.rating = 'negative' THEN 1 END) as negative_feedback
    FROM "Chat" c
    LEFT JOIN "Message" m ON c.id = m."chatId"
    LEFT JOIN "ChatFeedback" cf ON c.id = cf."chatId"
    WHERE c."twinId" = $1
  `, [twinId]);

  const analytics = analyticsResult.rows[0];
  
  // Get recent learning events
  const eventsResult = await db.query(`
    SELECT 
      'Style correction applied' as description,
      ts as timestamp
    FROM "style_corrections" 
    WHERE "twin_id" = $1
    ORDER BY ts DESC
    LIMIT 5
  `, [twinId]);

  learningData.totalInteractions = parseInt(analytics.total_messages) || 0;
  learningData.learningScore = analytics.total_messages > 0 ? 
    Math.round((analytics.positive_feedback / analytics.total_messages) * 100) : 0;
  learningData.styleAccuracy = analytics.total_messages > 0 ? 
    Math.round((analytics.positive_feedback / analytics.total_messages) * 100) : 0;
  learningData.events = eventsResult.rows.map(event => ({
    description: event.description,
    timestamp: event.timestamp
  }));

} catch (error) {
  console.error('Error loading learning data:', error);
  // Keep default values if error occurs
}

    res.json({ success: true, learning: learningData });
  } catch (error) {
    console.error('Learning data API error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Manual Training API endpoints
app.post('/api/twin/:id/manual-training', requireJWTFromCookie, async (req: any, res) => {
  try {
    const { id: twinId } = req.params;
    const userId = req.user.id;
    const { userMessage, idealReply, trainingType } = req.body;
    
    // Verify ownership
    const twinResult = await db.query(`
      SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);
    
    if (twinResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Twin not found' });
    }
    
    // Create style anchor for manual training
    const anchorId = `anchor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await db.query(`
      INSERT INTO "style_anchors" ("id", "twinId", "userUtterance", "idealReply", "trainingType", "createdAt")
      VALUES ($1, $2, $3, $4, $5, NOW())
    `, [anchorId, twinId, userMessage, idealReply, trainingType || 'manual']);
    
    res.json({ success: true, message: 'Training example added successfully' });
  } catch (error) {
    console.error('Manual training API error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Get messages for a specific chat
app.get('/api/twin/:id/chat/:chatId/messages', requireJWTFromCookie, async (req, res) => {
  try {
    const { id: twinId, chatId } = req.params;
    const userId = req.user.id;
    
    // Verify ownership
    const twin = await db.twin.findFirst({
      where: { id: twinId, userId: userId }
    });
    
    if (!twin) {
      return res.status(404).json({ success: false, error: 'Twin not found' });
    }
    
    // Get messages for the chat
    const messages = await db.message.findMany({
      where: { chatId: chatId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        content: true,
        sender: true,
        createdAt: true
      }
    });
    
    res.json({ success: true, messages });
  } catch (error) {
    console.error('Error fetching chat messages:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch chat messages' });
  }
});

// Convert multiple messages to training examples
app.post('/api/twin/:id/convert-messages-to-training', requireJWTFromCookie, async (req, res) => {
  try {
    const { id: twinId } = req.params;
    const { messageIds, trainingType } = req.body;
    const userId = req.user.id;
    
    // Verify ownership
    const twin = await db.twin.findFirst({
      where: { id: twinId, userId: userId }
    });
    
    if (!twin) {
      return res.status(404).json({ success: false, error: 'Twin not found' });
    }
    
    // Get messages
    const messages = await db.message.findMany({
      where: { id: { in: messageIds } },
      orderBy: { createdAt: 'asc' }
    });
    
    // Group messages by chat and create training examples
    const chatGroups = {};
    messages.forEach(message => {
      if (!chatGroups[message.chatId]) {
        chatGroups[message.chatId] = [];
      }
      chatGroups[message.chatId].push(message);
    });
    
    let createdAnchors = 0;
    
    // Create style anchors from message pairs
    for (const chatId in chatGroups) {
      const chatMessages = chatGroups[chatId];
      
      for (let i = 0; i < chatMessages.length - 1; i++) {
        const userMessage = chatMessages[i];
        const aiMessage = chatMessages[i + 1];
        
        if (userMessage.sender === 'user' && aiMessage.sender === 'ai') {
          await styleAnchorsQueries.create({
            twinId: twinId,
            userUtterance: userMessage.content,
            idealReply: aiMessage.content,
            trainingType: trainingType || 'chat_conversion',
            metadata: {
              sourceChatId: chatId,
              sourceMessageIds: [userMessage.id, aiMessage.id]
            }
          });
          createdAnchors++;
        }
      }
    }
    
    res.json({ 
      success: true, 
      message: `Created ${createdAnchors} training examples`,
      createdAnchors 
    });
  } catch (error) {
    console.error('Error converting messages to training:', error);
    res.status(500).json({ success: false, error: 'Failed to convert messages to training' });
  }
});

// Get training effectiveness metrics
app.get('/api/twin/:id/training/effectiveness', requireJWTFromCookie, async (req, res) => {
  try {
    const { id: twinId } = req.params;
    const userId = req.user.id;
    
    // Verify ownership
    const twin = await db.twin.findFirst({
      where: { id: twinId, userId: userId }
    });
    
    if (!twin) {
      return res.status(404).json({ success: false, error: 'Twin not found' });
    }
    
    // Calculate effectiveness score
    const totalAnchors = await db.styleAnchor.count({ where: { twinId } });
    const totalMemories = await db.memChunk.count({ where: { twinId } });
    const recentCorrections = await db.styleCorrection.count({
      where: { 
        twinId,
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // Last 7 days
      }
    });
    
    // Calculate score based on various factors
    let score = 0;
    if (totalAnchors >= 10) score += 30;
    else score += (totalAnchors / 10) * 30;
    
    if (totalMemories >= 20) score += 30;
    else score += (totalMemories / 20) * 30;
    
    if (recentCorrections <= 5) score += 40; // Fewer corrections = better
    else score += Math.max(0, 40 - (recentCorrections - 5) * 5);
    
    // Generate recommendations
    const recommendations = [];
    if (totalAnchors < 5) {
      recommendations.push({
        type: 'tip',
        icon: '💡',
        message: 'Add more style anchors to improve response quality'
      });
    }
    if (totalMemories < 10) {
      recommendations.push({
        type: 'warning',
        icon: '⚠️',
        message: 'Consider adding more memory chunks for better context'
      });
    }
    
    // Generate achievements
    const achievements = [
      {
        name: 'Style Master',
        description: '10+ anchors',
        icon: '🎯',
        unlocked: totalAnchors >= 10
      },
      {
        name: 'Memory Builder',
        description: '50+ memories',
        icon: '🧠',
        unlocked: totalMemories >= 50
      },
      {
        name: 'Quick Learner',
        description: '5+ examples',
        icon: '⚡',
        unlocked: totalAnchors >= 5
      },
      {
        name: 'Perfectionist',
        description: 'Low corrections',
        icon: '🔒',
        unlocked: recentCorrections <= 3
      }
    ];
    
    // Generate goals
    const goals = [
      {
        name: 'Add 5 more style anchors',
        current: totalAnchors,
        target: 5,
        progress: Math.min(100, (totalAnchors / 5) * 100),
        color: 'bg-blue-600'
      },
      {
        name: 'Create 10 memory chunks',
        current: totalMemories,
        target: 10,
        progress: Math.min(100, (totalMemories / 10) * 100),
        color: 'bg-green-600'
      },
      {
        name: 'Convert 3 chats to training',
        current: Math.min(3, Math.floor(totalAnchors / 2)),
        target: 3,
        progress: Math.min(100, (Math.min(3, Math.floor(totalAnchors / 2)) / 3) * 100),
        color: 'bg-purple-600'
      }
    ];
    
    res.json({
      success: true,
      effectiveness: {
        score: Math.round(score),
        totalAnchors,
        totalMemories,
        recentCorrections
      },
      recommendations,
      achievements,
      goals
    });
  } catch (error) {
    console.error('Error calculating training effectiveness:', error);
    res.status(500).json({ success: false, error: 'Failed to calculate training effectiveness' });
  }
});

// Convert chat message to training example
app.post('/api/twin/:id/convert-to-training', requireJWTFromCookie, async (req: any, res) => {
  try {
    const { id: twinId } = req.params;
    const userId = req.user.id;
    const { messageId, idealReply } = req.body;
    
    // Verify ownership
    const twinResult = await db.query(`
      SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);
    
    if (twinResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Twin not found' });
    }
    
    // Get the original message
    const messageResult = await db.query(`
      SELECT content FROM "Message" 
      WHERE id = $1 AND "chatId" IN (
        SELECT id FROM "Chat" WHERE "twinId" = $2 AND "userId" = $3
      )
    `, [messageId, twinId, userId]);
    
    if (messageResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Message not found' });
    }
    
    // Create style anchor
    const anchorId = `anchor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await db.query(`
      INSERT INTO "style_anchors" ("id", "twinId", "userUtterance", "idealReply", "trainingType", "createdAt")
      VALUES ($1, $2, $3, $4, $5, NOW())
    `, [anchorId, twinId, messageResult.rows[0].content, idealReply, 'chat_conversion']);
    
    res.json({ success: true, message: 'Message converted to training example' });
  } catch (error) {
    console.error('Convert to training API error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Get training progress
app.get('/api/twin/:id/training-progress', requireJWTFromCookie, async (req: any, res) => {
  try {
    const { id: twinId } = req.params;
    const userId = req.user.id;
    
    // Verify ownership
    const twinResult = await db.query(`
      SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);
    
    if (twinResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Twin not found' });
    }
    
    // Get training statistics
    const statsResult = await db.query(`
      SELECT 
        COUNT(*) as total_examples,
        COUNT(CASE WHEN "trainingType" = 'manual' THEN 1 END) as manual_examples,
        COUNT(CASE WHEN "trainingType" = 'chat_conversion' THEN 1 END) as converted_examples,
        COUNT(CASE WHEN "trainingType" = 'auto' THEN 1 END) as auto_examples
      FROM "style_anchors" 
      WHERE "twinId" = $1
    `, [twinId]);
    
    // Get recent training activity
    const recentResult = await db.query(`
      SELECT "userUtterance", "idealReply", "trainingType", "createdAt"
      FROM "style_anchors" 
      WHERE "twinId" = $1
      ORDER BY "createdAt" DESC
      LIMIT 10
    `, [twinId]);
    
    const stats = statsResult.rows[0];
    const recent = recentResult.rows;
    
    res.json({ 
      success: true, 
      progress: {
        totalExamples: parseInt(stats.total_examples) || 0,
        manualExamples: parseInt(stats.manual_examples) || 0,
        convertedExamples: parseInt(stats.converted_examples) || 0,
        autoExamples: parseInt(stats.auto_examples) || 0,
        recentActivity: recent.map(item => ({
          userUtterance: item.userUtterance,
          idealReply: item.idealReply,
          trainingType: item.trainingType,
          timestamp: item.createdAt
        }))
      }
    });
  } catch (error) {
    console.error('Training progress API error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// API endpoint for getting chat history for a twin
app.get('/api/twin/:id/chat-history', requireJWTFromCookie, async (req: any, res) => {
  try {
    const { id: twinId } = req.params;
    const { limit = 20, offset = 0 } = req.query;
    const userId = req.user.id;
    
    // Verify twin ownership
    const twinResult = await db.query(`
      SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);
    
    if (twinResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Twin not found' });
    }
    
    // Get all chats for this twin
    const chats = await db.query(`
      SELECT 
        c.id, 
        c."createdAt", 
        c."lastMessage",
        COUNT(m.id) as message_count,
        MAX(m."createdAt") as last_message_time
      FROM "Chat" c
      LEFT JOIN "Message" m ON c.id = m."chatId"
      WHERE c."twinId" = $1 AND c."userId" = $2
      GROUP BY c.id, c."createdAt", c."lastMessage"
      ORDER BY c."createdAt" DESC
      LIMIT $3 OFFSET $4
    `, [twinId, userId, parseInt(limit as string), parseInt(offset as string)]);
    
    // Format chat data
    const chatHistory = chats.rows.map(chat => ({
      id: chat.id,
      createdAt: chat.createdAt,
      lastMessage: chat.last_message,
      messageCount: parseInt(chat.message_count) || 0,
      lastMessageTime: chat.last_message_time
    }));
    
    res.json({ 
      success: true, 
      chats: chatHistory,
      total: chatHistory.length 
    });
  } catch (error) {
    console.error('Chat history API error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// API endpoint for learning settings
app.post('/api/twin/:id/learning-settings', requireJWTFromCookie, async (req: any, res) => {
  try {
    const { id: twinId } = req.params;
    const userId = req.user.id;
    const { autoLearning, learningSensitivity } = req.body;
    
    // Verify ownership
    const twinResult = await db.query(`
      SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);
    
    if (twinResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Twin not found' });
    }
    
    // Update learning settings (implement database storage later)
    res.json({ success: true, message: 'Learning settings updated successfully' });
  } catch (error) {
    console.error('Learning settings API error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// API endpoint for updating persona
app.post('/api/twin/:id/update-persona', requireJWTFromCookie, async (req: any, res) => {
  try {
    const { id: twinId } = req.params;
    const userId = req.user.id;
    const personaUpdates = req.body;
    
    // Verify ownership
    const twinResult = await db.query(`
      SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);
    
    if (twinResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Twin not found' });
    }
    
    // Update persona data
    await db.query(`
      UPDATE "Twin" 
      SET "personaData" = $1, "last_updated" = NOW()
      WHERE id = $2
    `, [JSON.stringify(personaUpdates), twinId]);
    
    res.json({ success: true, message: 'Persona updated successfully' });
  } catch (error) {
    console.error('Update persona API error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Feedback API endpoints
app.post('/api/chat/:chatId/feedback', requireJWTFromCookie, async (req: any, res) => {
  try {
    const { chatId } = req.params;
    const { responseId, rating, suggestion, tonePreference } = req.body;
    const userId = req.user.id;
    
    // Store feedback in database
    await db.query(`
      INSERT INTO "ChatFeedback" ("chatId", "responseId", "userId", "rating", "suggestion", "tonePreference", "createdAt")
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
    `, [chatId, responseId, userId, rating, suggestion, tonePreference]);
    
    // Update AI learning data
    await updateAILearning(chatId, rating, suggestion, tonePreference);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Feedback API error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Regenerate response API
app.post('/api/chat/:chatId/regenerate', requireJWTFromCookie, async (req: any, res) => {
  try {
    const { chatId } = req.params;
    const { responseId, tonePreference } = req.body;
    const userId = req.user.id;
    
    // Generate new response with tone preference
    const newResponse = await generateResponseWithTone(chatId, tonePreference);
    
    res.json({ success: true, newResponse });
  } catch (error) {
    console.error('Regenerate API error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Enhanced regenerate response endpoint
app.post('/api/enhanced-chat/:chatId/regenerate', requireJWTFromCookie, async (req: any, res) => {
  try {
    const { chatId } = req.params;
    const { responseId, tonePreference } = req.body;
    const userId = req.user.id;
    
    // Get the original message and regenerate
    const chatResult = await db.query(`
      SELECT c."twinId", c."chatVector" FROM "Chat" c
      WHERE c.id = $1 AND c."userId" = $2
    `, [chatId, userId]);
    
    if (chatResult.rows.length === 0) {
      return res.status(404).json({ error: 'Chat not found' });
    }
    
    // Regenerate using your existing AI service
    const newResponse = await generateResponseWithTone(chatId, tonePreference);
    
    res.json({ success: true, newResponse });
  } catch (error) {
    console.error('Regenerate error:', error);
    res.status(500).json({ error: 'Failed to regenerate response' });
  }
});

// Enhanced chat feedback endpoint
app.post('/api/enhanced-chat/:chatId/feedback', requireJWTFromCookie, async (req: any, res) => {
  try {
    const { chatId } = req.params;
    const { responseId, rating, suggestion, tonePreference } = req.body;
    const userId = req.user.id;
    
    // Store feedback in database
    await db.query(`
      INSERT INTO "ChatFeedback" ("chatId", "responseId", "userId", "rating", "suggestion", "tonePreference", "createdAt")
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
    `, [chatId, responseId, userId, rating, suggestion, tonePreference]);
    
    // Update AI learning data
    await updateAILearning(chatId, rating, suggestion, tonePreference);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Enhanced chat feedback API error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Get feedback analytics
app.get('/api/analytics/feedback', requireJWTFromCookie, async (req: any, res) => {
  try {
    const userId = req.user.id;
    
    // Get feedback counts
    const feedbackResult = await db.query(`
      SELECT 
        COUNT(CASE WHEN rating = 'positive' THEN 1 END) as positive_count,
        COUNT(CASE WHEN rating = 'negative' THEN 1 END) as negative_count,
        COUNT(*) as total_feedback
      FROM "ChatFeedback" 
      WHERE "userId" = $1
    `, [userId]);
    
    const feedback = feedbackResult.rows[0];
    const satisfactionScore = feedback.total_feedback > 0 
      ? Math.round((feedback.positive_count / feedback.total_feedback) * 100)
      : 0;
    
    res.json({
      success: true,
      analytics: {
        positiveFeedback: feedback.positive_count,
        negativeFeedback: feedback.negative_count,
        totalFeedback: feedback.total_feedback,
        satisfactionScore: satisfactionScore
      }
    });
  } catch (error) {
    console.error('Feedback analytics error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Get feedback status for a chat
app.get('/api/enhanced-chat/:chatId/feedback-status', requireJWTFromCookie, async (req: any, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user.id;
    
    // Get all feedback for this chat
    const feedbackResult = await db.query(`
      SELECT "responseId", "rating", "suggestion", "tonePreference"
      FROM "ChatFeedback"
      WHERE "chatId" = $1 AND "userId" = $2
    `, [chatId, userId]);
    
    // Convert to object with responseId as key
    const feedback = {};
    feedbackResult.rows.forEach(row => {
      feedback[row.responseId] = {
        rating: row.rating,
        suggestion: row.suggestion,
        tonePreference: row.tonePreference
      };
    });
    
    res.json({ success: true, feedback });
  } catch (error) {
    console.error('Feedback status API error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Adjust tone endpoint
app.post('/api/enhanced-chat/:chatId/adjust-tone', requireJWTFromCookie, async (req: any, res) => {
  try {
    const { chatId } = req.params;
    const { responseId, tone } = req.body;
    const userId = req.user.id;
    
    // Get chat and twin info
    const chatResult = await db.query(`
      SELECT c."twinId", c."chatVector" FROM "Chat" c
      WHERE c.id = $1 AND c."userId" = $2
    `, [chatId, userId]);
    
    if (chatResult.rows.length === 0) {
      return res.status(404).json({ error: 'Chat not found' });
    }
    
    // Adjust tone using your AI service
    const adjustedResponse = await adjustResponseTone(chatResult.rows[0].twinId, responseId, tone);
    
    res.json({ success: true, adjustedResponse });
  } catch (error) {
    console.error('Tone adjustment error:', error);
    res.status(500).json({ error: 'Failed to adjust tone' });
  }
});

// Helper function to generate response with tone
async function generateResponseWithTone(chatId: string, tonePreference: string) {
  try {
    // Get chat and twin info
    const chatResult = await db.query(`
      SELECT c."twinId", c."chatVector", t."styleVector", t."systemPrompt" 
      FROM "Chat" c
      JOIN "Twin" t ON c."twinId" = t.id
      WHERE c.id = $1
    `, [chatId]);
    
    if (chatResult.rows.length === 0) {
      throw new Error('Chat not found');
    }
    
    const { twinId, chatVector, styleVector, systemPrompt } = chatResult.rows[0];
    
    // Use your existing AI service to generate response
    // This is a placeholder - replace with your actual AI generation logic
    const newResponse = `Regenerated response with ${tonePreference} tone for chat ${chatId}`;
    
    return newResponse;
  } catch (error) {
    console.error('Generate response with tone error:', error);
    throw error;
  }
}

// Helper function to adjust response tone
async function adjustResponseTone(twinId: string, responseId: string, tone: string) {
  try {
    // Get twin info
    const twinResult = await db.query(`
      SELECT "styleVector", "systemPrompt" FROM "Twin" WHERE id = $1
    `, [twinId]);
    
    if (twinResult.rows.length === 0) {
      throw new Error('Twin not found');
    }
    
    const { styleVector, systemPrompt } = twinResult.rows[0];
    
    // Use your existing AI service to adjust tone
    // This is a placeholder - replace with your actual AI adjustment logic
    const adjustedResponse = `Response adjusted to ${tone} tone for response ${responseId}`;
    
    return adjustedResponse;
  } catch (error) {
    console.error('Adjust response tone error:', error);
    throw error;
  }
}

// Helper function to update AI learning
async function updateAILearning(chatId: string, rating: string, suggestion: string, tonePreference: string) {
  try {
    // Get the twin ID from the chat
    const chatResult = await db.query(`
      SELECT "twinId" FROM "Chat" WHERE id = $1
    `, [chatId]);
    
    if (chatResult.rows.length === 0) return;
    
    const twinId = chatResult.rows[0].twinId;
    
    // Store learning data
    await db.query(`
      INSERT INTO "AILearning" ("twinId", "userId", "learningData", "lastUpdated")
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT ("twinId") DO UPDATE SET
        "learningData" = $3,
        "lastUpdated" = NOW()
    `, [twinId, chatId, JSON.stringify({
      rating,
      suggestion,
      tonePreference,
      timestamp: new Date().toISOString()
    })]);
  } catch (error) {
    console.error('Update AI learning error:', error);
  }
}


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

// Phase 2F: Advanced Features API Endpoints

// Training Templates API
app.get('/api/twin/:id/templates', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    
    // Verify twin ownership
    const twin = await db.twin.findFirst({
      where: { id, userId }
    });
    
    if (!twin) {
      return res.status(404).json({ success: false, error: 'Twin not found' });
    }
    
    const templates = {
      casual: {
        name: 'Casual Conversation',
        description: 'Friendly, relaxed responses',
        examples: [
          { user: "Hey, how are you?", reply: "Hey! I'm doing great, thanks! 😊 How about you?" },
          { user: "What's up?", reply: "Not much, just hanging out! What's going on with you?" }
        ]
      },
      professional: {
        name: 'Professional',
        description: 'Formal, business-like responses',
        examples: [
          { user: "Can you help with this project?", reply: "I'd be happy to assist you with your project. Could you provide more details?" },
          { user: "What's the status?", reply: "The current status is as follows. Let me provide you with the details." }
        ]
      },
      supportive: {
        name: 'Supportive',
        description: 'Encouraging, empathetic responses',
        examples: [
          { user: "I'm feeling stressed", reply: "I understand that stress can be overwhelming. You're doing your best, and it's okay to take breaks." },
          { user: "I'm worried about...", reply: "It's completely natural to feel worried about that. You're not alone in this." }
        ]
      }
    };
    
    res.json({ success: true, templates });
  } catch (error) {
    console.error('Error loading templates:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Learning Milestones API
app.get('/api/twin/:id/milestones', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    
    // Verify twin ownership
    const twin = await db.twin.findFirst({
      where: { id, userId }
    });
    
    if (!twin) {
      return res.status(404).json({ success: false, error: 'Twin not found' });
    }
    
    // Get current counts
    const styleAnchorsCount = await db.styleAnchor.count({
      where: { twinId: id }
    });
    
    const memoriesCount = await db.memChunk.count({
      where: { twinId: id }
    });
    
    const trainingExamplesCount = await db.styleAnchor.count({
      where: { twinId: id, trainingType: 'manual' }
    });
    
    // Define milestones
    const milestones = [
      {
        id: 'style_master',
        name: 'Style Master',
        description: '10+ style anchors',
        icon: '🎯',
        target: 10,
        current: styleAnchorsCount,
        completed: styleAnchorsCount >= 10,
        progress: Math.min(100, (styleAnchorsCount / 10) * 100)
      },
      {
        id: 'memory_builder',
        name: 'Memory Builder',
        description: '50+ memories',
        icon: '🧠',
        target: 50,
        current: memoriesCount,
        completed: memoriesCount >= 50,
        progress: Math.min(100, (memoriesCount / 50) * 100)
      },
      {
        id: 'quick_learner',
        name: 'Quick Learner',
        description: '5+ training examples',
        icon: '⚡',
        target: 5,
        current: trainingExamplesCount,
        completed: trainingExamplesCount >= 5,
        progress: Math.min(100, (trainingExamplesCount / 5) * 100)
      },
      {
        id: 'expert_trainer',
        name: 'Expert Trainer',
        description: '25+ style anchors',
        icon: '🔒',
        target: 25,
        current: styleAnchorsCount,
        completed: styleAnchorsCount >= 25,
        progress: Math.min(100, (styleAnchorsCount / 25) * 100)
      }
    ];
    
    // Get learning goals
    const goals = await db.learningGoal.findMany({
      where: { twinId: id },
      orderBy: { createdAt: 'desc' }
    });
    
    res.json({ success: true, milestones, goals });
  } catch (error) {
    console.error('Error loading milestones:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Set Learning Goal API
app.post('/api/twin/:id/goals', async (req, res) => {
  try {
    const { id } = req.params;
    const { type, target } = req.body;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    
    // Verify twin ownership
    const twin = await db.twin.findFirst({
      where: { id, userId }
    });
    
    if (!twin) {
      return res.status(404).json({ success: false, error: 'Twin not found' });
    }
    
    // Create learning goal
    const goal = await db.learningGoal.create({
      data: {
        twinId: id,
        type,
        target,
        current: 0,
        completed: false
      }
    });
    
    res.json({ success: true, goal });
  } catch (error) {
    console.error('Error setting goal:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Performance Metrics API
app.get('/api/twin/:id/performance', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    
    // Verify twin ownership
    const twin = await db.twin.findFirst({
      where: { id, userId }
    });
    
    if (!twin) {
      return res.status(404).json({ success: false, error: 'Twin not found' });
    }
    
    // Calculate performance metrics
    const aiRuns = await db.aiRun.findMany({
      where: { twinId: id },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    
    const avgResponseTime = aiRuns.length > 0 
      ? aiRuns.reduce((sum, run) => sum + (run.responseTime || 0), 0) / aiRuns.length 
      : 0;
    
    const styleCorrections = await db.styleCorrection.findMany({
      where: { twinId: id },
      orderBy: { createdAt: 'desc' },
      take: 50
    });
    
    const accuracyScore = styleCorrections.length > 0
      ? (styleCorrections.filter(c => c.feedback === 'positive').length / styleCorrections.length) * 100
      : 0;
    
    const learningRate = await calculateLearningRate(id);
    const userSatisfaction = await calculateUserSatisfaction(id);
    
    const metrics = {
      responseTime: Math.round(avgResponseTime),
      accuracyScore: Math.round(accuracyScore),
      learningRate: Math.round(learningRate),
      userSatisfaction: Math.round(userSatisfaction)
    };
    
    // Generate optimization recommendations
    const recommendations = generateOptimizationRecommendations(metrics, aiRuns.length, styleCorrections.length);
    
    res.json({ success: true, metrics, recommendations });
  } catch (error) {
    console.error('Error loading performance metrics:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Optimize Memories API
app.post('/api/twin/:id/optimize/memories', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    
    // Verify twin ownership
    const twin = await db.twin.findFirst({
      where: { id, userId }
    });
    
    if (!twin) {
      return res.status(404).json({ success: false, error: 'Twin not found' });
    }
    
    // Get all memories
    const memories = await db.memChunk.findMany({
      where: { twinId: id }
    });
    
    // Simple optimization: remove duplicates and consolidate similar memories
    const optimized = await optimizeMemoryChunks(memories);
    
    res.json({ success: true, optimized: optimized.length });
  } catch (error) {
    console.error('Error optimizing memories:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Analyze Performance API
app.post('/api/twin/:id/analyze/performance', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    
    // Verify twin ownership
    const twin = await db.twin.findFirst({
      where: { id, userId }
    });
    
    if (!twin) {
      return res.status(404).json({ success: false, error: 'Twin not found' });
    }
    
    // Perform performance analysis
    const analysis = await performPerformanceAnalysis(id);
    
    res.json({ success: true, analysis });
  } catch (error) {
    console.error('Error analyzing performance:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Export Analytics API
app.get('/api/twin/:id/export/analytics', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    
    // Verify twin ownership
    const twin = await db.twin.findFirst({
      where: { id, userId }
    });
    
    if (!twin) {
      return res.status(404).json({ success: false, error: 'Twin not found' });
    }
    
    // Gather all analytics data
    const analytics = await gatherAnalyticsData(id);
    
    res.json({ success: true, analytics });
  } catch (error) {
    console.error('Error exporting analytics:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Reset Performance API
app.post('/api/twin/:id/reset/performance', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    
    // Verify twin ownership
    const twin = await db.twin.findFirst({
      where: { id, userId }
    });
    
    if (!twin) {
      return res.status(404).json({ success: false, error: 'Twin not found' });
    }
    
    // Reset performance metrics
    await db.aiRun.deleteMany({
      where: { twinId: id }
    });
    
    await db.styleCorrection.deleteMany({
      where: { twinId: id }
    });
    
    res.json({ success: true, message: 'Performance metrics reset successfully' });
  } catch (error) {
    console.error('Error resetting performance:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Helper functions for Phase 2F
async function calculateLearningRate(twinId: string): Promise<number> {
  // Calculate learning rate based on recent improvements
  const recentCorrections = await db.styleCorrection.findMany({
    where: { twinId },
    orderBy: { createdAt: 'desc' },
    take: 20
  });
  
  if (recentCorrections.length < 5) return 0;
  
  const positiveRate = recentCorrections.filter(c => c.feedback === 'positive').length / recentCorrections.length;
  return positiveRate * 100;
}

async function calculateUserSatisfaction(twinId: string): Promise<number> {
  // Calculate user satisfaction based on feedback
  const feedbacks = await db.chatFeedback.findMany({
    where: { twinId },
    orderBy: { createdAt: 'desc' },
    take: 50
  });
  
  if (feedbacks.length === 0) return 0;
  
  const satisfactionRate = feedbacks.filter(f => f.rating >= 4).length / feedbacks.length;
  return satisfactionRate * 100;
}

function generateOptimizationRecommendations(metrics: any, aiRunsCount: number, correctionsCount: number): any[] {
  const recommendations = [];
  
  if (metrics.responseTime > 2000) {
    recommendations.push({
      type: 'warning',
      icon: '⚠️',
      title: 'Response Time Optimization',
      description: 'Consider optimizing memory chunks to improve response speed'
    });
  }
  
  if (metrics.accuracyScore < 70) {
    recommendations.push({
      type: 'tip',
      icon: '💡',
      title: 'Style Enhancement',
      description: 'Add more style anchors for better consistency'
    });
  }
  
  if (aiRunsCount < 10) {
    recommendations.push({
      type: 'tip',
      icon: '📈',
      title: 'More Training Data',
      description: 'Increase interactions to improve learning accuracy'
    });
  }
  
  return recommendations;
}

async function optimizeMemoryChunks(memories: any[]): Promise<any[]> {
  // Simple optimization: remove exact duplicates
  const uniqueMemories = memories.filter((memory, index, self) => 
    index === self.findIndex(m => m.text === memory.text)
  );
  
  return uniqueMemories;
}

async function performPerformanceAnalysis(twinId: string): Promise<any> {
  // Perform comprehensive performance analysis
  const analysis = {
    totalInteractions: await db.aiRun.count({ where: { twinId } }),
    totalMemories: await db.memChunk.count({ where: { twinId } }),
    totalStyleAnchors: await db.styleAnchor.count({ where: { twinId } }),
    averageResponseTime: 0,
    accuracyTrend: 'stable',
    recommendations: []
  };
  
  return analysis;
}

async function gatherAnalyticsData(twinId: string): Promise<any> {
  // Gather comprehensive analytics data
  const analytics = {
    twinId,
    generatedAt: new Date().toISOString(),
    performance: await db.aiRun.findMany({ where: { twinId } }),
    memories: await db.memChunk.findMany({ where: { twinId } }),
    styleAnchors: await db.styleAnchor.findMany({ where: { twinId } }),
    corrections: await db.styleCorrection.findMany({ where: { twinId } }),
    feedback: await db.chatFeedback.findMany({ where: { twinId } })
  };
  
  return analytics;
}

export default app;
