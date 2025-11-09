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
export interface InstructionState {
    banned_topics?: string[];
    force_policies?: string[];
    tone_override?: 'casual' | 'witty' | 'serious';
    emoji_cap?: number;
    extra_signature?: string[];
    notes?: string;
}
export interface Twin {
    id: string;
    userId: string;
    user: User;
    styleVector: StyleVector;
    instructions?: InstructionState;
    sampleReply?: string;
    isPublic: boolean;
    publicHandle?: string;
    bio?: string;
    profileImage?: string;
    verified: boolean;
    likeCount: number;
    followCount: number;
    chatCount: number;
    createdAt: Date;
    chats: Chat[];
}
export interface StyleVector {
    tone: 'casual' | 'witty' | 'serious' | 'friendly' | 'professional';
    emoji_usage: number;
    hinglish_ratio: number;
    sentence_length: 'short' | 'medium' | 'long';
    signature_patterns: string[];
    formality_level: number;
    humor_style: 'none' | 'light' | 'moderate' | 'heavy';
    question_frequency: number;
    exclamation_usage: number;
    code_mixing_style: 'minimal' | 'moderate' | 'heavy';
    response_length_preference: 'brief' | 'detailed' | 'comprehensive';
    personality_traits: string[];
    communication_style: 'conversational' | 'informative' | 'questioning';
}
export interface Chat {
    id: string;
    userId: string;
    user: User;
    twinId: string;
    twin: Twin;
    createdAt: Date;
    messages: Message[];
}
export interface Message {
    id: string;
    chatId: string;
    chat: Chat;
    sender: MessageSender;
    content: string;
    approved: boolean;
    createdAt: Date;
}
export declare enum MessageSender {
    HUMAN = "human",
    TWIN = "twin"
}
export interface OTP {
    id: string;
    email: string;
    codeHash: string;
    expiresAt: Date;
    createdAt: Date;
    used: boolean;
}
export interface Invite {
    id: string;
    code: string;
    inviterId?: string;
    inviter?: User;
    acceptedBy?: string;
    accepted?: User;
    createdAt: Date;
}
export interface Event {
    id: string;
    userId?: string;
    user?: User;
    type: EventType;
    meta?: any;
    createdAt: Date;
}
export declare enum EventType {
    SIGNUP = "signup",
    TWIN_CREATED = "twin_created",
    CHAT_STARTED = "chat_started",
    DRAFT_GENERATED = "draft_generated",
    MESSAGE_APPROVED = "message_approved",
    PROFILE_SHARED = "profile_shared",
    INVITE_SENT = "invite_sent",
    INVITE_ACCEPTED = "invite_accepted",
    TWIN_MADE_PUBLIC = "twin_made_public",
    TWIN_LIKED = "twin_liked",
    TWIN_FOLLOWED = "twin_followed",
    PUBLIC_CHAT_STARTED = "public_chat_started"
}
export interface TwinLike {
    id: string;
    twinId: string;
    userId: string;
    createdAt: Date;
}
export interface TwinFollow {
    id: string;
    twinId: string;
    userId: string;
    createdAt: Date;
}
export interface PublicChat {
    id: string;
    twinId: string;
    visitorId?: string;
    messageCount: number;
    createdAt: Date;
    lastActivity: Date;
}
export interface PublicTwinProfile {
    id: string;
    userId: string;
    userHandle: string;
    userName: string;
    publicHandle: string;
    bio?: string;
    profileImage?: string;
    verified: boolean;
    likeCount: number;
    followCount: number;
    chatCount: number;
    styleVector: StyleVector;
    sampleReply?: string;
    createdAt: Date;
}
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
}
export interface ProcessInviteRequest {
    code: string;
}
export interface MakeTwinPublicRequest {
    publicHandle: string;
    bio?: string;
    profileImage?: string;
}
export interface UpdateTwinProfileRequest {
    bio?: string;
    profileImage?: string;
    publicHandle?: string;
}
export interface LikeTwinRequest {
    twinId: string;
}
export interface FollowTwinRequest {
    twinId: string;
}
export interface StartPublicChatRequest {
    twinId: string;
    visitorId?: string;
}
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
export interface BlacklistCheck {
    isBlacklisted: boolean;
    reason?: string;
}
export interface ValidationResult {
    isValid: boolean;
    errors?: string[];
}
export interface SessionData {
    userId?: string;
    userEmail?: string;
    userHandle?: string;
    csrfToken?: string;
}
export interface StyleAnchor {
    id: string;
    twin_id: string;
    user_utterance: string;
    ideal_reply: string;
    tags: string[];
    created_at: Date;
}
export interface MemChunk {
    id: string;
    twin_id: string;
    bucket: 'facts' | 'voice';
    text: string;
    embedding?: number[];
    ts: Date;
}
export interface StyleCorrection {
    id: string;
    twin_id: string;
    knob: string;
    delta: number;
    source?: string;
    ts: Date;
}
export interface AIRun {
    id: string;
    twin_id: string;
    mode: 'human' | 'ai2ai';
    tokens_in: number;
    tokens_out: number;
    critic_score?: number;
    regen: boolean;
    latency_ms: number;
    ts: Date;
}
export interface QualityMetrics {
    avg_critic_score: number;
    total_runs: number;
    high_quality_runs: number;
    avg_latency: number;
    avg_tokens_in: number;
    avg_tokens_out: number;
}
export interface AggregatedCorrections {
    knob: string;
    total_delta: number;
    correction_count: number;
}
export interface CreateStyleAnchorRequest {
    user_utterance: string;
    ideal_reply: string;
    tags?: string[];
}
export interface UpdateStyleAnchorRequest {
    user_utterance: string;
    ideal_reply: string;
    tags: string[];
}
export interface CreateMemChunkRequest {
    bucket: 'facts' | 'voice';
    text: string;
    embedding?: number[];
}
export interface CreateStyleCorrectionRequest {
    knob: string;
    delta: number;
    source?: string;
}
export interface CreateAIRunRequest {
    mode: 'human' | 'ai2ai';
    tokens_in: number;
    tokens_out: number;
    critic_score?: number;
    regen?: boolean;
    latency_ms: number;
}
export interface AutoSuggestAnchor {
    user_utterance: string;
    ideal_reply: string;
    tags: string[];
    confidence: number;
}
export interface AutoSuggestResponse {
    anchors: AutoSuggestAnchor[];
    total_found: number;
}
//# sourceMappingURL=interfaces.d.ts.map