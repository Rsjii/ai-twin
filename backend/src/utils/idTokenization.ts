/**
 * ============================================================================
 * ID TOKENIZATION SYSTEM - PHASE 6 COMPLETE
 * ============================================================================
 * 
 * SECURITY RULES:
 * 
 * 1. NEVER expose raw database IDs in:
 *    - Public URLs (/public-twin/chat/:twinToken)
 *    - API responses (use sanitize* functions)
 *    - HTML attributes (data-twin-id, data-chat-id)
 *    - JavaScript variables in EJS templates
 *    - localStorage/sessionStorage
 * 
 * 2. ALWAYS use sanitization functions:
 *    - sanitizeUser() for user objects
 *    - sanitizeTwin() for twin objects
 *    - sanitizeChat() for private chat objects
 *    - sanitizePublicChat() for public chat objects
 *    - sanitizeMessage() for message objects
 * 
 * 3. ALWAYS validate tokens before use:
 *    - Use validateAndDetokenize() for basic validation
 *    - Use validateTwinTokenAndOwnership() for private twin operations
 *    - Use validateChatTokenAndAccess() for chat operations
 *    - Use validatePublicTwinToken() for public twin access
 * 
 * 4. ALWAYS log token operations:
 *    - Invalid tokens are logged automatically
 *    - Expired tokens are logged automatically
 *    - Successful detokenization is logged for audit
 * 
 * 5. GRADUAL DEPRECATION:
 *    - Private APIs can return both { id, publicId } temporarily
 *    - Eventually remove raw `id` from all user-facing responses
 * 
 * ============================================================================
 */

// backend/src/utils/idTokenization.ts
import logger from '../config/logger';
import crypto from 'crypto';

const SECRET_KEY = process.env.ID_TOKEN_SECRET || crypto.randomBytes(32).toString('hex');
if (!SECRET_KEY) {
  throw new Error('ID_TOKEN_SECRET is not set');
}
const ALGORITHM = 'aes-256-gcm'; // Better than CBC for security

/**
 * Resource types that can be tokenized
 * - 'user': User IDs
 * - 'twin': Twin IDs  
 * - 'chat': Chat IDs (both Chat and PublicChat)
 * - 'event': Event IDs (optional, currently using 'user' as fallback)
 * - 'invite': Invite IDs (optional, currently using 'user' as fallback)
 */
export type ResourceType = 'user' | 'twin' | 'chat' | 'event' | 'invite';

interface TokenizedId {
  type: ResourceType;
  id: string;
  timestamp: number;
}

/**
 * Convert internal ID to secure public token
 * Uses AES-256-GCM encryption for security
 * 
 * @param id - Internal database ID
 * @param type - Resource type ('user' | 'twin' | 'chat' | 'event' | 'invite')
 * @returns Base64URL-encoded token safe for URLs
 * 
 * @example
 * const token = tokenizeId('user-123', 'user');
 * // Returns: 'eyJ...' (opaque token)
 */
export function tokenizeId(id: string, type: ResourceType = 'user'): string {
  try {
    const payload: TokenizedId = {
      type,
      id,
      timestamp: Date.now()
    };
    
    const text = JSON.stringify(payload);
    const key = crypto.scryptSync(SECRET_KEY, 'salt', 32);
    const iv = crypto.randomBytes(16);
    
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    // Return: iv:authTag:encrypted (base64 encoded for URL safety)
    const token = `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
    return Buffer.from(token).toString('base64url');
  } catch (error) {
    throw new Error('Failed to tokenize ID');
  }
}

/**
 * Convert public token back to internal ID
 * 
 * @param token - Base64URL-encoded token
 * @returns Object with { id: string, type: string } or null if invalid/expired
 * 
 * @example
 * const decoded = detokenizeId('eyJ...');
 * // Returns: { id: 'user-123', type: 'user' } or null
 */
// Line 71-102: ENHANCE detokenizeId with logging
export function detokenizeId(token: string, context?: { userId?: string; endpoint?: string }): { id: string; type: string } | null {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const [ivHex, authTagHex, encrypted] = decoded.split(':');
    
    if (!ivHex || !authTagHex || !encrypted) {
      // ✅ PHASE 6: Add logging for malformed tokens
      logger.warn('detokenizeId: Malformed token structure', {
        tokenLength: token.length,
        context: context || {}
      });
      return null;
    }
    
    const key = crypto.scryptSync(SECRET_KEY, 'salt', 32);
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    const payload: TokenizedId = JSON.parse(decrypted);
    
    // Optional: Check token expiry (e.g., 1 year)
    const maxAge = 365 * 24 * 60 * 60 * 1000; // 1 year
    if (Date.now() - payload.timestamp > maxAge) {
      // ✅ PHASE 6: Add logging for expired tokens
      logger.warn('detokenizeId: Token expired', {
        tokenType: payload.type,
        age: Date.now() - payload.timestamp,
        context: context || {}
      });
      return null; // Token expired
    }
    
    // ✅ PHASE 6: Add success logging for security audit
    if(context?.endpoint) {
      logger.info('detokenizeId: Success', {
        tokenType: payload.type,
        endpoint: context.endpoint,
        userId: context.userId
      });
    }
    
    return { id: payload.id, type: payload.type };
  } catch (error) {
    // ✅ PHASE 6: Enhanced error logging
    logger.error('detokenizeId: Decryption failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      context: context || {}
    });
    return null;
  }
}

/**
 * ============================================================================
 * SANITIZATION FUNCTIONS
 * ============================================================================
 * 
 * Rules for sanitization:
 * 1. All sanitize functions MUST:
 *    - Remove raw DB `id` fields
 *    - Replace with `publicId` (tokenized version)
 *    - Tokenize all foreign key IDs (userId, twinId, chatId, etc.)
 *    - Remove sensitive fields (passwords, internal IDs, etc.)
 * 
 * 2. Public routes & HTML:
 *    - Use `publicHandle` (for pretty URLs) OR `publicId` (opaque token)
 *    - NEVER embed raw DB `id` in HTML, URL, localStorage, etc.
 * 
 * 3. APIs:
 *    - Accept `publicId` in URL/body, use `detokenizeId` to map back to DB id
 *    - Return `publicId` fields in JSON; avoid raw `id` unless admin-only
 * 
 * 4. Resource type mapping:
 *    - User → 'user'
 *    - Twin → 'twin'  
 *    - Chat/PublicChat → 'chat'
 *    - Message/PublicMessage → 'chat' (messages belong to chats)
 *    - Event → 'user' (events belong to users)
 *    - Invite → 'user' (invites are user-related)
 */

/**
 * Sanitize user object - remove sensitive fields and tokenize IDs
 * 
 * @param user - User object from database
 * @param includeEmail - Whether to include email (default: false, only for admin)
 * @returns Sanitized user object with publicId instead of id
 */
export function sanitizeUser(user: any, includeEmail: boolean = false): any {
  if (!user) return null;
  
  const sanitized: any = {
    handle: user.handle,
    name: user.name,
    createdAt: user.createdAt,
    profileImage: user.profileImage,
    bio: user.bio
  };
  
  // Only include email if explicitly needed (e.g., admin views)
  if (includeEmail && user.email) {
    sanitized.email = user.email;
  }
  
  // Tokenize ID
  if (user.id) {
    sanitized.publicId = tokenizeId(user.id, 'user');
  }
  
  // Remove sensitive fields
  delete sanitized.password;
  delete sanitized.passwordHash;
  delete sanitized.internalId;
  delete sanitized.id; // Remove original ID
  
  return sanitized;
}

/**
 * Sanitize twin object
 * 
 * @param twin - Twin object from database
 * @returns Sanitized twin object with publicId and publicUserId instead of raw IDs
 */
export function sanitizeTwin(twin: any): any {
  if (!twin) return null;
  
  const sanitized: any = {
    publicHandle: twin.publicHandle,
    bio: twin.bio,
    profileImage: twin.profileImage,
    likeCount: twin.likeCount,
    followCount: twin.followCount,
    chatCount: twin.chatCount,
    verified: twin.verified,
    isPublic: twin.isPublic,
    createdAt: twin.createdAt,
    updatedAt: twin.updatedAt,
    sampleReply: twin.sampleReply,
    // ✅ NEW: keep interaction + creator flags for discover/public UIs
    hasLiked: twin.hasLiked ?? false,
    hasFollowed: twin.hasFollowed ?? false,
    isOwnTwin: twin.isOwnTwin ?? false,
    // if backend already computed disabled flags, keep them; otherwise derive from allow* if present
    likesDisabled: twin.likesDisabled ?? (twin.allowLikes === false),
    followsDisabled: twin.followsDisabled ?? (twin.allowFollows === false),
    sharesDisabled: twin.sharesDisabled ?? (twin.allowShares === false),
    userName: twin.userName,
    userHandle: twin.userHandle,
  };
  
  // Tokenize IDs
  if (twin.id) {
    sanitized.publicId = tokenizeId(twin.id, 'twin');
  }
  if (twin.userId) {
    sanitized.publicUserId = tokenizeId(twin.userId, 'user');
  }
  
  // Remove original IDs
  delete sanitized.id;
  delete sanitized.userId;
  
  return sanitized;
}

/**
 * Sanitize chat object (for private Chat entities)
 * 
 * @param chat - Chat object from database
 * @returns Sanitized chat object with publicId, publicTwinId, publicUserId
 */
export function sanitizeChat(chat: any): any {
  if (!chat) return null;
  
  const sanitized: any = {
    title: chat.title,
    messageCount: chat.messageCount,
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt
  };
  
  // Tokenize IDs
  if (chat.id) {
    sanitized.publicId = tokenizeId(chat.id, 'chat');
  }
  if (chat.twinId) {
    sanitized.publicTwinId = tokenizeId(chat.twinId, 'twin');
  }
  if (chat.userId) {
    sanitized.publicUserId = tokenizeId(chat.userId, 'user');
  }
  
  // Remove original IDs
  delete sanitized.id;
  delete sanitized.twinId;
  delete sanitized.userId;
  
  return sanitized;
}

/**
 * Sanitize public chat object (for PublicChat entities)
 * 
 * @param publicChat - PublicChat object from database
 * @returns Sanitized public chat object with publicId, publicTwinId, publicUserId
 */
export function sanitizePublicChat(publicChat: any): any {
  if (!publicChat) return null;
  
  const sanitized: any = {
    title: publicChat.title,
    messageCount: publicChat.messageCount || 0,
    createdAt: publicChat.createdAt,
    lastActivity: publicChat.lastActivity,
    summary: publicChat.summary,
    showChatHistory: publicChat.showChatHistory
  };

  // ✅ NEW: map DB last_message → lastMessage for frontend
  if (publicChat.last_message) {
    // If controller passed plain text
    if (typeof publicChat.last_message === 'string') {
      sanitized.lastMessage = {
        content: publicChat.last_message,
        createdAt: publicChat.last_message_time || publicChat.lastActivity || publicChat.createdAt,
        // relativeTime is optional; TimeUtils in frontend will compute if missing
        relativeTime: undefined
      };
    } else {
      // If controller ever sends structured object
      sanitized.lastMessage = {
        content: publicChat.last_message.content,
        createdAt: publicChat.last_message.createdAt || publicChat.last_message_time || publicChat.lastActivity || publicChat.createdAt,
        relativeTime: publicChat.last_message.relativeTime
      };
    }
  }
  
  // Tokenize IDs
  if (publicChat.id) {
    sanitized.publicId = tokenizeId(publicChat.id, 'chat');
  }
  if (publicChat.twinId) {
    sanitized.publicTwinId = tokenizeId(publicChat.twinId, 'twin');
  }
  if (publicChat.userId) {
    sanitized.publicUserId = tokenizeId(publicChat.userId, 'user');
  }
  // Note: visitorId is not tokenized as it's already anonymous/opaque
  
  // Remove original IDs
  delete sanitized.id;
  delete sanitized.twinId;
  delete sanitized.userId;
  
  return sanitized;
}

/**
 * Sanitize message object (for private Message entities)
 * 
 * @param message - Message object from database
 * @returns Sanitized message object with publicId and publicChatId
 * 
 * Note: Messages use 'chat' type since they belong to chats
 */
export function sanitizeMessage(message: any): any {
  if (!message) return null;
  
  const sanitized: any = {
    content: message.content,
    sender: message.sender,
    approved: message.approved,
    createdAt: message.createdAt,
    updatedAt: message.updatedAt
  };
  
  // Tokenize IDs
  // Note: Using 'chat' type for message.id since messages are part of chats
  if (message.id) {
    sanitized.publicId = tokenizeId(message.id, 'chat');
  }
  if (message.chatId) {
    sanitized.publicChatId = tokenizeId(message.chatId, 'chat');
  }
  
  // Remove original IDs
  delete sanitized.id;
  delete sanitized.chatId;
  
  return sanitized;
}

/**
 * Sanitize public message object (for PublicMessage entities)
 * 
 * @param publicMessage - PublicMessage object from database
 * @returns Sanitized public message object with publicId and publicChatId
 */
export function sanitizePublicMessage(publicMessage: any): any {
  if (!publicMessage) return null;
  
  const sanitized: any = {
    content: publicMessage.content,
    sender: publicMessage.sender,
    approved: publicMessage.approved,
    createdAt: publicMessage.createdAt
  };
  
  // Tokenize IDs
  if (publicMessage.id) {
    sanitized.publicId = tokenizeId(publicMessage.id, 'chat');
  }
  if (publicMessage.chatId) {
    sanitized.publicChatId = tokenizeId(publicMessage.chatId, 'chat');
  }
  
  // Remove original IDs
  delete sanitized.id;
  delete sanitized.chatId;
  
  return sanitized;
}

/**
 * Sanitize event object
 * 
 * @param event - Event object from database
 * @returns Sanitized event object with publicId and publicUserId
 * 
 * Note: Events use 'user' type since they belong to users
 */
export function sanitizeEvent(event: any): any {
  if (!event) return null;
  
  const sanitized: any = {
    type: event.type,
    meta: event.meta,
    createdAt: event.createdAt
  };
  
  // Tokenize IDs
  // Note: Using 'user' type for event.id since events belong to users
  if (event.id) {
    sanitized.publicId = tokenizeId(event.id, 'user');
  }
  if (event.userId) {
    sanitized.publicUserId = tokenizeId(event.userId, 'user');
  }
  
  // Remove original IDs
  delete sanitized.id;
  delete sanitized.userId;
  
  return sanitized;
}

/**
 * Sanitize invite object
 * 
 * @param invite - Invite object from database
 * @returns Sanitized invite object with publicId, publicInviterId, publicAcceptedBy
 * 
 * Note: Invites use 'user' type since they are user-related
 */
export function sanitizeInvite(invite: any): any {
  if (!invite) return null;
  
  const sanitized: any = {
    code: invite.code,
    createdAt: invite.createdAt,
    acceptedAt: invite.acceptedAt
  };
  
  // Tokenize IDs
  // Note: Using 'user' type for invite.id since invites are user-related
  if (invite.id) {
    sanitized.publicId = tokenizeId(invite.id, 'user');
  }
  if (invite.inviterId) {
    sanitized.publicInviterId = tokenizeId(invite.inviterId, 'user');
  }
  if (invite.acceptedBy) {
    sanitized.publicAcceptedBy = tokenizeId(invite.acceptedBy, 'user');
  }
  
  // Remove original IDs
  delete sanitized.id;
  delete sanitized.inviterId;
  delete sanitized.acceptedBy;
  
  return sanitized;
}