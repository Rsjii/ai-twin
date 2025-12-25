import { Request, Response, NextFunction } from 'express';
import { db } from '../config/database';
import { checkQuotaStatus, secondsUntilNextUtcMidnight } from '../services/tokenQuotaService';
import { detokenizeId } from '../utils/idTokenization';
import { checkBlacklist } from '../utils/safety';
import { generateId } from '../utils/idGenerator';
import { EventLogger } from '../services/eventLogger';
import { EVENT_TYPES } from '../config/constants';
import { detectFastPathCategory, fastPathReply } from '../utils/commonMessageFastPath';
import { logger } from '../config/logger';

/**
 * Middleware to check token quota BEFORE processing request
 * This prevents any token wastage by blocking requests early
 * 
 * For anonymous users: Uses IP-based tracking (same IP = same quota)
 * For logged-in users: Uses account-based tracking
 */
export const checkTokenQuota = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Determine actor (user or anonymous)
    const userId = (req as any).user?.id || (req as any).user?.userId;
    
    const actor = userId
      ? { kind: 'user' as const, userId }
      : { kind: 'anon' as const, visitorId: null, ip: req.ip || req.socket.remoteAddress || null };

    // Check quota status (read-only, no reservation)
    const quotaStatus = await checkQuotaStatus({ actor });

    if (quotaStatus.exceeded) {
      const retryAfterSeconds = secondsUntilNextUtcMidnight();
      const errorCode = actor.kind === 'anon' ? 'LOGIN_REQUIRED' : 'QUOTA_EXCEEDED';
      const message = actor.kind === 'anon'
        ? 'Daily token limit reached. Please login to continue.'
        : 'Daily token limit reached.';


      return res.status(429).json({
        success: false,
        error: message,
        errorCode,
        retryAfter: formatRetryTime(retryAfterSeconds),
        retryAfterSeconds, // Keep raw seconds for frontend countdown if needed
      });
    }

    // Quota OK, continue to next middleware/handler
    next();
  } catch (error) {
    logger.error('Error checking token quota:', error);
    // On error, allow request to proceed (fail open, but log error)
    // You can change this to fail closed if preferred
    next();
  }
};

// Helper function to format retry time: < 60 min = minutes, >= 60 min = approx hours
function formatRetryTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.round(minutes / 60);
  return `${hours}h`;
}

// Helper function to return 429 response
function quota429(res: Response, actorKind: 'anon' | 'user') {
  const retryAfterSeconds = secondsUntilNextUtcMidnight();
  const errorCode = actorKind === 'anon' ? 'LOGIN_REQUIRED' : 'QUOTA_EXCEEDED';
  const message =
    actorKind === 'anon'
      ? 'Daily token limit reached. Please login to continue.'
      : 'Daily token limit reached.';

  return res.status(429).json({
    success: false,
    error: message,
    errorCode,
    retryAfter: formatRetryTime(retryAfterSeconds),
    retryAfterSeconds, // Keep raw seconds for frontend countdown if needed
  });
}

const DEFAULT_TITLES = [
  'New chat',
  'Quick chat',
  'Hello',
  'Catch up',
  'Small talk',
  'Conversation',
  'Notes',
  'Follow up',
  'Today',
  'Chat',
];

// ✅ Banned words: 10-15 default replies (random selection)
const BANNED_REPLIES = [
  "Sorry, I can't answer this like this. Please try asking in a different way.",
  "I can't respond to that. Could you rephrase your question?",
  "I'm not able to help with that. Please try asking differently.",
  "That's not something I can address. Can you ask in another way?",
  "I can't answer that. Please try a different approach.",
  "Sorry, I can't help with that. Could you rephrase?",
  "I'm unable to respond to that. Please try asking differently.",
  "That's not something I can assist with. Can you reword your question?",
  "I can't provide an answer to that. Please try another way.",
  "Sorry, I can't address that. Could you ask differently?",
  "I'm not able to help with that request. Please try rephrasing.",
  "That's outside what I can help with. Can you ask in a different way?",
  "I can't respond to that. Please try a different question.",
  "Sorry, I can't assist with that. Could you rephrase?",
  "I'm unable to help with that. Please try asking in another way.",
];

// ✅ Banned words: 10-15 default titles (random selection)
const BANNED_TITLES = [
  'Restricted',
  'Blocked content',
  'Cannot process',
  'Invalid request',
  'Content blocked',
  'Restricted message',
  'Cannot answer',
  'Blocked',
  'Invalid',
  'Restricted content',
  'Cannot respond',
  'Blocked request',
  'Content restricted',
  'Cannot process request',
  'Restricted query',
];

async function handleBlockedOrFastPath(params: {
  req: Request;
  res: Response;
  chatId: string;
  actor: { kind: 'user'; userId: string } | { kind: 'anon'; visitorId?: string | null; ip?: string | null };
  chatTable: 'Chat' | 'PublicChat';
  messageTable: 'Message' | 'PublicMessage';
  updatedAtField: 'updatedAt' | 'lastActivity';
  source: 'enhanced_chat' | 'private_chat_send' | 'public_chat';
  // MUST return: title, messageCount, personaData
  selectMetaSql: { sql: string; args: any[] };
}): Promise<boolean> {
  const { req, res, chatId, actor, chatTable, messageTable, updatedAtField } = params;

  const body = req.body || {};
  const message = (body.message ?? body.content) as unknown;

  if (typeof message !== 'string' || !message.trim()) return false;

  const isBanned = checkBlacklist(message);
  const cat = detectFastPathCategory(message);


  if (!isBanned && !cat) return false;

  const now = new Date().toISOString();

  const meta = await db.query(params.selectMetaSql.sql, params.selectMetaSql.args);
  if (!meta.rows?.length) return false;

  const row = meta.rows[0] as any;
  const prevCount = Number(row.messageCount || 0);
  const isFirstMessage = prevCount === 0;
  const existingTitle = (row.title ?? null) as string | null;

  // ✅ FIX: Generate title if first message AND (no title OR title is default "New Chat")
  const isDefaultTitle = existingTitle && (
    existingTitle.trim() === '' ||
    existingTitle.trim().toLowerCase() === 'new chat' ||
    existingTitle.trim().toLowerCase() === 'newchat'
  );
  
  // ✅ Generate title: banned words use BANNED_TITLES, common words use category-specific titles
  let generatedTitle: string | null = null;
  if (isFirstMessage && (!existingTitle || isDefaultTitle)) {
    if (isBanned) {
      // Banned: random from 10-15 titles
      generatedTitle = BANNED_TITLES[Math.floor(Math.random() * BANNED_TITLES.length)];
    } else if (cat) {
      // Common words: category-specific titles (4-5 per category)
      const { getCategoryTitles } = await import('../utils/commonMessageFastPath');
      const categoryTitles = getCategoryTitles(cat);
      generatedTitle = categoryTitles[Math.floor(Math.random() * categoryTitles.length)];
    } else {
      // Fallback: general common titles
      generatedTitle = DEFAULT_TITLES[Math.floor(Math.random() * DEFAULT_TITLES.length)];
    }
  }

 

  const personaData = row.personaData ?? null;

  // ✅ Banned: random from 10-15 replies
  const aiResponse = isBanned 
    ? BANNED_REPLIES[Math.floor(Math.random() * BANNED_REPLIES.length)]
    : fastPathReply(cat!, personaData);

  // Save user + AI messages (counts as 1 turn; we store both rows)
  await db.query(
    `INSERT INTO "${messageTable}" (id, "chatId", content, sender, "createdAt")
     VALUES ($1, $2, $3, 'human', $4::timestamptz)`,
    [generateId.message(), chatId, message, now],
  );

  await db.query(
    `INSERT INTO "${messageTable}" (id, "chatId", content, sender, "createdAt")
     VALUES ($1, $2, $3, 'twin', $4::timestamptz)`,
    [generateId.message(), chatId, aiResponse, now],
  );

  // Update chat meta: messageCount += 1, lastMessage=AI response, title if first
  // ✅ Structure same as Chat table - both have lastMessage now
  await db.query(
    `
    UPDATE "${chatTable}"
    SET "messageCount" = "messageCount" + 1,
        "lastMessage" = $1,
        "${updatedAtField}" = $2::timestamptz,
        "title" = COALESCE($3, "title")
    WHERE id = $4
    `,
    [aiResponse, now, generatedTitle, chatId],
  );

  // Log blocked event only for banned + logged in
  if (isBanned && actor.kind === 'user') {
    EventLogger.logUserEvent(actor.userId, EVENT_TYPES.MESSAGE_BLOCKED, {
      reason: 'restricted_content',
      source: params.source,
      chatId,
      requestId: (req as any).requestId || null,
    }).catch(() => {});
  }

  // ✅ ADD: Log token event with 0 tokens for banned/common words
  if (isBanned || cat) {
    const reason = isBanned ? 'banned' : 'common';
    if (actor.kind === 'user') {
      EventLogger.logUserEvent(actor.userId, EVENT_TYPES.LLM_USAGE, {
        chatId,
        mode: params.source,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        reason: reason
      }).catch(() => {});
    } else if (actor.kind === 'anon') {
      // For anonymous, log with visitorId if available
      EventLogger.log(null, EVENT_TYPES.LLM_USAGE, {
        chatId,
        mode: params.source,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        reason: reason,
        visitorId: actor.visitorId || null
      }).catch(() => {});
    }
  }

  return res.json({
    success: true,
    response: aiResponse,
    blocked: isBanned,
    intent: isBanned ? 'blocked' : 'fast_path',
    tokensUsed: 0,
    generatedTitle,
    isFirstMessage,
    timestamp: now,
    serverTime: now,
  }) as any;
}

/**
 * ✅ Public chat message precheck:
 * - Needs chatToken -> chatId
 * - Needs chat.tokenLimit to compute same reserveTokens as controller
 * - Stops request BEFORE expensive processing
 */
export const checkTokenQuotaForPublicChatMessage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const chatToken = (req.params as any)?.chatToken;
    if (!chatToken) return next();

    const decoded = detokenizeId(chatToken);
    if (!decoded || decoded.type !== 'chat') return next();
    const chatId = decoded.id;

    // minimal lookup: actor identity + tokenLimit (+ for fast-path meta)
    let r;
    try {
      r = await db.query(
        `
        SELECT pc."userId", pc."visitorId", pc."title", pc."messageCount",
               t."tokenLimit", t."personaData"
        FROM "PublicChat" pc
        LEFT JOIN "Twin" t ON pc."twinId" = t.id
        WHERE pc.id = $1
        `,
        [chatId],
      );
    } catch (queryError: any) {
      // Log detailed error for debugging
      logger.error('Public chat precheck query failed:', {
        chatId,
        error: queryError?.message,
        code: queryError?.code,
        detail: queryError?.detail,
        hint: queryError?.hint,
        stack: queryError?.stack?.substring(0, 200)
      });
      // Continue anyway - let controller handle it
      return next();
    }
    if (!r.rows?.length) return next();

    const row = r.rows[0];

    const actor =
      row.userId
        ? ({ kind: 'user' as const, userId: row.userId })
        : ({ kind: 'anon' as const, visitorId: row.visitorId, ip: req.ip || req.socket.remoteAddress || null });

    // ✅ blocked + fast-path BEFORE quota check
    const handled = await handleBlockedOrFastPath({
      req,
      res,
      chatId,
      actor,
      chatTable: 'PublicChat',
      messageTable: 'PublicMessage',
      updatedAtField: 'updatedAt',
      source: 'public_chat',
      selectMetaSql: {
        sql: `
          SELECT pc."title" as "title", pc."messageCount" as "messageCount", t."personaData" as "personaData"
          FROM "PublicChat" pc
          LEFT JOIN "Twin" t ON pc."twinId" = t.id
          WHERE pc.id = $1
        `,
        args: [chatId],
      },
    });
    if (handled) return;

    // quota precheck (only for non-trivial messages)
    const baseTokenLimit = Math.min(row.tokenLimit || 500, 800);
    const reserveTokens = baseTokenLimit + 400;

    const quota = await checkQuotaStatus({ actor, reserveTokens });
    if (quota.exceeded) return quota429(res, actor.kind);

    return next();
  } catch (e: any) {
    // Log detailed error for debugging
    logger.error('Public chat precheck failed:', {
      error: e?.message,
      code: e?.code,
      detail: e?.detail,
      hint: e?.hint,
      stack: e?.stack?.substring(0, 300),
      chatToken: (req.params as any)?.chatToken
    });
    // Continue anyway - let controller handle it
    return next();
  }
};

/**
 * ✅ Private chat (logged-in) message precheck:
 * - Needs chatToken -> chatId
 * - Needs chat.tokenLimit to compute same reserveTokens as controller (private uses +600 in your code)
 */
export const checkTokenQuotaForPrivateChatMessage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return next();

    const chatToken = (req.params as any)?.chatToken;
    if (!chatToken) return next();

    const decoded = detokenizeId(chatToken);
    if (!decoded || decoded.type !== 'chat') return next();
    const chatId = decoded.id;

    // ✅ blocked + fast-path BEFORE quota check
    const handled = await handleBlockedOrFastPath({
      req,
      res,
      chatId,
      actor: { kind: 'user', userId },
      chatTable: 'Chat',
      messageTable: 'Message',
      updatedAtField: 'updatedAt',
      source: 'private_chat_send',
      selectMetaSql: {
        sql: `
          SELECT c."title" as "title", c."messageCount" as "messageCount", t."personaData" as "personaData"
          FROM "Chat" c
          JOIN "Twin" t ON c."twinId" = t.id
          WHERE c.id = $1 AND c."userId" = $2
        `,
        args: [chatId, userId],
      },
    });
    if (handled) return;

    const r = await db.query(
      `
      SELECT c."userId", t."tokenLimit"
      FROM "Chat" c
      JOIN "Twin" t ON c."twinId" = t.id
      WHERE c.id = $1 AND c."userId" = $2
      `,
      [chatId, userId],
    );
    if (!r.rows?.length) return next();

    const tokenLimit = r.rows[0].tokenLimit;
    const actor = { kind: 'user' as const, userId };

    const baseTokenLimit = Math.min(tokenLimit || 500, 800);
    const reserveTokens = baseTokenLimit + 600;

    const quota = await checkQuotaStatus({ actor, reserveTokens });
    if (quota.exceeded) return quota429(res, 'user');

    return next();
  } catch (e) {
    logger.error('Private chat precheck failed:', e);
    return next();
  }
};

/**
 * ✅ Enhanced chat (logged-in) precheck:
 * - Same idea, use chat.tokenLimit and match controller reservation (+600)
 */
export const checkTokenQuotaForEnhancedChat = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return next();

    const chatToken = (req.params as any)?.chatToken;
    if (!chatToken) return next();

    const decoded = detokenizeId(chatToken);
    if (!decoded || decoded.type !== 'chat') return next();
    const chatId = decoded.id;

    // ✅ P0: blocked + fast-path BEFORE quota check
    const handled = await handleBlockedOrFastPath({
      req,
      res,
      chatId,
      actor: { kind: 'user', userId },
      chatTable: 'Chat',
      messageTable: 'Message',
      updatedAtField: 'updatedAt',
      source: 'enhanced_chat',
      selectMetaSql: {
        sql: `
          SELECT c."title" as "title", c."messageCount" as "messageCount", t."personaData" as "personaData"
          FROM "Chat" c
          JOIN "Twin" t ON c."twinId" = t.id
          WHERE c.id = $1 AND c."userId" = $2
        `,
        args: [chatId, userId],
      },
    });
    if (handled) return;

    // quota precheck (only for non-trivial messages)
    const r = await db.query(
      `
      SELECT c."userId", t."tokenLimit"
      FROM "Chat" c
      JOIN "Twin" t ON c."twinId" = t.id
      WHERE c.id = $1 AND c."userId" = $2
      `,
      [chatId, userId],
    );
    if (!r.rows?.length) return next();

    const tokenLimit = r.rows[0].tokenLimit;
    const actor = { kind: 'user' as const, userId };

    const baseTokenLimit = Math.min(tokenLimit || 500, 800);
    const reserveTokens = baseTokenLimit + 600;

    const quota = await checkQuotaStatus({ actor, reserveTokens });
    if (quota.exceeded) return quota429(res, 'user');

    return next();
  } catch (e) {
    logger.error('Enhanced chat precheck failed:', e);
    return next();
  }
};

