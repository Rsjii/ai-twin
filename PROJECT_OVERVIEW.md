# 🎯 AI Twin Project - Complete Overview

## What We Built

**AI Twin Validation Project** - A full-stack application that creates AI versions of users that chat in their unique style.

### Core Concept
1. User uploads 3-5 text samples (messages, posts, comments)
2. AI extracts their communication style (tone, emoji usage, hinglish ratio, etc.)
3. Creates an AI twin that can chat in that style
4. User approves AI-generated drafts before sending
5. Shareable public profiles with watermarks

---

## 🏗️ Project Architecture

### Backend (Node.js + Express)
```
src/
├── config/          # Configuration files
│   ├── env.ts       # Environment variables
│   ├── db.ts        # Prisma database client
│   ├── app.ts       # Express app setup
│   └── logger.ts    # Logging configuration
├── middleware/      # Express middleware
│   ├── auth.ts      # Authentication middleware
│   ├── rateLimit.ts # Rate limiting
│   ├── csrf.ts      # CSRF protection
│   ├── validation.ts # Input validation
│   └── security.ts  # Security utilities
├── modules/         # Feature modules
│   ├── auth/        # Email OTP authentication
│   ├── twin/        # AI Twin creation
│   ├── chat/        # Chat system
│   ├── profile/     # Public profiles
│   ├── invite/      # Referral system
│   └── analytics/   # Event tracking
├── views/          # EJS templates
├── types/          # TypeScript interfaces
└── public/         # Static files
```

### Database Schema (PostgreSQL + Prisma)
- **User**: Email, handle, timestamps
- **Twin**: Style vector, sample reply
- **Chat**: User-twin conversations
- **Message**: Individual messages (human/twin)
- **OTP**: Email verification codes
- **Invite**: Referral codes
- **Event**: Analytics tracking

---

## 🚀 Setup Instructions

### 1. Prerequisites
```bash
# Required Software
- Node.js 18+
- PostgreSQL database
- Git
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Configuration
Create `.env` file:
```env
# Database (Required)
DATABASE_URL="postgresql://username:password@localhost:5432/ai_twin_db"

# OpenAI API (Required)
OPENAI_API_KEY="sk-your-openai-api-key-here"

# Session Secret (Required)
SESSION_SECRET="your-super-secret-session-key-here"

# Email SMTP (Required for OTP)
MAIL_FROM="noreply@yourdomain.com"
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_USER="your-email@gmail.com"
SMTP_PASS="your-app-password"

# App Settings
NODE_ENV="development"
PORT="3000"
```

### 4. Database Setup
```bash
# Generate Prisma client
npm run prisma:generate

# Run database migrations
npm run prisma:migrate
```

### 5. Start Server
```bash
npm run dev
```

### 6. Test Application
Open http://localhost:3000

---

## 🔧 Available Commands

```bash
npm run dev          # Start development server
npm run build        # Build TypeScript
npm start           # Start production server
npm run prisma:generate  # Generate Prisma client
npm run prisma:migrate   # Run database migrations
npm run prisma:studio    # Open Prisma Studio
npm run lint         # Run ESLint
npm run lint:fix     # Fix ESLint errors
```

---

## 📊 API Endpoints

### Authentication
- `POST /api/auth/waitlist` - Join waitlist
- `POST /api/auth/login/start` - Send OTP
- `POST /api/auth/login/verify` - Verify OTP
- `POST /api/auth/logout` - Logout

### Twin Management
- `POST /api/twin/create` - Create AI twin
- `GET /api/twin` - List user's twins
- `GET /api/twin/:id` - Get specific twin

### Chat System
- `POST /api/chat/start` - Start new chat
- `GET /api/chat` - List user's chats
- `GET /api/chat/:id` - Get specific chat
- `POST /api/chat/:id/draft` - Generate AI draft
- `POST /api/chat/:id/send` - Send approved message

### Profile & Sharing
- `POST /api/profile/handle` - Update handle
- `POST /api/profile/link` - Generate profile link
- `GET /api/profile/p/:handle` - Get public profile
- `POST /api/profile/share` - Log profile share

### Invites
- `POST /api/invite/create` - Create invite code
- `GET /api/invite/accept` - Accept invite
- `POST /api/invite/process` - Process acceptance

### Analytics
- `GET /api/metrics/summary` - System metrics
- `GET /api/metrics/user` - User analytics

---

## 🛡️ Security Features

### Rate Limiting
- **Draft Generation**: 1 request per 30 seconds per user
- **OTP Requests**: 3 requests per 10 minutes per IP
- **Twin Creation**: 2 twins per hour per user
- **Global**: 60 requests per hour per IP

### Content Safety
- **Celebrity/Brand Blacklist**: Prevents impersonation
- **Toxicity Checks**: Simple banned words list
- **Input Validation**: Zod schemas for all inputs
- **CSRF Protection**: On all POST routes
- **Input Sanitization**: XSS prevention

### AI Safety
- All AI-generated content is clearly labeled
- Content filtering before sending to OpenAI
- Safe topic restrictions in prompts

---

## 🎯 Testing Workflow

1. **Landing Page**: Visit `/` and join waitlist
2. **Login**: Go to `/login` and enter email
3. **Verify OTP**: Check console/email for 6-digit code
4. **Create Twin**: Upload text samples at `/twin/create`
5. **Start Chat**: Create chat and test draft generation
6. **Public Profile**: Generate and test profile link
7. **Analytics**: Check `/api/metrics/summary` for metrics

---

## 🔍 Key Features Explained

### 1. Email OTP Authentication
- No passwords required
- 6-digit codes sent via email
- 10-minute expiration
- Secure session management

### 2. AI Style Extraction
- Upload 3-5 text samples
- OpenAI extracts communication style
- Returns style vector with tone, emoji usage, hinglish ratio
- Generates sample reply in user's style

### 3. Approve-Only Chat
- AI generates drafts based on conversation
- User approves before sending
- Rate limited to prevent abuse
- All messages labeled as AI-generated

### 4. Public Profiles
- Tokenized shareable links
- 48-hour expiration
- Watermarked as AI-generated
- Style summary display

### 5. Referral System
- Generate unique invite codes
- Track acceptances
- Event logging for analytics

---

## 🚨 Troubleshooting

### Common Issues
1. **Database Connection**: Ensure PostgreSQL is running
2. **OpenAI API**: Verify API key has credits
3. **Email Sending**: Check SMTP credentials
4. **OTP Not Received**: Check console logs in dev mode

### Development Tips
- OTP codes are logged to console in development
- Use Prisma Studio to inspect database
- Check logs for detailed error information
- All API responses include error details

---

## 📈 Event Tracking

The system tracks these events:
- `signup` - User joins waitlist
- `twin_created` - AI twin created
- `chat_started` - New chat initiated
- `draft_generated` - AI draft created
- `message_approved` - User approves message
- `profile_shared` - Profile link copied
- `invite_sent` - Invite code created
- `invite_accepted` - Invite code used

---

## 🎉 Ready to Test!

The project is complete and ready for validation. Just follow the setup steps and you'll have a fully functional AI Twin application running locally!

**Next Steps:**
1. Configure environment variables
2. Set up database
3. Run migrations
4. Start development server
5. Test all features

Happy coding! 🚀
