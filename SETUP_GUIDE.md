# 🚀 AI Twin Project Setup Guide

## Step-by-Step Setup Instructions

### 1. Prerequisites
- Node.js 18+ installed
- PostgreSQL database running
- OpenAI API key
- Email SMTP credentials (Gmail, Mailgun, etc.)

### 2. Environment Configuration

Create a `.env` file in the project root with these variables:

```env
# Database (Required)
DATABASE_URL="postgresql://username:password@localhost:5432/ai_twin_db"

# OpenAI API (Required for AI features)
OPENAI_API_KEY="sk-your-openai-api-key-here"

# Session Secret (Required - generate random string)
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

### 3. Database Setup

```bash
# Generate Prisma client
npm run prisma:generate

# Run database migrations
npm run prisma:migrate
```

### 4. Start Development Server

```bash
npm run dev
```

### 5. Test the Application

1. Open http://localhost:3000
2. Join waitlist with email
3. Login with OTP (check console for code in dev mode)
4. Create AI twin with text samples
5. Start chat and test draft generation

## Quick Test Commands

```bash
# Check if server is running
curl http://localhost:3000/api/metrics/summary

# Test database connection
npm run prisma:studio
```

## Troubleshooting

- **Database Error**: Check PostgreSQL is running and DATABASE_URL is correct
- **OpenAI Error**: Verify API key has credits
- **Email Error**: Check SMTP credentials
- **OTP Not Received**: Check console logs in development mode
