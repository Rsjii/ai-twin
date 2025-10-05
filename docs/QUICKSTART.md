# AI Twin Validation Project

## Quick Start

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Setup environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Setup database**:
   ```bash
   npm run prisma:generate
   npm run prisma:migrate
   ```

4. **Start development server**:
   ```bash
   npm run dev
   ```

5. **Open browser**: http://localhost:3000

## Features

- ✅ Email OTP authentication (no passwords)
- ✅ AI Twin creation with style extraction
- ✅ Approve-only chat system
- ✅ Tokenized public profiles
- ✅ Referral/invite system
- ✅ Analytics and event tracking
- ✅ Security features (rate limiting, CSRF, blacklist)
- ✅ Modern UI with Tailwind CSS

## API Endpoints

- `POST /api/auth/waitlist` - Join waitlist
- `POST /api/auth/login/start` - Send OTP
- `POST /api/auth/login/verify` - Verify OTP
- `POST /api/twin/create` - Create AI twin
- `POST /api/chat/start` - Start chat
- `POST /api/chat/:id/draft` - Generate draft
- `POST /api/chat/:id/send` - Send message
- `GET /api/metrics/summary` - System metrics

## Security

- Rate limiting on all endpoints
- CSRF protection on POST routes
- Content blacklist and toxicity checks
- Input validation and sanitization
- AI-generated content labeling

## Tech Stack

- Node.js + Express
- PostgreSQL + Prisma
- OpenAI API
- EJS + Tailwind CSS
- Email OTP authentication

---

**Private Alpha** - All AI content is clearly labeled
