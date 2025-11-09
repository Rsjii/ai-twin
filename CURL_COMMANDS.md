# AI Twin Onboarding API - Complete CURL Commands

## Base URL
```
http://localhost:3000
```

---

## 📝 Placeholders Guide

**Replace these placeholders with your actual values:**

| Placeholder | Description | Example | Where to Get It |
|------------|-------------|---------|----------------|
| `YOUR_EMAIL` | Your email address | `user@example.com` | Your email address |
| `YOUR_PASSWORD` | Your password | `mypassword123` | Your password |
| `YOUR_NAME` | Your full name | `John Doe` | Your name |
| `YOUR_HANDLE` | Your username/handle | `johndoe` | Your username/handle |
| `YOUR_BIO` | Your bio/description | `Software developer` | Your bio text |
| `YOUR_JWT_TOKEN_HERE` | JWT token from login/signup | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` | See [How to Get JWT Token](#-how-to-get-jwt-token) section |
| `OTP_CODE` | OTP code from email | `123456` | Email sent after signup/login request |
| `TWIN_ID` | Your twin ID | `twin_abc123xyz` | See [How to Get TWIN_ID](#-how-to-get-common-placeholders) below |
| `USER_ID` | User ID | `user_123` | See [How to Get USER_ID](#-how-to-get-common-placeholders) below |
| `CHAT_ID` | Chat ID | `chat_abc123` | See [How to Get CHAT_ID](#-how-to-get-common-placeholders) below |
| `PUBLIC_CHAT_ID` | Public chat ID | `public_chat_abc123` | See [How to Get PUBLIC_CHAT_ID](#-how-to-get-common-placeholders) below |
| `REFERRAL_CODE` | Referral code | `REF123ABC` | See [How to Get REFERRAL_CODE](#-how-to-get-common-placeholders) below |
| `MEMORY_KEY` | Memory key from MemoryLongTerm | `fact_123` or `mem_abc` | From GET `/api/twin/:id/long-term-memory` response |
| `ANCHOR_ID` | Style anchor ID | `anchor_123` or numeric ID | From GET `/api/twin/:id/style-anchors` response |
| `SEARCH_QUERY` | Search query text | `developer` | Your search term |

**Important:** 
- Replace ALL placeholders (like `YOUR_EMAIL`, `TWIN_ID`, etc.) with your actual values
- Keep the quotes around values
- Don't include spaces in placeholders when replacing

---

## 🔍 How to Get Common Placeholders

### How to Get TWIN_ID

**TWIN_ID** is one of the most commonly used placeholders. Here's how to get it:

#### Method 1: From Step 4 Response (After Creating Twin)
After creating a twin in **Step 4**, the response contains the `twin.id`:

```powershell
# Step 4: Create Enhanced Twin
curl.exe -X POST "http://localhost:3000/api/onboarding/create-enhanced-twin" `
  -H "Content-Type: application/json" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE" `
  -d $json
```

**Response:**
```json
{
  "success": true,
  "twin": {
    "id": "twin_abc123xyz",  ← This is your TWIN_ID
    "styleVector": {...},
    ...
  }
}
```

**Extract TWIN_ID:**
- Copy the value from `twin.id` field
- Example: `twin_abc123xyz`

#### Method 2: From Get My Profile Response
```powershell
curl.exe -X GET "http://localhost:3000/api/public-twin/my-profile" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE"
```

**Response:**
```json
{
  "success": true,
  "twin": {
    "id": "twin_abc123xyz",  ← This is your TWIN_ID
    ...
  }
}
```

#### Method 3: From Get All Twins Response
```powershell
curl.exe -X GET "http://localhost:3000/api/twin" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE"
```

**Response:**
```json
[
  {
    "id": "twin_abc123xyz",  ← This is your TWIN_ID
    "userId": "USER_ID",
    ...
  }
]
```

#### Extract TWIN_ID Automatically (PowerShell):
```powershell
$response = curl.exe -s -X GET "http://localhost:3000/api/public-twin/my-profile" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE"

# Extract using Select-String
$TWIN_ID = ($response | ConvertFrom-Json).twin.id
Write-Host "TWIN_ID: $TWIN_ID"
```

---

### How to Get USER_ID

**USER_ID** comes from login/signup responses:

#### Method 1: From Step 3 Response (Complete Profile)
```powershell
curl.exe -X POST "http://localhost:3000/api/auth/signup/profile" `
  -H "Content-Type: application/json" `
  -d '{\"email\":\"YOUR_EMAIL\",\"name\":\"YOUR_NAME\",\"handle\":\"YOUR_HANDLE\",\"bio\":\"YOUR_BIO\"}'
```

**Response:**
```json
{
  "message": "Profile completed successfully",
  "token": "...",
  "user": {
    "id": "user_abc123",  ← This is your USER_ID
    "email": "YOUR_EMAIL",
    ...
  }
}
```

#### Method 2: From Login Response
```powershell
curl.exe -X POST "http://localhost:3000/api/auth/login" `
  -H "Content-Type: application/json" `
  -d '{\"email\":\"YOUR_EMAIL\",\"password\":\"YOUR_PASSWORD\"}'
```

**Response:**
```json
{
  "message": "Login successful",
  "token": "...",
  "user": {
    "id": "user_abc123",  ← This is your USER_ID
    ...
  }
}
```

#### Extract USER_ID Automatically (PowerShell):
```powershell
$response = curl.exe -s -X POST "http://localhost:3000/api/auth/login" `
  -H "Content-Type: application/json" `
  -d '{\"email\":\"YOUR_EMAIL\",\"password\":\"YOUR_PASSWORD\"}'

$USER_ID = ($response | ConvertFrom-Json).user.id
Write-Host "USER_ID: $USER_ID"
```

---

### How to Get CHAT_ID

**CHAT_ID** comes from chat creation or listing:

#### Method 1: From Get All Chats Response
```powershell
curl.exe -X GET "http://localhost:3000/api/chat" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE"
```

**Response:**
```json
[
  {
    "id": "chat_abc123",  ← This is your CHAT_ID
    "twinId": "TWIN_ID",
    "title": "Chat Title",
    ...
  }
]
```

#### Method 2: From Start Chat Response
```powershell
curl.exe -X POST "http://localhost:3000/api/chat/start" `
  -H "Content-Type: application/json" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE" `
  -d '{\"twinId\":\"TWIN_ID\"}'
```

**Response:**
```json
{
  "success": true,
  "chat": {
    "id": "chat_abc123",  ← This is your CHAT_ID
    ...
  }
}
```

#### Extract CHAT_ID Automatically (PowerShell):
```powershell
$response = curl.exe -s -X GET "http://localhost:3000/api/chat" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE"

# Get first chat ID
$CHAT_ID = (($response | ConvertFrom-Json) | Select-Object -First 1).id
Write-Host "CHAT_ID: $CHAT_ID"
```

---

### How to Get PUBLIC_CHAT_ID

**PUBLIC_CHAT_ID** comes from public chat creation or listing:

#### Method 1: From Start Public Chat Response
```powershell
curl.exe -X POST "http://localhost:3000/api/public-chat/start" `
  -H "Content-Type: application/json" `
  -d '{\"twinId\":\"TWIN_ID\"}'
```

**Response:**
```json
{
  "success": true,
  "chat": {
    "id": "public_chat_abc123",  ← This is your PUBLIC_CHAT_ID
    ...
  }
}
```

#### Method 2: From Get Public Chats by Twin
```powershell
curl.exe -X GET "http://localhost:3000/api/public-chat/twin/TWIN_ID/chats"
```

**Response:**
```json
[
  {
    "id": "public_chat_abc123",  ← This is your PUBLIC_CHAT_ID
    "twinId": "TWIN_ID",
    ...
  }
]
```

---

### How to Get REFERRAL_CODE

**REFERRAL_CODE** comes from your profile:

#### Method: From Get My Referral Code
```powershell
curl.exe -X GET "http://localhost:3000/api/invite/my-code"
```

**Response:**
```json
{
  "referralCode": "REF123ABC",  ← This is your REFERRAL_CODE
  ...
}
```

#### Extract REFERRAL_CODE Automatically (PowerShell):
```powershell
$response = curl.exe -s -X GET "http://localhost:3000/api/invite/my-code"
$REFERRAL_CODE = ($response | ConvertFrom-Json).referralCode
Write-Host "REFERRAL_CODE: $REFERRAL_CODE"
```

---

### How to Get OTP_CODE

**OTP_CODE** comes from email after signup/login request:

#### Method: From Step 1 Response (Signup)
```powershell
curl.exe -X POST "http://localhost:3000/api/auth/signup" `
  -H "Content-Type: application/json" `
  -d '{\"email\":\"YOUR_EMAIL\",\"password\":\"YOUR_PASSWORD\"}'
```

**Response:**
```json
{
  "message": "OTP sent",
  "otp": "123456",  ← This is your OTP_CODE (also check your email)
  "redirect": "/signup/verify?email=YOUR_EMAIL"
}
```

**Note:** 
- OTP is sent to your email
- Response also contains OTP (for testing)
- In production, only check email

#### Extract OTP_CODE Automatically (PowerShell):
```powershell
$response = curl.exe -s -X POST "http://localhost:3000/api/auth/signup" `
  -H "Content-Type: application/json" `
  -d '{\"email\":\"YOUR_EMAIL\",\"password\":\"YOUR_PASSWORD\"}'

$OTP_CODE = ($response | ConvertFrom-Json).otp
Write-Host "OTP_CODE: $OTP_CODE"
```

---

### How to Get MEMORY_KEY

**MEMORY_KEY** comes from long-term memory responses:

#### Method: From Get Long-Term Memories Response
```powershell
curl.exe -X GET "http://localhost:3000/api/twin/TWIN_ID/long-term-memory" `
  -H "Content-Type: application/json" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE"
```

**Response:**
```json
{
  "success": true,
  "memories": [
    {
      "key": "fact_123",  ← This is your MEMORY_KEY
      "value": "I love coding",
      "category": "fact",
      ...
    },
    {
      "key": "mem_abc",  ← Another MEMORY_KEY
      "value": "I prefer working late",
      "category": "preference",
      ...
    }
  ]
}
```

#### Extract MEMORY_KEY Automatically (PowerShell):
```powershell
$response = curl.exe -s -X GET "http://localhost:3000/api/twin/TWIN_ID/long-term-memory" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE"

# Get first memory key
$MEMORY_KEY = (($response | ConvertFrom-Json).memories | Select-Object -First 1).key
Write-Host "MEMORY_KEY: $MEMORY_KEY"

# Or get all memory keys
$allKeys = ($response | ConvertFrom-Json).memories | ForEach-Object { $_.key }
Write-Host "All MEMORY_KEYs: $allKeys"
```

---

### How to Get ANCHOR_ID

**ANCHOR_ID** comes from style anchors responses:

#### Method: From Get Style Anchors Response
```powershell
curl.exe -X GET "http://localhost:3000/api/twin/TWIN_ID/style-anchors" `
  -H "Content-Type: application/json" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE"
```

**Response:**
```json
{
  "success": true,
  "anchors": [
    {
      "id": 1,  ← This is your ANCHOR_ID (can be numeric)
      "twinId": "TWIN_ID",
      "type": "phrase",
      "phrase": "Thanks a lot!",
      ...
    },
    {
      "id": 2,  ← Another ANCHOR_ID
      "twinId": "TWIN_ID",
      "type": "interaction",
      "userUtterance": "How are you?",
      ...
    }
  ]
}
```

#### Extract ANCHOR_ID Automatically (PowerShell):
```powershell
$response = curl.exe -s -X GET "http://localhost:3000/api/twin/TWIN_ID/style-anchors" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE"

# Get first anchor ID
$ANCHOR_ID = (($response | ConvertFrom-Json).anchors | Select-Object -First 1).id
Write-Host "ANCHOR_ID: $ANCHOR_ID"

# Or get all anchor IDs
$allIds = ($response | ConvertFrom-Json).anchors | ForEach-Object { $_.id }
Write-Host "All ANCHOR_IDs: $allIds"
```

---

### Quick Reference: Extraction Commands

**Save all IDs to variables for easy use:**

```powershell
# 1. Login and get USER_ID and TOKEN
$loginResponse = curl.exe -s -X POST "http://localhost:3000/api/auth/login" `
  -H "Content-Type: application/json" `
  -d '{\"email\":\"YOUR_EMAIL\",\"password\":\"YOUR_PASSWORD\"}'

$loginData = $loginResponse | ConvertFrom-Json
$USER_ID = $loginData.user.id
$TOKEN = $loginData.token
Write-Host "USER_ID: $USER_ID"
Write-Host "TOKEN: $TOKEN"

# 2. Get TWIN_ID
$twinResponse = curl.exe -s -X GET "http://localhost:3000/api/public-twin/my-profile" `
  -H "Cookie: jwtToken=$TOKEN"

$twinData = $twinResponse | ConvertFrom-Json
$TWIN_ID = $twinData.twin.id
Write-Host "TWIN_ID: $TWIN_ID"

# 3. Get CHAT_ID (first chat)
$chatResponse = curl.exe -s -X GET "http://localhost:3000/api/chat" `
  -H "Cookie: jwtToken=$TOKEN"

$chats = $chatResponse | ConvertFrom-Json
$CHAT_ID = $chats[0].id
Write-Host "CHAT_ID: $CHAT_ID"

# 4. Get REFERRAL_CODE
$refResponse = curl.exe -s -X GET "http://localhost:3000/api/invite/my-code"
$REFERRAL_CODE = ($refResponse | ConvertFrom-Json).referralCode
Write-Host "REFERRAL_CODE: $REFERRAL_CODE"

# 5. Get MEMORY_KEY (first memory)
$memoryResponse = curl.exe -s -X GET "http://localhost:3000/api/twin/$TWIN_ID/long-term-memory" `
  -H "Cookie: jwtToken=$TOKEN"

$memories = ($memoryResponse | ConvertFrom-Json).memories
if ($memories -and $memories.Count -gt 0) {
  $MEMORY_KEY = $memories[0].key
  Write-Host "MEMORY_KEY: $MEMORY_KEY"
} else {
  Write-Host "No memories found. Create one first."
}

# 6. Get ANCHOR_ID (first anchor)
$anchorResponse = curl.exe -s -X GET "http://localhost:3000/api/twin/$TWIN_ID/style-anchors" `
  -H "Cookie: jwtToken=$TOKEN"

$anchors = ($anchorResponse | ConvertFrom-Json).anchors
if ($anchors -and $anchors.Count -gt 0) {
  $ANCHOR_ID = $anchors[0].id
  Write-Host "ANCHOR_ID: $ANCHOR_ID"
} else {
  Write-Host "No anchors found. Create one first."
}

# Now use these variables in your commands:
# curl.exe -X GET "http://localhost:3000/api/twin/$TWIN_ID" -H "Cookie: jwtToken=$TOKEN"
# curl.exe -X GET "http://localhost:3000/api/twin/$TWIN_ID/long-term-memory/$MEMORY_KEY" -H "Cookie: jwtToken=$TOKEN"
# curl.exe -X DELETE "http://localhost:3000/api/twin/$TWIN_ID/style-anchors/$ANCHOR_ID" -H "Cookie: jwtToken=$TOKEN"
```

---

## Step 1: Signup - Get OTP

```powershell
curl.exe -X POST "http://localhost:3000/api/auth/signup" `
  -H "Content-Type: application/json" `
  -d '{\"email\":\"YOUR_EMAIL\",\"password\":\"YOUR_PASSWORD\"}'
```

**Response:**
```json
{
  "message": "OTP sent",
  "otp": "OTP_CODE",
  "redirect": "/signup/verify?email=YOUR_EMAIL"
}
```

**Save OTP from response!**

---

## Step 2: Verify OTP

```powershell
curl.exe -X POST "http://localhost:3000/api/auth/signup/verify" `
  -H "Content-Type: application/json" `
  -d '{\"email\":\"YOUR_EMAIL\",\"code\":\"OTP_CODE\"}'
```

**Response:**
```json
{
  "message": "Account activated successfully",
  "redirect": "/signup/profile?email=YOUR_EMAIL"
}
```

---

## Step 3: Complete Profile - Get JWT Token

```powershell
curl.exe -X POST "http://localhost:3000/api/auth/signup/profile" `
  -H "Content-Type: application/json" `
  -d '{\"email\":\"YOUR_EMAIL\",\"name\":\"YOUR_NAME\",\"handle\":\"YOUR_HANDLE\",\"bio\":\"YOUR_BIO\"}'
```

**Response:**
```json
{
  "message": "Profile completed successfully",
  "redirect": "/dashboard",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "USER_ID",
    "email": "YOUR_EMAIL",
    "handle": "YOUR_HANDLE",
    "name": "YOUR_NAME"
  }
}
```

**Save JWT Token from response!**

---

## Step 4: Create Enhanced Twin (Onboarding)

```powershell
$json = @'
{
  "basicInfo": {
    "fullName": "YOUR_NAME",
    "username": "YOUR_HANDLE",
    "bio": "I am a software developer who loves coding and building amazing products. I enjoy working with modern technologies.",
    "primaryUseCase": "personal"
  },
  "communicationStyle": {
    "tone": {
      "formalCasual": 30,
      "seriousPlayful": 60,
      "directDiplomatic": 70
    },
    "language": {
      "greetingStyle": "casual",
      "closingStyle": "friendly",
      "emojiUsage": "medium",
      "responseLength": "medium",
      "commonPhrases": "Thanks!, No worries, Absolutely!"
    }
  },
  "context": {
    "interests": ["technology", "gaming", "music"],
    "targetAudience": "friends-family",
    "topicsToAvoid": "Politics and religion"
  },
  "samples": {
    "content": [
      {
        "category": "email-message",
        "content": "Hey! Just wanted to check in and see how you are doing. Let me know if you need any help with the project."
      },
      {
        "category": "social-media",
        "content": "Just shipped a new feature! Really excited about this one. Can't wait to see what users think about it."
      },
      {
        "category": "additional",
        "content": "Thanks for the feedback. I really appreciate you taking the time to share your thoughts. Let me know if you have any other suggestions!"
      }
    ]
  },
  "onboardingCompleted": true,
  "completedAt": "2024-01-15T10:30:00.000Z"
}
'@

curl.exe -X POST "http://localhost:3000/api/onboarding/create-enhanced-twin" `
  -H "Content-Type: application/json" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE" `
  -d $json
```

**Response:**
```json
{
  "success": true,
  "twin": {
    "id": "TWIN_ID",
    "styleVector": {...},
    "sampleReply": "...",
    "personaData": {...},
    "systemPrompt": "...",
    "createdAt": "2024-01-15T10:30:00.000Z"
  }
}
```

---

## Step 5: Get Stored Onboarding Data (Complete)

```powershell
curl.exe -X GET "http://localhost:3000/api/public-twin/my-profile" `
  -H "Content-Type: application/json" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE"
```

**Response (Complete Data):**
```json
{
  "success": true,
  "twin": {
    "id": "TWIN_ID",
    "isPublic": false,
    "publicHandle": null,
    "bio": null,
    "profileImage": null,
    "verified": false,
    "likeCount": 0,
    "followCount": 0,
    "chatCount": 0,
    "styleVector": {
      "communicationStyle": {
        "tone": {
          "formalCasual": 30,
          "seriousPlayful": 60,
          "directDiplomatic": 70
        },
        "language": {
          "greetingStyle": "casual",
          "closingStyle": "friendly",
          "emojiUsage": "medium",
          "responseLength": "medium",
          "commonPhrases": "Thanks!, No worries, Absolutely!"
        }
      },
      "context": {
        "interests": ["technology", "gaming", "music"],
        "targetAudience": "friends-family",
        "topicsToAvoid": "Politics and religion"
      },
      "samples": {
        "count": 3,
        "categories": ["email-message", "social-media", "additional"],
        "hasSamples": true
      },
      "createdAt": "2024-01-15T10:30:00.000Z",
      "version": "3.0"
    },
    "sampleReply": "Hey there! I'\''m doing great, thanks for asking!",
    "personaData": {
      "name": "YOUR_NAME",
      "username": "YOUR_HANDLE",
      "bio": "I am a software developer...",
      "primaryUseCase": "personal",
      "communicationStyle": {...},
      "context": {...},
      "samples": {...},
      "onboardingCompleted": true,
      "completedAt": "2024-01-15T10:30:00.000Z"
    },
    "systemPrompt": "You are YOUR_NAME, an AI twin created to represent this person'\''s communication style and personality.\n\nBIO:\nI am a software developer...\n\nCOMMUNICATION STYLE:\n...\n\nCONTEXT & INTERESTS:\n...",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "userHandle": "YOUR_HANDLE",
    "userName": "YOUR_NAME"
  },
  "user": {
    "personaData": {
      "basicInfo": {
        "fullName": "YOUR_NAME",
        "username": "YOUR_HANDLE",
        "bio": "I am a software developer...",
        "primaryUseCase": "personal"
      },
      "communicationStyle": {...},
      "context": {...},
      "samples": {...},
      "completedAt": "2024-01-15T10:30:00.000Z"
    },
    "onboardingCompleted": true
  }
}
```

---

## Alternative: Login (If User Already Exists)

### Login with Password
```powershell
curl.exe -X POST "http://localhost:3000/api/auth/login" `
  -H "Content-Type: application/json" `
  -d '{\"email\":\"YOUR_EMAIL\",\"password\":\"YOUR_PASSWORD\"}'
```

**Response:**
```json
{
  "message": "Login successful",
  "redirect": "/dashboard",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "USER_ID",
    "email": "YOUR_EMAIL",
    "handle": "YOUR_HANDLE",
    "name": "YOUR_NAME"
  }
}
```

### Login with OTP (Passwordless)
```powershell
# Step 1: Request OTP
curl.exe -X POST "http://localhost:3000/api/auth/login" `
  -H "Content-Type: application/json" `
  -d '{\"email\":\"YOUR_EMAIL\"}'

# Step 2: Verify OTP
curl.exe -X POST "http://localhost:3000/api/auth/login/verify" `
  -H "Content-Type: application/json" `
  -d '{\"email\":\"YOUR_EMAIL\",\"code\":\"OTP_CODE\"}'
```

---

## Quick Test Script (All Steps)

### For Bash/Git Bash (Linux/Mac):
Save this as `quick-test.sh`:

```bash
#!/bin/bash
EMAIL="YOUR_EMAIL"
PASSWORD="YOUR_PASSWORD"
BASE_URL="http://localhost:3000"

# Step 1: Signup
echo "Step 1: Signup..."
SIGNUP=$(curl -s -X POST "${BASE_URL}/api/auth/signup" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}")
OTP=$(echo $SIGNUP | grep -o '"otp":"[^"]*' | cut -d'"' -f4)
echo "OTP: $OTP"

# Step 2: Verify
echo "Step 2: Verify OTP..."
curl -s -X POST "${BASE_URL}/api/auth/signup/verify" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${EMAIL}\",\"code\":\"${OTP}\"}"

# Step 3: Complete Profile
echo "Step 3: Complete Profile..."
PROFILE=$(curl -s -X POST "${BASE_URL}/api/auth/signup/profile" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${EMAIL}\",\"name\":\"YOUR_NAME\",\"handle\":\"YOUR_HANDLE\",\"bio\":\"Test bio\"}")
TOKEN=$(echo $PROFILE | grep -o '"token":"[^"]*' | cut -d'"' -f4)
echo "Token: $TOKEN"

# Step 4: Create Twin (use the full twin data from Step 4 above)
# ... (paste Step 4 curl command here with $TOKEN)

# Step 5: Get Stored Data
echo "Step 5: Get Stored Data..."
curl -s -X GET "${BASE_URL}/api/public-twin/my-profile" \
  -H "Cookie: jwtToken=${TOKEN}" | jq
```

### For PowerShell (Windows):
Save this as `quick-test.ps1`:

```powershell
$EMAIL = "YOUR_EMAIL"
$PASSWORD = "YOUR_PASSWORD"
$BASE_URL = "http://localhost:3000"

# Step 1: Signup
Write-Host "Step 1: Signup..."
$SIGNUP = curl.exe -s -X POST "${BASE_URL}/api/auth/signup" `
  -H "Content-Type: application/json" `
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}"
$OTP = ($SIGNUP | Select-String -Pattern '"otp":"([^"]*)"').Matches.Groups[1].Value
Write-Host "OTP: $OTP"

# Step 2: Verify
Write-Host "Step 2: Verify OTP..."
curl.exe -s -X POST "${BASE_URL}/api/auth/signup/verify" `
  -H "Content-Type: application/json" `
  -d "{\"email\":\"${EMAIL}\",\"code\":\"${OTP}\"}"

# Step 3: Complete Profile
Write-Host "Step 3: Complete Profile..."
$PROFILE = curl.exe -s -X POST "${BASE_URL}/api/auth/signup/profile" `
  -H "Content-Type: application/json" `
  -d "{\"email\":\"${EMAIL}\",\"name\":\"YOUR_NAME\",\"handle\":\"YOUR_HANDLE\",\"bio\":\"Test bio\"}"
$TOKEN = ($PROFILE | Select-String -Pattern '"token":"([^"]*)"').Matches.Groups[1].Value
Write-Host "Token: $TOKEN"

# Step 4: Create Twin (use the full twin data from Step 4 above)
# ... (paste Step 4 curl command here with $TOKEN)

# Step 5: Get Stored Data
Write-Host "Step 5: Get Stored Data..."
curl.exe -s -X GET "${BASE_URL}/api/public-twin/my-profile" `
  -H "Cookie: jwtToken=${TOKEN}" | jq
```

---

## What Data is Stored?

After onboarding, the following data is stored:

### In `User` Table:
- `personaData` (JSONB) - Complete onboarding data
- `onboardingCompleted` (BOOLEAN) - true
- `name`, `handle`, `bio` - Basic info

### In `Twin` Table:
- `personaData` (JSONB) - Same onboarding data
- `styleVector` (JSONB) - Communication style vector
- `systemPrompt` (TEXT) - Generated system prompt
- `sampleReply` (TEXT) - Sample AI response

---

## Notes:

1. **JWT Token**: Get from Step 3 (completeProfile) or Step 4 (login) response
2. **Cookie**: Use `Cookie: jwtToken=YOUR_TOKEN` header
3. **Testing**: Use `jq` for pretty JSON output: `curl ... | jq`
4. **Base URL**: Change `localhost:3000` to your server URL

---

## 🔑 How to Get JWT Token

### Method 1: From Signup Flow (Step 3)

After completing profile in **Step 3**, the response contains a `token` field:

```powershell
# Step 3: Complete Profile
curl.exe -X POST "http://localhost:3000/api/auth/signup/profile" `
  -H "Content-Type: application/json" `
  -d '{\"email\":\"YOUR_EMAIL\",\"name\":\"YOUR_NAME\",\"handle\":\"YOUR_HANDLE\",\"bio\":\"YOUR_BIO\"}'
```

**Response:**
```json
{
  "message": "Profile completed successfully",
  "redirect": "/dashboard",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c2VyXzEyMyIsImVtYWlsIjoidGVzdEBleGFtcGxlLmNvbSIsImlhdCI6MTcwNTI4MDAwMCwiZXhwIjoxNzA1MzY2NDAwfQ.abc123xyz789",
  "user": {
    "id": "USER_ID",
    "email": "YOUR_EMAIL",
    "handle": "YOUR_HANDLE",
    "name": "YOUR_NAME"
  }
}
```

**Extract Token:**
- Copy the value from `"token"` field
- Example: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

### Method 2: From Login Flow

After login, the response also contains a `token` field:

```powershell
# Login with Password
curl.exe -X POST "http://localhost:3000/api/auth/login" `
  -H "Content-Type: application/json" `
  -d '{\"email\":\"YOUR_EMAIL\",\"password\":\"YOUR_PASSWORD\"}'
```


**Response:**
```json
{
  "message": "Login successful",
  "redirect": "/dashboard",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c2VyXzEyMyIsImVtYWlsIjoidGVzdEBleGFtcGxlLmNvbSIsImlhdCI6MTcwNTI4MDAwMCwiZXhwIjoxNzA1MzY2NDAwfQ.abc123xyz789",
  "user": {
    "id": "USER_ID",
    "email": "YOUR_EMAIL",
    "handle": "YOUR_HANDLE",
    "name": "YOUR_NAME"
  }
}
```

**Extract Token:**
- Copy the value from `"token"` field

### Method 3: Extract Token Automatically (Bash)

Save token to variable:

**For Bash:**
```bash
# Get token from response
RESPONSE=$(curl -s -X POST "http://localhost:3000/api/auth/signup/profile" \
  -H "Content-Type: application/json" \
  -d '{"email":"YOUR_EMAIL","name":"YOUR_NAME","handle":"YOUR_HANDLE","bio":"YOUR_BIO"}')

# Extract token using jq
TOKEN=$(echo $RESPONSE | jq -r '.token')

# Or extract using grep (if jq not available)
TOKEN=$(echo $RESPONSE | grep -o '"token":"[^"]*' | cut -d'"' -f4)

echo "Token: $TOKEN"
```

**For PowerShell:**
```powershell
# Get token from response
$RESPONSE = curl.exe -s -X POST "http://localhost:3000/api/auth/signup/profile" `
  -H "Content-Type: application/json" `
  -d '{\"email\":\"YOUR_EMAIL\",\"name\":\"YOUR_NAME\",\"handle\":\"YOUR_HANDLE\",\"bio\":\"YOUR_BIO\"}'

# Extract token using Select-String
$TOKEN = ($RESPONSE | Select-String -Pattern '"token":"([^"]*)"').Matches.Groups[1].Value

Write-Host "Token: $TOKEN"
```

### Method 4: Extract Token from JSON Response (Manual)

1. Run the signup/profile or login command
2. Copy the entire JSON response
3. Look for the `"token"` field
4. Copy the value (it's a long string starting with `eyJ...`)
5. Use it in subsequent requests

### How to Use JWT Token

Once you have the token, use it in the `Cookie` header:

```powershell
curl.exe -X GET "http://localhost:3000/api/twin" `
  -H "Content-Type: application/json" `
  -H "Cookie: jwtToken=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Important:**
- Replace `YOUR_JWT_TOKEN_HERE` with your actual token
- Token expires after some time (usually 24 hours)
- If you get `401 Unauthorized`, token might be expired - login again to get new token

### Quick Test: Verify Your Token Works

```powershell
# Test if token is valid
curl.exe -X GET "http://localhost:3000/api/profile" `
  -H "Cookie: jwtToken=YOUR_TOKEN_HERE"
```

If you get user data back, token is valid! ✅

---

## Troubleshooting:

- **401 Unauthorized**: Check JWT token is valid (might be expired - login again)
- **400 Bad Request**: Check JSON format and required fields
- **404 Not Found**: User doesn't have a twin yet - complete onboarding first

---

## 📊 Database Tables Data Viewing - Complete CURL Commands

**Note:** Replace `YOUR_JWT_TOKEN_HERE` with your actual JWT token from login/signup.

---

### 👤 User & Profile Data

#### Get My Profile
```powershell
curl.exe -X GET "http://localhost:3000/api/profile" `
  -H "Content-Type: application/json" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE"
```
**Shows:** User table data (name, handle, bio, email, personaData, onboardingCompleted)

#### Get My Twin Profile (Complete Data)
```powershell
curl.exe -X GET "http://localhost:3000/api/public-twin/my-profile" `
  -H "Content-Type: application/json" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE"
```
**Shows:** Twin table + User table joined data (all onboarding data, styleVector, systemPrompt)

#### Get Public Profile by Handle
```powershell
curl.exe -X GET "http://localhost:3000/api/profile/p/YOUR_HANDLE" `
  -H "Content-Type: application/json"
```
**Shows:** Public profile data (no auth required)

#### Get Public Twin by Handle
```powershell
curl.exe -X GET "http://localhost:3000/api/public-twin/public/YOUR_HANDLE" `
  -H "Content-Type: application/json"
```
**Shows:** Public twin data (Twin table where isPublic=true)

---

### 🤖 Twin Data

#### Get All My Twins
```powershell
curl.exe -X GET "http://localhost:3000/api/twin" `
  -H "Content-Type: application/json" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE"
```
**Shows:** All twins for logged-in user (Twin table filtered by userId)

#### Get Specific Twin by ID
```powershell
curl.exe -X GET "http://localhost:3000/api/twin/TWIN_ID" `
  -H "Content-Type: application/json" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE"
```
**Shows:** Complete twin data (Twin table row)

#### Get Twin Edit Data
```powershell
curl.exe -X GET "http://localhost:3000/api/twin/TWIN_ID/edit-data" `
  -H "Content-Type: application/json" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE"
```
**Shows:** Twin data formatted for editing

#### Get Twin Style Anchors
```powershell
curl.exe -X GET "http://localhost:3000/api/twin/TWIN_ID/style-anchors" `
  -H "Content-Type: application/json" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE"
```
**Shows:** style_anchors table data for this twin

#### Get Twin Style Anchor Phrases
```powershell
curl.exe -X GET "http://localhost:3000/api/twin/TWIN_ID/style-anchors/phrases" `
  -H "Content-Type: application/json" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE"
```
**Shows:** Phrases from style_anchors table

#### Get Twin Learning Data
```powershell
curl.exe -X GET "http://localhost:3000/api/twin/TWIN_ID/learning-data" `
  -H "Content-Type: application/json" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE"
```
**Shows:** AILearning table data + learning analytics

#### Get Twin Chat History
```powershell
curl.exe -X GET "http://localhost:3000/api/twin/TWIN_ID/chat-history" `
  -H "Content-Type: application/json" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE"
```
**Shows:** Chat table data for this twin

#### Get Twin Training Effectiveness
```powershell
curl.exe -X GET "http://localhost:3000/api/twin/TWIN_ID/training/effectiveness" `
  -H "Content-Type: application/json" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE"
```
**Shows:** Training effectiveness metrics from AILearning table

#### Get Twin Training Progress
```powershell
curl.exe -X GET "http://localhost:3000/api/twin/TWIN_ID/training-progress" `
  -H "Content-Type: application/json" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE"
```
**Shows:** Training progress data

#### Get Twin Templates
```powershell
curl.exe -X GET "http://localhost:3000/api/twin/TWIN_ID/templates" `
  -H "Content-Type: application/json" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE"
```
**Shows:** Template data for twin

#### Get Twin Milestones
```powershell
curl.exe -X GET "http://localhost:3000/api/twin/TWIN_ID/milestones" `
  -H "Content-Type: application/json" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE"
```
**Shows:** Milestone data

#### Get Twin Performance Metrics
```powershell
curl.exe -X GET "http://localhost:3000/api/twin/TWIN_ID/performance" `
  -H "Content-Type: application/json" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE"
```
**Shows:** TwinPerformance table data

#### Get Twin Long-Term Memory
```powershell
curl.exe -X GET "http://localhost:3000/api/twin/TWIN_ID/long-term-memory" `
  -H "Content-Type: application/json" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE"
```
**Shows:** MemoryLongTerm table data

#### Get Twin AI Runs
```powershell
curl.exe -X GET "http://localhost:3000/api/twin/TWIN_ID/runs" `
  -H "Content-Type: application/json" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE"
```
**Shows:** ai_runs table data

#### Get Twin AI Runs Stats
```powershell
curl.exe -X GET "http://localhost:3000/api/twin/TWIN_ID/runs/stats" `
  -H "Content-Type: application/json" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE"
```
**Shows:** Statistics from ai_runs table

#### Get Twin Quality Dashboard
```powershell
curl.exe -X GET "http://localhost:3000/api/twin/TWIN_ID/runs/quality-dashboard" `
  -H "Content-Type: application/json" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE"
```
**Shows:** Quality metrics from ai_runs table

---

### 💬 Chat Data

#### Get All My Chats
```powershell
curl.exe -X GET "http://localhost:3000/api/chat" `
  -H "Content-Type: application/json" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE"
```
**Shows:** Chat table data for logged-in user

#### Get Specific Chat by ID
```powershell
curl.exe -X GET "http://localhost:3000/api/chat/CHAT_ID" `
  -H "Content-Type: application/json" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE"
```
**Shows:** Chat table row + basic info

#### Get Chat Messages
```powershell
curl.exe -X GET "http://localhost:3000/api/chat/CHAT_ID/messages" `
  -H "Content-Type: application/json" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE"
```
**Shows:** Message table data for this chat

#### Get Chat History
```powershell
curl.exe -X GET "http://localhost:3000/api/chat/history" `
  -H "Content-Type: application/json" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE"
```
**Shows:** All chats with messages for user

#### Get Chat Messages for Specific Twin Chat
```powershell
curl.exe -X GET "http://localhost:3000/api/twin/TWIN_ID/chat/CHAT_ID/messages" `
  -H "Content-Type: application/json" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE"
```
**Shows:** Messages for specific chat of a twin

#### Get Chat Feedback Stats
```powershell
curl.exe -X GET "http://localhost:3000/api/chat/twin/TWIN_ID/feedback-stats" `
  -H "Content-Type: application/json" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE"
```
**Shows:** ChatFeedback table statistics

#### Get All Chats (Chat Management)
```powershell
curl.exe -X GET "http://localhost:3000/api/chats" `
  -H "Content-Type: application/json" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE"
```
**Shows:** All chats with titles and metadata

#### Get Chat Summary
```powershell
curl.exe -X GET "http://localhost:3000/api/chats/CHAT_ID/summary" `
  -H "Content-Type: application/json" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE"
```
**Shows:** Chat summary data

---

### 🌐 Public Chat Data

#### Get Public Chat by Chat ID
```powershell
curl.exe -X GET "http://localhost:3000/api/public-chat/PUBLIC_CHAT_ID" `
  -H "Content-Type: application/json"
```
**Shows:** PublicChat table data (no auth required)

#### Get Public Chat History
```powershell
curl.exe -X GET "http://localhost:3000/api/public-chat/PUBLIC_CHAT_ID/history" `
  -H "Content-Type: application/json"
```
**Shows:** PublicMessage table data for this chat

#### Get Public Chats by Twin ID
```powershell
curl.exe -X GET "http://localhost:3000/api/public-chat/twin/TWIN_ID" `
  -H "Content-Type: application/json"
```
**Shows:** PublicChat table data for this twin

#### Get All Public Chats for Twin
```powershell
curl.exe -X GET "http://localhost:3000/api/public-chat/twin/TWIN_ID/chats" `
  -H "Content-Type: application/json"
```
**Shows:** All PublicChat rows for this twin

#### Get My Public Chats (Logged In User)
```powershell
curl.exe -X GET "http://localhost:3000/api/public-chat/user/my-chats" `
  -H "Content-Type: application/json" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE"
```
**Shows:** PublicChat table data where visitorId = current user

---

### 🧠 Memory Data

**⚠️ Important:** Old `/api/memory/:id/memory/stats` endpoint is **DEPRECATED** and uses empty `mem_chunks` table. Use the new unified endpoints below.

---

#### Get Long-Term Memories (MemoryLongTerm Table) ✅ RECOMMENDED
```powershell
curl.exe -X GET "http://localhost:3000/api/twin/TWIN_ID/long-term-memory" `
  -H "Content-Type: application/json" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE"
```
**Shows:** MemoryLongTerm table data (long-term facts and memories)
**Query Params:** 
- `category` (optional) - Filter by category (fact, preference, etc.)
- `limit` (optional, default: 20) - Number of memories to return
- `query` (optional) - Search query for smart retrieval

**Example with query:**
```powershell
curl.exe -X GET "http://localhost:3000/api/twin/TWIN_ID/long-term-memory?query=coding&limit=10" `
  -H "Content-Type: application/json" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE"
```

#### Add Long-Term Memory
```powershell
curl.exe -X POST "http://localhost:3000/api/twin/TWIN_ID/long-term-memory" `
  -H "Content-Type: application/json" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE" `
  -d '{\"key\":\"fact_123\",\"value\":\"I love coding and building apps\",\"category\":\"fact\"}'
```

**Request Body:**
- `value` (required) - The memory/fact text
- `key` (optional) - Auto-generated if not provided
- `category` (optional, default: "fact") - Category of memory

**Example:**
```powershell
curl.exe -X POST "http://localhost:3000/api/twin/TWIN_ID/long-term-memory" `
  -H "Content-Type: application/json" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE" `
  -d '{\"value\":\"I prefer working late at night\",\"category\":\"preference\"}'
```

#### Update Long-Term Memory
```powershell
curl.exe -X PUT "http://localhost:3000/api/twin/TWIN_ID/long-term-memory/MEMORY_KEY" `
  -H "Content-Type: application/json" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE" `
  -d '{\"value\":\"Updated memory text\",\"category\":\"fact\"}'
```
**Shows:** Updated memory data
**Note:** Replace `MEMORY_KEY` with actual key from memory object

#### Delete Long-Term Memory
```powershell
curl.exe -X DELETE "http://localhost:3000/api/twin/TWIN_ID/long-term-memory/MEMORY_KEY" `
  -H "Content-Type: application/json" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE"
```
**Shows:** Success message
**Note:** Replace `MEMORY_KEY` with actual key from memory object

---

#### Get Style Anchors (style_anchors Table) ✅ RECOMMENDED
```powershell
curl.exe -X GET "http://localhost:3000/api/twin/TWIN_ID/style-anchors" `
  -H "Content-Type: application/json" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE"
```
**Shows:** style_anchors table data (voice patterns, phrases, interactions)
**Query Params:**
- `limit` (optional, default: 10) - Number of anchors to return
- `offset` (optional, default: 0) - Pagination offset

#### Get Style Anchor Phrases Only
```powershell
curl.exe -X GET "http://localhost:3000/api/twin/TWIN_ID/style-anchors/phrases" `
  -H "Content-Type: application/json" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE"
```
**Shows:** Only phrases from style_anchors table

#### Add Style Anchor (Interaction Type)
```powershell
curl.exe -X POST "http://localhost:3000/api/twin/TWIN_ID/style-anchors" `
  -H "Content-Type: application/json" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE" `
  -d '{\"type\":\"interaction\",\"userUtterance\":\"How are you?\",\"idealReply\":\"I'\''m doing great, thanks!\",\"tags\":[\"greeting\"]}'
```

#### Add Style Anchor (Phrase Type)
```powershell
curl.exe -X POST "http://localhost:3000/api/twin/TWIN_ID/style-anchors" `
  -H "Content-Type: application/json" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE" `
  -d '{\"type\":\"phrase\",\"phrase\":\"Thanks a lot!\",\"tags\":[\"gratitude\"]}'
```

#### Add Style Anchor (Pattern Type)
```powershell
curl.exe -X POST "http://localhost:3000/api/twin/TWIN_ID/style-anchors" `
  -H "Content-Type: application/json" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE" `
  -d '{\"type\":\"pattern\",\"userUtterance\":\"Example pattern\",\"patternType\":\"response\",\"context\":\"casual\"}'
```

**Request Body Fields:**
- `type` (required) - "interaction", "phrase", or "pattern"
- `userUtterance` (required for interaction/pattern) - User's input
- `idealReply` (required for interaction) - Expected AI response
- `phrase` (required for phrase type) - The phrase to learn
- `tags` (optional) - Array of tags
- `patternType` (optional for pattern) - Pattern classification
- `context` (optional) - Context information

#### Update Style Anchor
```powershell
curl.exe -X PUT "http://localhost:3000/api/twin/TWIN_ID/style-anchors/ANCHOR_ID" `
  -H "Content-Type: application/json" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE" `
  -d '{\"phrase\":\"Updated phrase\",\"tags\":[\"updated\"]}'
```
**Note:** Replace `ANCHOR_ID` with actual anchor ID

#### Delete Style Anchor
```powershell
curl.exe -X DELETE "http://localhost:3000/api/twin/TWIN_ID/style-anchors/ANCHOR_ID" `
  -H "Content-Type: application/json" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE"
```
**Note:** Replace `ANCHOR_ID` with actual anchor ID

---

### ⚠️ Deprecated Memory Endpoints (Don't Use)

**These endpoints are deprecated and use empty `mem_chunks` table:**

#### ❌ Get Memory Stats (DEPRECATED)
```powershell
# ⚠️ DEPRECATED - Returns empty data
curl.exe -X GET "http://localhost:3000/api/memory/TWIN_ID/memory/stats" `
  -H "Content-Type: application/json" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE"
```
**Response:** `{"success":true,"deprecated":true,"total":0,"stats":[]}`
**Use Instead:** `/api/twin/:id/long-term-memory` or `/api/twin/:id/style-anchors`

#### ❌ Retrieve Memories (DEPRECATED)
```powershell
# ⚠️ DEPRECATED - Uses empty mem_chunks table
curl.exe -X GET "http://localhost:3000/api/memory/TWIN_ID/memory/retrieve?bucket=recent&limit=10" `
  -H "Content-Type: application/json" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE"
```
**Use Instead:** `/api/twin/:id/long-term-memory` for facts or `/api/twin/:id/style-anchors` for voice patterns

---

### 🔍 Discover & Search

#### Get Trending Twins
```powershell
curl.exe -X GET "http://localhost:3000/api/discover/trending" `
  -H "Content-Type: application/json"
```
**Shows:** Twin table data (isPublic=true) sorted by trending

#### Get Recent Twins
```powershell
curl.exe -X GET "http://localhost:3000/api/discover/recent" `
  -H "Content-Type: application/json"
```
**Shows:** Twin table data (isPublic=true) sorted by createdAt

#### Get Popular Twins
```powershell
curl.exe -X GET "http://localhost:3000/api/discover/popular" `
  -H "Content-Type: application/json"
```
**Shows:** Twin table data (isPublic=true) sorted by likeCount/followCount

#### Get Most Liked Twins
```powershell
curl.exe -X GET "http://localhost:3000/api/discover/most-liked" `
  -H "Content-Type: application/json"
```
**Shows:** Twin table data sorted by likeCount (TwinLike table aggregated)

#### Get Most Followed Twins
```powershell
curl.exe -X GET "http://localhost:3000/api/discover/most-followed" `
  -H "Content-Type: application/json"
```
**Shows:** Twin table data sorted by followCount (TwinFollow table aggregated)

#### Search Twins
```powershell
curl.exe -X GET "http://localhost:3000/api/discover/search?q=SEARCH_QUERY" `
  -H "Content-Type: application/json"
```
**Shows:** Twin table search results
**Query Params:** `q` (search query)

#### Get Discover Feed
```powershell
curl.exe -X GET "http://localhost:3000/api/discover/feed" `
  -H "Content-Type: application/json"
```
**Shows:** Curated feed of public twins

#### Get Recommended Twins
```powershell
curl.exe -X GET "http://localhost:3000/api/discover/recommended" `
  -H "Content-Type: application/json"
```
**Shows:** Recommended twins (optional auth)

---

### 👥 Social Data

#### Get Twin Stats (Likes, Follows, Chats)
```powershell
curl.exe -X GET "http://localhost:3000/api/social/stats/TWIN_ID" `
  -H "Content-Type: application/json"
```
**Shows:** TwinLike, TwinFollow, PublicChat table counts

#### Get My Liked Twins
```powershell
curl.exe -X GET "http://localhost:3000/api/social/my-likes" `
  -H "Content-Type: application/json" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE"
```
**Shows:** TwinLike table data for logged-in user

#### Get My Followed Twins
```powershell
curl.exe -X GET "http://localhost:3000/api/social/my-follows" `
  -H "Content-Type: application/json" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE"
```
**Shows:** TwinFollow table data for logged-in user

---

### 📊 Analytics Data

#### Get User Analytics
```powershell
curl.exe -X GET "http://localhost:3000/api/metrics/user" `
  -H "Content-Type: application/json" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE"
```
**Shows:** User analytics data

#### Get Twin Analytics
```powershell
curl.exe -X GET "http://localhost:3000/api/metrics/twin/TWIN_ID/analytics" `
  -H "Content-Type: application/json" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE"
```
**Shows:** Twin analytics data

#### Get Twin Performance Analytics
```powershell
curl.exe -X GET "http://localhost:3000/api/analytics/twin/TWIN_ID/performance" `
  -H "Content-Type: application/json" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE"
```
**Shows:** TwinPerformance table analytics

#### Get Feedback Analytics
```powershell
curl.exe -X GET "http://localhost:3000/api/analytics/feedback" `
  -H "Content-Type: application/json" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE"
```
**Shows:** ChatFeedback table analytics

#### Get Referral Stats
```powershell
curl.exe -X GET "http://localhost:3000/api/metrics/referrals" `
  -H "Content-Type: application/json" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE"
```
**Shows:** Referral data

#### Get Metrics Summary
```powershell
curl.exe -X GET "http://localhost:3000/api/metrics/summary" `
  -H "Content-Type: application/json"
```
**Shows:** System-wide metrics summary

---

### 🔐 Invite & Referral Data

#### Get My Referral Code
```powershell
curl.exe -X GET "http://localhost:3000/api/invite/my-code" `
  -H "Content-Type: application/json"
```
**Shows:** User table referralCode

#### Get My Referrals
```powershell
curl.exe -X GET "http://localhost:3000/api/invite/my-referrals" `
  -H "Content-Type: application/json" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE"
```
**Shows:** Users who used your referral code

#### Get Invite by Code
```powershell
curl.exe -X GET "http://localhost:3000/api/invite/REFERRAL_CODE" `
  -H "Content-Type: application/json"
```
**Shows:** Invite data by code

---

### 🛡️ Privacy & Moderation Data

#### Get Privacy Settings
```powershell
curl.exe -X GET "http://localhost:3000/api/privacy/settings/TWIN_ID" `
  -H "Content-Type: application/json" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE"
```
**Shows:** ModerationSettings table data

#### Get Privacy Analytics
```powershell
curl.exe -X GET "http://localhost:3000/api/privacy/analytics/TWIN_ID" `
  -H "Content-Type: application/json" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE"
```
**Shows:** Privacy-related analytics

#### Check if User is Blocked
```powershell
curl.exe -X GET "http://localhost:3000/api/privacy/check-blocked/TWIN_ID/USER_ID" `
  -H "Content-Type: application/json"
```
**Shows:** TwinBlockedUsers table check

#### Get Moderation Stats
```powershell
curl.exe -X GET "http://localhost:3000/api/moderation/stats" `
  -H "Content-Type: application/json" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE"
```
**Shows:** ContentReport table statistics

---

### 🔗 Share Data

#### Get Share Analytics
```powershell
curl.exe -X GET "http://localhost:3000/api/share/analytics/TWIN_ID" `
  -H "Content-Type: application/json" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE"
```
**Shows:** Share analytics data

#### Get Popular Share Platforms
```powershell
curl.exe -X GET "http://localhost:3000/api/share/popular-platforms" `
  -H "Content-Type: application/json"
```
**Shows:** Share platform statistics

#### Get Shareable Content
```powershell
curl.exe -X GET "http://localhost:3000/api/share/content/YOUR_HANDLE" `
  -H "Content-Type: application/json"
```
**Shows:** Shareable content for twin

---

### 👨‍💼 Admin Analytics (Admin Only)

#### Get Admin Dashboard
```powershell
curl.exe -X GET "http://localhost:3000/api/admin/analytics/dashboard" `
  -H "Content-Type: application/json" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE"
```
**Shows:** Admin analytics dashboard

#### Get Time-Based Analytics
```powershell
curl.exe -X GET "http://localhost:3000/api/admin/analytics/time/week" `
  -H "Content-Type: application/json" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE"
```
**Shows:** Time-based analytics (today/week/month)

#### Get Detailed Metrics
```powershell
curl.exe -X GET "http://localhost:3000/api/admin/analytics/detailed/users" `
  -H "Content-Type: application/json" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE"
```
**Shows:** Detailed metrics (users/twins/chats/messages)

#### Get Users List
```powershell
curl.exe -X GET "http://localhost:3000/api/admin/analytics/users" `
  -H "Content-Type: application/json" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE"
```
**Shows:** User table data (all users)

#### Get Admin User Analytics
```powershell
curl.exe -X GET "http://localhost:3000/api/admin/analytics/user/USER_ID" `
  -H "Content-Type: application/json" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE"
```
**Shows:** Detailed user analytics

#### Get Detailed User Info
```powershell
curl.exe -X GET "http://localhost:3000/api/admin/analytics/user/USER_ID/detailed" `
  -H "Content-Type: application/json" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE"
```
**Shows:** Complete user data with all related tables

#### Get System Health
```powershell
curl.exe -X GET "http://localhost:3000/api/admin/analytics/health" `
  -H "Content-Type: application/json" `
  -H "Cookie: jwtToken=YOUR_JWT_TOKEN_HERE"
```
**Shows:** System health metrics

---

## 📋 Quick Reference: Tables Mapped to Endpoints

| Table Name | Endpoint | Auth Required |
|------------|----------|---------------|
| **User** | `/api/profile`, `/api/public-twin/my-profile` | Yes |
| **Twin** | `/api/twin`, `/api/twin/:id`, `/api/public-twin/:handle` | Yes (some public) |
| **Chat** | `/api/chat`, `/api/chat/:id` | Yes |
| **Message** | `/api/chat/:id/messages` | Yes |
| **PublicChat** | `/api/public-chat/:chatId` | No |
| **PublicMessage** | `/api/public-chat/:chatId/history` | No |
| **TwinLike** | `/api/social/my-likes`, `/api/social/stats/:twinId` | Yes |
| **TwinFollow** | `/api/social/my-follows`, `/api/social/stats/:twinId` | Yes |
| **MemorySession** | `/api/memory/:id/memory/retrieve?bucket=recent` | Yes |
| **MemoryLongTerm** | `/api/memory/:id/memory/retrieve?bucket=longterm` | Yes |
| **style_anchors** | `/api/twin/:id/style-anchors` | Yes |
| **AILearning** | `/api/twin/:id/learning-data` | Yes |
| **TwinPerformance** | `/api/twin/:id/performance` | Yes |
| **ai_runs** | `/api/twin/:id/runs` | Yes |
| **ChatFeedback** | `/api/chat/twin/:twinId/feedback-stats` | Yes |
| **TwinBlockedUsers** | `/api/privacy/check-blocked/:twinId/:userId` | No |
| **ContentReport** | `/api/moderation/stats` | Yes |
| **ModerationSettings** | `/api/privacy/settings/:twinId` | Yes |

---

## 💡 Tips for Testing

1. **Pretty JSON Output**: Add `| jq` at the end for formatted JSON
   ```powershell
   curl.exe -X GET "http://localhost:3000/api/twin" `
     -H "Cookie: jwtToken=YOUR_TOKEN" | jq
   ```

2. **Save Response to File**:
   ```powershell
   curl.exe -X GET "http://localhost:3000/api/twin" `
     -H "Cookie: jwtToken=YOUR_TOKEN" > response.json
   ```

3. **View Headers**:
   ```powershell
   curl.exe -X GET "http://localhost:3000/api/twin" `
     -H "Cookie: jwtToken=YOUR_TOKEN" -v
   ```

4. **Filter Specific Fields** (with jq):
   ```powershell
   curl.exe -X GET "http://localhost:3000/api/twin" `
     -H "Cookie: jwtToken=YOUR_TOKEN" | jq '.[] | {id, userId, isPublic}'
   ```

---

## 🔍 Common Use Cases

### Check if User Has Twin
```powershell
curl.exe -X GET "http://localhost:3000/api/public-twin/my-profile" `
  -H "Cookie: jwtToken=YOUR_TOKEN"
```

### View All Public Twins
```powershell
curl.exe -X GET "http://localhost:3000/api/discover/trending"
```

### Check Twin's Social Stats
```powershell
curl.exe -X GET "http://localhost:3000/api/social/stats/TWIN_ID"
```

### View All Chats for a Twin
```powershell
curl.exe -X GET "http://localhost:3000/api/twin/TWIN_ID/chat-history" `
  -H "Cookie: jwtToken=YOUR_TOKEN"
```

### Check Memory Stats
```powershell
curl.exe -X GET "http://localhost:3000/api/memory/TWIN_ID/memory/stats" `
  -H "Cookie: jwtToken=YOUR_TOKEN"
```

---

