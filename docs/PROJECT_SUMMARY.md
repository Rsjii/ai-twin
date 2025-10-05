# AI Twin Validation Project

## Project Overview

This is a full-stack Node.js application that validates the AI Twin concept - creating AI versions of users that can chat in their unique communication style.

## Core Features Implemented

### 1. Authentication System
- Email OTP login (no passwords)
- 6-digit verification codes
- Session management
- CSRF protection

### 2. AI Twin Creation
- Upload 3-5 text samples
- OpenAI extracts communication style
- Generates sample reply in user's style
- Style vector includes tone, emoji usage, hinglish ratio, etc.

### 3. Chat System
- Approve-only chat interface
- AI generates drafts based on conversation
- User approves before sending
- Rate limiting (1 draft per 30 seconds)

### 4. Public Profiles
- Tokenized shareable links
- 48-hour expiration
- Watermarked as AI-generated
- Style summary display

### 5. Referral System
- Generate invite codes
- Track acceptances
- Event logging

### 6. Analytics
- Event tracking for all actions
- System metrics endpoint
- User analytics

## Security Features

- Rate limiting on all endpoints
- Celebrity/brand blacklist
- Toxicity checks
- Input validation with Zod
- CSRF protection
- Helmet security headers
- Content sanitization

## File Structure

```
src/
├── config/          # App configuration
├── middleware/      # Express middleware
├── modules/         # Feature modules
│   ├── auth/       # Authentication
│   ├── twin/       # AI Twin creation
│   ├── chat/       # Chat system
│   ├── profile/    # Public profiles
│   ├── invite/     # Referral system
│   └── analytics/  # Event tracking
├── views/          # EJS templates
└── public/         # Static files
```

## Database Schema

- **User**: Email, handle, timestamps
- **Twin**: Style vector, sample reply
- **Chat**: User-twin conversations
- **Message**: Individual messages
- **OTP**: Email verification codes
- **Invite**: Referral codes
- **Event**: Analytics tracking

## API Endpoints

### Authentication
- `POST /api/auth/waitlist` - Join waitlist
- `POST /api/auth/login/start` - Send OTP
- `POST /api/auth/login/verify` - Verify OTP
- `POST /api/auth/logout` - Logout

### Twin Management
- `POST /api/twin/create` - Create twin
- `GET /api/twin` - List twins
- `GET /api/twin/:id` - Get twin

### Chat System
- `POST /api/chat/start` - Start chat
- `GET /api/chat` - List chats
- `GET /api/chat/:id` - Get chat
- `POST /api/chat/:id/draft` - Generate draft
- `POST /api/chat/:id/send` - Send message

### Profile & Sharing
- `POST /api/profile/handle` - Update handle
- `POST /api/profile/link` - Generate link
- `GET /api/profile/p/:handle` - Public profile
- `POST /api/profile/share` - Log share

### Invites
- `POST /api/invite/create` - Create invite
- `GET /api/invite/accept` - Accept invite
- `POST /api/invite/process` - Process acceptance

### Analytics
- `GET /api/metrics/summary` - System metrics
- `GET /api/metrics/user` - User analytics

## Environment Variables

```env
DATABASE_URL="postgresql://..."
OPENAI_API_KEY="sk-..."
SESSION_SECRET="..."
MAIL_FROM="..."
SMTP_HOST="..."
SMTP_USER="..."
SMTP_PASS="..."
NODE_ENV="development"
PORT="3000"
```

## Development Commands

```bash
npm run dev          # Start development server
npm run build        # Build TypeScript
npm start           # Start production server
npm run prisma:generate  # Generate Prisma client
npm run prisma:migrate   # Run migrations
npm run lint         # Run ESLint
```

## Testing Workflow

1. Visit landing page and join waitlist
2. Login with email OTP
3. Create AI twin with text samples
4. Start chat and test draft generation
5. Generate public profile link
6. Test referral system
7. Check analytics endpoint

## Security Considerations

- All AI-generated content is labeled
- Content filtering before OpenAI calls
- Rate limiting prevents abuse
- CSRF protection on forms
- Input validation and sanitization
- Celebrity/brand impersonation prevention

## Deployment Notes

- Requires PostgreSQL database
- OpenAI API key needed
- SMTP email service required
- Set NODE_ENV=production
- Run database migrations
- Configure environment variables

---

**Status**: Complete validation project ready for testing
**Version**: 1.0.0
**Environment**: Private Alpha
