# 🔧 Complete Environment & Database Setup Guide

## Step 1: Environment Variables (.env file)

Create or edit the `.env` file in your project root with these exact variables:

```env
# Database Configuration (REQUIRED)
DATABASE_URL="postgresql://username:password@localhost:5432/ai_twin_db"

# OpenAI API Key (REQUIRED for AI features)
OPENAI_API_KEY="sk-your-openai-api-key-here"

# Session Secret (REQUIRED - generate a random string)
SESSION_SECRET="your-super-secret-session-key-here"

# Email Configuration (REQUIRED for OTP)
MAIL_FROM="noreply@yourdomain.com"
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_USER="your-email@gmail.com"
SMTP_PASS="your-app-password"

# Application Settings
NODE_ENV="development"
PORT="3000"

# Rate Limiting (Optional - defaults are fine)
RATE_LIMIT_WINDOW_MS="3600000"
RATE_LIMIT_MAX_REQUESTS="60"

# OTP Settings (Optional - defaults are fine)
OTP_EXPIRY_MINUTES="10"
OTP_CODE_LENGTH="6"
```

## Step 2: Database Setup (PostgreSQL)

### Option A: Local PostgreSQL Installation
1. Download PostgreSQL from https://www.postgresql.org/download/
2. Install with default settings
3. Remember the password you set for 'postgres' user
4. Update DATABASE_URL in .env file:
   ```env
   DATABASE_URL="postgresql://postgres:yourpassword@localhost:5432/ai_twin_db"
   ```

### Option B: Online Database (Easier)
1. Go to https://supabase.com or https://railway.app
2. Create a new PostgreSQL database
3. Copy the connection string
4. Update DATABASE_URL in .env file

## Step 3: OpenAI API Key
1. Go to https://platform.openai.com/api-keys
2. Create a new API key
3. Copy the key (starts with sk-)
4. Update OPENAI_API_KEY in .env file

## Step 4: Email Configuration (Gmail Example)
1. Enable 2-factor authentication on Gmail
2. Generate App Password: Google Account → Security → App passwords
3. Use your Gmail address and app password:
   ```env
   SMTP_USER="your-email@gmail.com"
   SMTP_PASS="your-16-character-app-password"
   ```

## Step 5: Session Secret
Generate a random string for SESSION_SECRET:
```bash
# You can use any random string, example:
SESSION_SECRET="my-super-secret-key-12345-abcdef"
```

## Step 6: Database Migration
After setting up .env file:
```bash
# Generate Prisma client
npm run prisma:generate

# Run database migrations
npm run prisma:migrate
```

## Step 7: Start Development Server
```bash
npm run dev
```

## Step 8: Test the Application
1. Open http://localhost:3000
2. Join waitlist with your email
3. Check console for OTP code (in development mode)
4. Login and test features

## Troubleshooting

### Database Connection Issues
- Check if PostgreSQL is running
- Verify DATABASE_URL format
- Ensure database exists

### OpenAI API Issues
- Verify API key is correct
- Check if you have credits in OpenAI account
- Ensure API key has proper permissions

### Email Issues
- Check SMTP credentials
- Verify app password (not regular password)
- Check firewall settings

### OTP Not Received
- In development mode, OTP is logged to console
- Check console output for 6-digit code
- Verify email configuration

## Quick Test Commands

```bash
# Check if server is running
curl http://localhost:3000/api/metrics/summary

# Open database management tool
npm run prisma:studio

# Check environment variables
node -e "console.log(process.env.DATABASE_URL)"
```

## Example .env File (Replace with your values)

```env
# Database
DATABASE_URL="postgresql://postgres:mypassword@localhost:5432/ai_twin_db"

# OpenAI
OPENAI_API_KEY="sk-proj-abc123def456ghi789jkl012mno345pqr678stu901vwx234yz"

# Session
SESSION_SECRET="my-super-secret-session-key-12345"

# Email (Gmail)
MAIL_FROM="noreply@myapp.com"
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_USER="myemail@gmail.com"
SMTP_PASS="abcd efgh ijkl mnop"

# App
NODE_ENV="development"
PORT="3000"
```

## Flow Explanation

1. **User visits website** → Landing page loads
2. **User enters email** → Added to waitlist
3. **User clicks login** → OTP sent to email/console
4. **User enters OTP** → Session created, redirected to dashboard
5. **User creates twin** → Uploads text samples → AI extracts style
6. **User starts chat** → AI generates drafts → User approves → Message sent
7. **User shares profile** → Generates tokenized link → Others can view

## Next Steps After Setup

1. Configure .env file with your values
2. Set up PostgreSQL database
3. Get OpenAI API key
4. Configure email SMTP
5. Run database migrations
6. Start development server
7. Test all features

Ready to start? Let me know if you need help with any specific step!
