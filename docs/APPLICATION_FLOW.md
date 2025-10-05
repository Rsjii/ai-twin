# 🔄 AI Twin Application Flow

## Complete User Journey

```
1. LANDING PAGE (/)
   ↓
   User enters email → Join waitlist
   ↓
   
2. LOGIN PAGE (/login)
   ↓
   User enters email → OTP sent to email/console
   ↓
   
3. VERIFY PAGE (/login/verify)
   ↓
   User enters 6-digit OTP → Session created
   ↓
   
4. DASHBOARD (/dashboard)
   ↓
   User sees options: Create Twin, Start Chat, Profile Link, Invite
   ↓
   
5. CREATE TWIN (/twin/create)
   ↓
   User uploads 3-5 text samples → AI extracts style → Sample reply generated
   ↓
   
6. CHAT PAGE (/chat/:id)
   ↓
   User types message → AI generates draft → User approves → Message sent
   ↓
   
7. PUBLIC PROFILE (/p/:handle?t=token)
   ↓
   Others can view user's style summary and sample reply
```

## Database Flow

```
User Table
├── Email (unique)
├── Handle (optional)
├── Created At
└── Relations:
    ├── Twins (1-to-many)
    ├── Chats (1-to-many)
    ├── Invites Sent (1-to-many)
    ├── Invites Received (1-to-many)
    └── Events (1-to-many)

Twin Table
├── Style Vector (JSON)
├── Sample Reply
├── Created At
└── Relations:
    ├── User (many-to-1)
    └── Chats (1-to-many)

Chat Table
├── User ID
├── Twin ID
├── Created At
└── Relations:
    ├── User (many-to-1)
    ├── Twin (many-to-1)
    └── Messages (1-to-many)

Message Table
├── Chat ID
├── Sender (human/twin)
├── Content
├── Approved (boolean)
└── Created At

OTP Table
├── Email
├── Code Hash
├── Expires At
└── Used (boolean)

Invite Table
├── Code (unique)
├── Inviter ID
├── Accepted By ID
└── Created At

Event Table
├── User ID
├── Type (signup, twin_created, etc.)
├── Meta (JSON)
└── Created At
```

## API Flow

```
Authentication Flow:
POST /api/auth/waitlist → Create user
POST /api/auth/login/start → Generate OTP
POST /api/auth/login/verify → Verify OTP, create session

Twin Creation Flow:
POST /api/twin/create → Extract style, generate sample reply

Chat Flow:
POST /api/chat/start → Create chat
POST /api/chat/:id/draft → Generate AI draft
POST /api/chat/:id/send → Send approved message

Profile Flow:
POST /api/profile/link → Generate tokenized link
GET /api/profile/p/:handle → View public profile

Analytics Flow:
GET /api/metrics/summary → System metrics
GET /api/metrics/user → User analytics
```

## Security Flow

```
Request → Rate Limiting → CSRF Check → Authentication → Validation → Controller → Response

Rate Limiting:
- Global: 60 req/hour per IP
- Draft: 1 req/30s per user
- OTP: 3 req/10min per IP
- Twin: 2 req/hour per user

Security Checks:
- Input validation (Zod)
- Content sanitization
- Blacklist check
- Toxicity check
- CSRF protection
```

## AI Processing Flow

```
Text Samples → OpenAI API → Style Vector → Sample Reply

Style Vector Contains:
- Tone (casual/witty/serious)
- Emoji usage (0-1)
- Hinglish ratio (0-1)
- Sentence length (short/medium/long)
- Signature patterns (array)

Draft Generation:
Conversation History → Style Vector → OpenAI API → Draft → User Approval
```

## Event Tracking Flow

```
User Action → Event Logged → Analytics Updated

Events Tracked:
- signup
- twin_created
- chat_started
- draft_generated
- message_approved
- profile_shared
- invite_sent
- invite_accepted
```

## Environment Variables Flow

```
.env File → dotenv → config/env.ts → Application

Required Variables:
- DATABASE_URL (PostgreSQL)
- OPENAI_API_KEY (AI features)
- SESSION_SECRET (Security)
- SMTP credentials (Email)

Optional Variables:
- Rate limiting settings
- OTP settings
- Port number
```

## Development vs Production Flow

```
Development:
- OTP codes logged to console
- Detailed error messages
- Hot reload enabled
- Debug logging

Production:
- OTP codes sent via email
- Generic error messages
- Compiled JavaScript
- Minimal logging
```

## Testing Flow

```
1. Setup environment variables
2. Install dependencies
3. Setup database
4. Run migrations
5. Start development server
6. Test each feature:
   - Waitlist signup
   - OTP login
   - Twin creation
   - Chat functionality
   - Profile sharing
   - Analytics
```

## Error Handling Flow

```
Error Occurs → Logger → Error Handler → User Response

Error Types:
- Validation errors (400)
- Authentication errors (401)
- Not found errors (404)
- Rate limit errors (429)
- Server errors (500)

Error Response Format:
{
  "error": "Error message",
  "details": "Additional info"
}
```

## File Structure Flow

```
src/
├── config/ (Configuration)
├── middleware/ (Request processing)
├── modules/ (Feature logic)
├── views/ (Templates)
├── types/ (TypeScript interfaces)
└── public/ (Static files)

Request Flow:
URL → Route → Middleware → Controller → Service → Database → Response
```

This is the complete flow of how the AI Twin application works!
