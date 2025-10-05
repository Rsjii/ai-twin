# AI Twin Project - Complete Flow Documentation

## Project Overview

**AI Twin** is a full-stack web application that allows users to create AI-powered digital twins of themselves by analyzing their communication style and generating responses that match their unique voice. The system uses OpenAI's GPT models to extract style patterns and generate contextual responses.

## Technology Stack

### Backend
- **Framework**: Express.js with TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: JWT tokens + Express sessions
- **AI Integration**: OpenAI GPT-4o-mini
- **Email Service**: Nodemailer with SMTP
- **Security**: Helmet, CSRF protection, Rate limiting
- **Validation**: Zod schema validation

### Frontend
- **Template Engine**: EJS
- **Styling**: Tailwind CSS
- **JavaScript**: Vanilla JS with modern ES6+ features

### Infrastructure
- **Database**: Supabase PostgreSQL
- **Deployment**: Docker-ready configuration
- **Environment**: Development/Production configurations

## Database Schema

### Core Models

#### User Model
```prisma
model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String?
  handle       String?  @unique
  name         String?
  dob          String?
  phone        String?
  bio          String?
  active       Boolean  @default(false)
  createdAt    DateTime @default(now())
  twins        Twin[]
  chats        Chat[]
  invitesSent  Invite[] @relation("InvitesSent")
  invitesGot   Invite[] @relation("InvitesAccepted")
  events       Event[]
}
```

#### Twin Model
```prisma
model Twin {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  styleVector Json     // Contains AI-extracted style data
  sampleReply String?
  createdAt   DateTime @default(now())
  chats       Chat[]
}
```

#### Chat Model
```prisma
model Chat {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  twinId    String
  twin      Twin     @relation(fields: [twinId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())
  messages  Message[]
}
```

#### Message Model
```prisma
model Message {
  id        String         @id @default(cuid())
  chatId    String
  chat      Chat           @relation(fields: [chatId], references: [id], onDelete: Cascade)
  sender    MessageSender  // 'human' or 'twin'
  content   String
  approved  Boolean        @default(false)
  createdAt DateTime       @default(now())
}

enum MessageSender {
  human
  twin
}
```

#### Supporting Models
- **OTP**: For email verification and password reset
- **Invite**: For referral system
- **Event**: For analytics and tracking

## Application Flow

### 1. User Authentication Flow

#### Signup Process
1. **User Registration** (`/auth`)
   - User enters email and password
   - System validates input using Zod schemas
   - Password is hashed using bcryptjs
   - User account created with `active: false`
   - OTP generated and sent via email
   - Redirect to OTP verification page

2. **OTP Verification** (`/verify-otp`)
   - User enters 6-digit OTP code
   - System verifies OTP against stored hash
   - Account activated (`active: true`)
   - Redirect to profile completion

3. **Profile Completion** (`/signup/profile`)
   - User fills optional profile fields (name, handle, bio, etc.)
   - JWT token generated and stored in HTTP-only cookie
   - Redirect to dashboard

#### Login Process
1. **Email/Password Login** (`/auth`)
   - User enters credentials
   - System validates against stored hash
   - JWT token generated and stored in cookie
   - Redirect to dashboard

2. **Password Reset Flow**
   - User requests password reset
   - OTP sent to email
   - OTP verification
   - New password set

### 2. AI Twin Creation Flow

#### Twin Creation Process (`/twin/create`)
1. **Text Sample Upload**
   - User pastes 3-5 text samples (100-3000 characters)
   - System validates length and content
   - Content sanitized and blacklist checked

2. **Style Extraction**
   - Text sent to OpenAI GPT-4o-mini
   - AI analyzes and extracts style vector:
     ```typescript
     interface StyleVector {
       tone: 'casual' | 'witty' | 'serious';
       emoji_usage: number; // 0-1
       hinglish_ratio: number; // 0-1
       sentence_length: 'short' | 'medium' | 'long';
       signature_patterns: string[];
     }
     ```

3. **Sample Reply Generation**
   - AI generates sample reply using extracted style
   - Twin saved to database with style vector
   - Event logged for analytics

### 3. Chat System Flow

#### Starting a Chat (`/api/chat/start`)
1. **Chat Initialization**
   - User selects twin to chat with
   - New chat record created
   - Chat ID returned for frontend routing

#### Chat Interface (`/chat/:id`)
1. **Message Display**
   - Chat history loaded with messages
   - Twin's style vector retrieved
   - Real-time message updates

2. **Draft Generation** (`/api/chat/:id/generate-draft`)
   - User sends message
   - System generates AI draft using twin's style
   - Draft returned for user approval
   - User can approve, edit, or regenerate

3. **Message Approval**
   - Approved messages saved to database
   - `approved: true` flag set
   - Message appears in chat history

### 4. Security Implementation

#### Authentication Middleware
- **JWT Authentication**: Token-based auth with HTTP-only cookies
- **Session Management**: Express sessions for backward compatibility
- **CSRF Protection**: Token validation for state-changing operations

#### Input Validation
- **Zod Schemas**: Type-safe validation for all inputs
- **Content Filtering**: Blacklist checking for inappropriate content
- **Length Validation**: Message and sample length limits
- **Sanitization**: XSS protection and content cleaning

#### Rate Limiting
- **Express Rate Limit**: 10,000 requests per 15 minutes
- **Per-IP Limiting**: Prevents abuse and spam

### 5. API Endpoints

#### Authentication Routes (`/api/auth`)
- `POST /signup` - User registration
- `POST /signup/verify` - OTP verification
- `POST /signup/profile` - Profile completion
- `POST /login` - User login
- `POST /forgot-password` - Password reset request
- `POST /forgot-password/verify` - Password reset verification
- `POST /reset-password` - Password reset
- `POST /change-password` - Password change
- `POST /logout` - User logout

#### Twin Routes (`/api/twin`)
- `POST /create` - Create new AI twin
- `GET /` - Get user's twins
- `GET /:id` - Get specific twin

#### Chat Routes (`/api/chat`)
- `POST /start` - Start new chat
- `GET /` - Get user's chats
- `GET /:id` - Get specific chat
- `POST /:id/generate-draft` - Generate AI draft
- `POST /:id/send` - Send approved message

#### Profile Routes (`/api/profile`)
- `GET /` - Get user profile
- `PUT /` - Update profile
- `POST /link` - Generate shareable profile link

#### Invite Routes (`/api/invite`)
- `POST /create` - Create referral invite
- `GET /:code` - Use invite code

#### Analytics Routes (`/api/metrics`)
- `GET /events` - Get user events
- `POST /track` - Track custom events

### 6. Frontend Views

#### Main Pages
- **Landing Page** (`/`) - Marketing page with features
- **Auth Page** (`/auth`) - Unified login/signup interface
- **Dashboard** (`/dashboard`) - User's main control panel
- **Twin Creation** (`/twin/create`) - AI twin creation form
- **Chat Interface** (`/chat/:id`) - Real-time chat with AI twin
- **Profile Management** (`/profile`) - User profile settings

#### Supporting Pages
- **OTP Verification** (`/verify-otp`) - Email verification
- **Profile Completion** (`/signup/profile`) - Post-signup setup
- **Password Reset** (`/forgot-password`) - Password recovery
- **Public Profile** (`/p/:handle`) - Shareable user profiles

### 7. AI Integration Details

#### OpenAI Configuration
- **Model**: GPT-4o-mini for cost efficiency
- **Temperature**: 0.3 for style extraction, 0.7-0.8 for generation
- **Max Tokens**: 100-500 depending on use case
- **System Prompts**: Carefully crafted for consistent output

#### Style Extraction Process
1. **Input Validation**: Length and content checks
2. **AI Analysis**: GPT analyzes text samples
3. **JSON Extraction**: Structured style vector generation
4. **Validation**: Ensures proper format and values
5. **Storage**: Saved as JSON in database

#### Response Generation
1. **Context Analysis**: Recent conversation history
2. **Style Application**: Twin's unique style vector
3. **Content Filtering**: Safety and appropriateness checks
4. **Output Generation**: Contextual response in user's style

### 8. Email System

#### SMTP Configuration
- **Provider**: Gmail SMTP
- **Authentication**: App-specific passwords
- **Templates**: HTML email templates for OTP

#### Email Types
- **OTP Verification**: Account activation
- **Password Reset**: Password recovery
- **Welcome Email**: Post-registration

### 9. Development Features

#### Testing Endpoints
- `/test` - Server health check
- `/test-session` - Session testing
- `/test-db` - Database connectivity
- `/test-auth` - Authentication testing
- `/test-otp` - OTP generation/verification

#### Development Mode
- **OTP Display**: On-screen OTP codes for testing
- **Console Logging**: Detailed request/response logging
- **Error Handling**: Comprehensive error tracking

### 10. Deployment Configuration

#### Docker Setup
- **Dockerfile**: Multi-stage build for production
- **Docker Compose**: Database and application services
- **Environment Variables**: Secure configuration management

#### Production Considerations
- **HTTPS**: Secure cookie settings
- **Rate Limiting**: Production-appropriate limits
- **Logging**: Structured logging with Pino
- **Error Handling**: Graceful error responses

## Key Features

### 1. **Style-Based AI Generation**
- Analyzes user's communication patterns
- Extracts tone, emoji usage, language mixing
- Generates contextually appropriate responses

### 2. **Approval-Based Messaging**
- AI generates drafts for user approval
- User maintains control over all communications
- Prevents inappropriate or unwanted messages

### 3. **Multi-Language Support**
- Hinglish (Hindi-English mix) support
- Configurable language mixing ratios
- Cultural context awareness

### 4. **Security-First Design**
- Comprehensive input validation
- Content filtering and blacklisting
- Secure authentication and session management

### 5. **Analytics and Tracking**
- User behavior tracking
- Event logging for insights
- Performance monitoring

## Future Enhancements

### Planned Features
1. **Voice Integration**: Speech-to-text and text-to-speech
2. **Image Analysis**: Profile picture style analysis
3. **Social Features**: Twin sharing and collaboration
4. **Advanced Analytics**: Detailed usage insights
5. **Mobile App**: Native mobile application
6. **API Access**: Third-party integration capabilities

### Technical Improvements
1. **Caching**: Redis for improved performance
2. **Microservices**: Service decomposition
3. **Real-time**: WebSocket integration
4. **Testing**: Comprehensive test suite
5. **Monitoring**: Application performance monitoring

## Conclusion

The AI Twin project represents a sophisticated implementation of AI-powered personalization, combining modern web technologies with advanced AI capabilities. The system prioritizes user control, security, and authentic style replication while maintaining scalability and performance.

The architecture supports both current functionality and future enhancements, with a clear separation of concerns and robust error handling throughout the application stack.