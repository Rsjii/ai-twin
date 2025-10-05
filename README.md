# AI Twin Validation Project

A full-stack Node.js application that validates the AI Twin concept - creating AI versions of users that can chat in their unique style.

## 🚀 Features

- **Email OTP Authentication**: No passwords, just 6-digit codes via email
- **AI Style Extraction**: Upload 3-5 text samples to extract your communication style
- **Approve-Only Chat**: AI generates drafts that you approve before sending
- **Tokenized Public Profiles**: Shareable links with watermarks
- **Referral System**: Invite friends with tracking
- **Analytics Dashboard**: Track all user actions and metrics
- **Security Features**: Blacklist, toxicity checks, rate limiting, CSRF protection

## 🛠 Tech Stack

- **Backend**: Node.js + Express
- **Database**: PostgreSQL + Prisma ORM
- **AI**: OpenAI API (GPT-4o-mini)
- **Frontend**: EJS templates + Tailwind CSS
- **Authentication**: Email OTP (no passwords)
- **Security**: Helmet, CSRF protection, rate limiting
- **Logging**: Morgan + Pino

## 📋 Prerequisites

- Node.js 18+ 
- PostgreSQL database
- OpenAI API key
- SMTP email service (Gmail, Mailgun, etc.)

## 🚀 Quick Start

### 1. Clone and Install

```bash
git clone <repository-url>
cd ai-twin-validation
npm install
```

### 2. Environment Setup

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# Database
DATABASE_URL="postgresql://username:password@localhost:5432/ai_twin_db"

# OpenAI API
OPENAI_API_KEY="sk-your-openai-api-key-here"

# Session Secret (generate a random string)
SESSION_SECRET="your-super-secret-session-key-here"

# Email Configuration (SMTP)
MAIL_FROM="noreply@yourdomain.com"
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_USER="your-email@gmail.com"
SMTP_PASS="your-app-password"

# App Configuration
NODE_ENV="development"
PORT="3000"
```

### 3. Database Setup

Generate Prisma client and run migrations:

```bash
npm run prisma:generate
npm run prisma:migrate
```

### 4. Start Development Server

```bash
npm run dev
```

The server will start on `http://localhost:3000`

## 📁 Project Structure

```
src/
├── config/           # Configuration files
│   ├── env.ts        # Environment variables
│   ├── db.ts         # Prisma client
│   ├── app.ts        # Express app setup
│   └── logger.ts     # Logging configuration
├── middleware/       # Express middleware
│   ├── auth.ts       # Authentication middleware
│   ├── rateLimit.ts  # Rate limiting
│   ├── csrf.ts       # CSRF protection
│   ├── validation.ts # Input validation
│   └── security.ts   # Security utilities
├── modules/          # Feature modules
│   ├── auth/         # Authentication (OTP)
│   ├── twin/         # AI Twin creation
│   ├── chat/         # Chat system
│   ├── profile/      # Public profiles
│   ├── invite/       # Referral system
│   └── analytics/    # Event tracking
├── views/            # EJS templates
│   ├── layout.ejs   # Base layout
│   ├── landing.ejs  # Landing page
│   ├── login.ejs    # Login page
│   ├── verify.ejs   # OTP verification
│   ├── dashboard.ejs # User dashboard
│   ├── twin_create.ejs # Twin creation
│   ├── chat.ejs     # Chat interface
│   ├── profile_public.ejs # Public profile
│   └── 404.ejs      # Error page
└── public/          # Static files
```

## 🔧 Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Start production server
- `npm run prisma:generate` - Generate Prisma client
- `npm run prisma:migrate` - Run database migrations
- `npm run prisma:studio` - Open Prisma Studio
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint errors

## 🔐 Security Features

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

## 📊 API Endpoints

### Authentication
- `POST /api/auth/waitlist` - Join waitlist
- `POST /api/auth/login/start` - Send OTP
- `POST /api/auth/login/verify` - Verify OTP
- `POST /api/auth/logout` - Logout

### Twin Management
- `POST /api/twin/create` - Create AI twin
- `GET /api/twin` - Get user's twins
- `GET /api/twin/:id` - Get specific twin

### Chat System
- `POST /api/chat/start` - Start new chat
- `GET /api/chat` - Get user's chats
- `GET /api/chat/:id` - Get specific chat
- `POST /api/chat/:id/draft` - Generate draft
- `POST /api/chat/:id/send` - Send approved message

### Profile & Sharing
- `POST /api/profile/handle` - Update handle
- `POST /api/profile/link` - Generate profile link
- `GET /api/profile/p/:handle` - Get public profile
- `POST /api/profile/share` - Log profile share

### Invites
- `POST /api/invite/create` - Create invite
- `GET /api/invite/accept` - Accept invite
- `POST /api/invite/process` - Process acceptance

### Analytics
- `GET /api/metrics/summary` - Get system metrics
- `GET /api/metrics/user` - Get user analytics

## 🎯 Core Workflow

1. **Waitlist Signup**: User enters email on landing page
2. **OTP Login**: User receives 6-digit code via email
3. **Twin Creation**: Upload 3-5 text samples → AI extracts style → generates sample reply
4. **Chat System**: Start chat → AI generates drafts → user approves → message sent
5. **Public Profile**: Generate tokenized link → share with others
6. **Referrals**: Create invite codes → track acceptances

## 🔍 Event Tracking

The system tracks these events:
- `signup` - User joins waitlist
- `twin_created` - AI twin created
- `chat_started` - New chat initiated
- `draft_generated` - AI draft created
- `message_approved` - User approves message
- `profile_shared` - Profile link copied
- `invite_sent` - Invite code created
- `invite_accepted` - Invite code used

## 🚀 Deployment

### Environment Variables for Production

```env
NODE_ENV="production"
DATABASE_URL="your-production-database-url"
OPENAI_API_KEY="your-openai-key"
SESSION_SECRET="your-secure-random-string"
MAIL_FROM="noreply@yourdomain.com"
SMTP_HOST="your-smtp-host"
SMTP_USER="your-smtp-user"
SMTP_PASS="your-smtp-password"
```

### Build and Deploy

```bash
npm run build
npm start
```

### Database Migration in Production

```bash
npm run prisma:migrate
```

## 🧪 Testing the Application

1. **Landing Page**: Visit `/` and join waitlist
2. **Login**: Go to `/login` and enter email
3. **Verify OTP**: Check console/email for 6-digit code
4. **Create Twin**: Upload text samples at `/twin/create`
5. **Start Chat**: Create chat and test draft generation
6. **Public Profile**: Generate and test profile link
7. **Analytics**: Check `/api/metrics/summary` for metrics

## 🐛 Troubleshooting

### Common Issues

1. **Database Connection**: Ensure PostgreSQL is running and DATABASE_URL is correct
2. **OpenAI API**: Verify API key is valid and has credits
3. **Email Sending**: Check SMTP credentials and firewall settings
4. **OTP Not Received**: Check spam folder or console logs in development

### Development Tips

- OTP codes are logged to console in development mode
- Use Prisma Studio to inspect database: `npm run prisma:studio`
- Check logs for detailed error information
- All API responses include error details

## 📝 License

MIT License - see LICENSE file for details

## 🤝 Contributing

This is a validation project for the AI Twin concept. Contributions welcome for:
- Bug fixes
- Security improvements
- Performance optimizations
- Additional features

## 📞 Support

For issues or questions:
1. Check the troubleshooting section
2. Review the logs for error details
3. Ensure all environment variables are set correctly
4. Verify database and external service connections

---

**Note**: This is a private alpha validation project. All AI-generated content is clearly labeled and subject to content safety measures.
