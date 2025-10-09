// TypeScript Interfaces for AI Twin Project

// User Interface
export interface User {
  id: string;
  email: string;
  handle?: string;
  createdAt: Date;
  twins: Twin[];
  chats: Chat[];
  invitesSent: Invite[];
  invitesGot: Invite[];
  events: Event[];
}

// AI Twin Interface
// Instruction State Interface (user-controlled tweaks)
export interface InstructionState {
  banned_topics?: string[];     // ["politics","romance","finance","health"]
  force_policies?: string[];    // ["no_romance","no_advice"]
  tone_override?: 'casual' | 'witty' | 'serious';
  emoji_cap?: number;           // 0..1
  extra_signature?: string[];
  notes?: string;               // freeform guidance
}

export interface Twin {
  id: string;
  userId: string;
  user: User;
  styleVector: StyleVector;
  instructions?: InstructionState;
  sampleReply?: string;
  createdAt: Date;
  chats: Chat[];
}

// Style Vector Interface (AI extracted style)
export interface StyleVector {
  tone: 'casual' | 'witty' | 'serious';
  emoji_usage: number; // 0-1
  hinglish_ratio: number; // 0-1
  sentence_length: 'short' | 'medium' | 'long';
  signature_patterns: string[];
}

// Chat Interface
export interface Chat {
  id: string;
  userId: string;
  user: User;
  twinId: string;
  twin: Twin;
  createdAt: Date;
  messages: Message[];
}

// Message Interface
export interface Message {
  id: string;
  chatId: string;
  chat: Chat;
  sender: MessageSender;
  content: string;
  approved: boolean;
  createdAt: Date;
}

// Message Sender Enum
export enum MessageSender {
  HUMAN = 'human',
  TWIN = 'twin'
}

// OTP Interface
export interface OTP {
  id: string;
  email: string;
  codeHash: string;
  expiresAt: Date;
  createdAt: Date;
  used: boolean;
}

// Invite Interface
export interface Invite {
  id: string;
  code: string;
  inviterId?: string;
  inviter?: User;
  acceptedBy?: string;
  accepted?: User;
  createdAt: Date;
}

// Event Interface (Analytics)
export interface Event {
  id: string;
  userId?: string;
  user?: User;
  type: EventType;
  meta?: any;
  createdAt: Date;
}

// Event Types
export enum EventType {
  SIGNUP = 'signup',
  TWIN_CREATED = 'twin_created',
  CHAT_STARTED = 'chat_started',
  DRAFT_GENERATED = 'draft_generated',
  MESSAGE_APPROVED = 'message_approved',
  PROFILE_SHARED = 'profile_shared',
  INVITE_SENT = 'invite_sent',
  INVITE_ACCEPTED = 'invite_accepted'
}

// API Response Interfaces
export interface ApiResponse<T = any> {
  success?: boolean;
  error?: string;
  data?: T;
  message?: string;
}

export interface LoginResponse {
  message: string;
  redirect?: string;
}

export interface TwinResponse {
  success: boolean;
  twin: {
    id: string;
    styleVector: StyleVector;
    sampleReply: string;
  };
}

export interface ChatResponse {
  success: boolean;
  chatId: string;
  redirect?: string;
}

export interface DraftResponse {
  draft: string;
}

export interface ProfileResponse {
  user: {
    handle: string;
    createdAt: Date;
  };
  twin: {
    styleVector: StyleVector;
    sampleReply: string;
    createdAt: Date;
  };
}

export interface MetricsResponse {
  summary: {
    totalUsers: number;
    totalTwins: number;
    totalChats: number;
    totalMessages: number;
    totalInvites: number;
    totalEvents: number;
    recentSignups: number;
    recentTwins: number;
  };
  eventBreakdown: Record<string, number>;
  timestamp: string;
}

// Request Interfaces
export interface LoginStartRequest {
  email: string;
}

export interface LoginVerifyRequest {
  email: string;
  code: string;
}

export interface CreateTwinRequest {
  samples: string;
}

export interface StartChatRequest {
  twinId: string;
}

export interface GenerateDraftRequest {
  messages: string[];
}

export interface SendMessageRequest {
  content: string;
}

export interface UpdateHandleRequest {
  handle: string;
}

export interface CreateInviteRequest {
  // No additional fields needed
}

export interface ProcessInviteRequest {
  code: string;
}

// Configuration Interface
export interface AppConfig {
  databaseUrl: string;
  openaiApiKey: string;
  sessionSecret: string;
  mail: {
    from: string;
    smtp: {
      host: string;
      port: number;
      user: string;
      pass: string;
    };
  };
  nodeEnv: string;
  port: number;
  rateLimit: {
    windowMs: number;
    maxRequests: number;
  };
  otp: {
    expiryMinutes: number;
    codeLength: number;
  };
}

// Security Interfaces
export interface BlacklistCheck {
  isBlacklisted: boolean;
  reason?: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors?: string[];
}

// Session Interface
export interface SessionData {
  userId?: string;
  userEmail?: string;
  userHandle?: string;
  csrfToken?: string;
}
