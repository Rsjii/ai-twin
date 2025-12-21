import { Request, Response, NextFunction } from 'express';
import { db } from '../config/database';
import { checkQuotaStatus, secondsUntilNextUtcMidnight } from '../services/tokenQuotaService';
import { detokenizeId } from '../utils/idTokenization';

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
        : 'Daily token limit reached. Please try again tomorrow.';

      console.log('[TOKEN_QUOTA_MIDDLEWARE] ❌ QUOTA EXCEEDED - Blocking request:', {
        actorType: actor.kind,
        used: quotaStatus.used,
        limit: quotaStatus.limit,
        ip: actor.kind === 'anon' ? req.ip : undefined
      });

      return res.status(429).json({
        success: false,
        error: message,
        errorCode,
        retryAfter: `${retryAfterSeconds}s`,
      });
    }

    // Quota OK, continue to next middleware/handler
    next();
  } catch (error) {
    console.error('[TOKEN_QUOTA_MIDDLEWARE] Error checking quota:', error);
    // On error, allow request to proceed (fail open, but log error)
    // You can change this to fail closed if preferred
    next();
  }
};

// Helper function to return 429 response
function quota429(res: Response, actorKind: 'anon' | 'user') {
  const retryAfterSeconds = secondsUntilNextUtcMidnight();
  const errorCode = actorKind === 'anon' ? 'LOGIN_REQUIRED' : 'QUOTA_EXCEEDED';
  const message =
    actorKind === 'anon'
      ? 'Daily token limit reached. Please login to continue.'
      : 'Daily token limit reached. Please try again tomorrow.';

  return res.status(429).json({
    success: false,
    error: message,
    errorCode,
    retryAfter: `${retryAfterSeconds}s`,
  });
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
    if (!chatToken) return next(); // let controller handle missing token

    const decoded = detokenizeId(chatToken);
    if (!decoded || decoded.type !== 'chat') return next(); // let controller handle invalid token

    const chatId = decoded.id;

    // minimal lookup: actor identity + tokenLimit
    const r = await db.query(
      `
      SELECT pc."userId", pc."visitorId", t."tokenLimit"
      FROM "PublicChat" pc
      LEFT JOIN "Twin" t ON pc."twinId" = t.id
      WHERE pc.id = $1
      `,
      [chatId],
    );

    if (!r.rows?.length) return next(); // controller will 404

    const row = r.rows[0];
    const actor =
      row.userId
        ? ({ kind: 'user' as const, userId: row.userId })
        : ({ kind: 'anon' as const, visitorId: row.visitorId, ip: req.ip || req.socket.remoteAddress || null });

    // must match publicChatController reservation logic:
    const baseTokenLimit = Math.min(row.tokenLimit || 500, 800);
    const reserveTokens = baseTokenLimit + 400;

    const quota = await checkQuotaStatus({ actor, reserveTokens });

    if (quota.exceeded) {
      console.log('[TOKEN_QUOTA_MIDDLEWARE] ❌ QUOTA EXCEEDED - Blocking public chat message:', {
        actorType: actor.kind,
        used: quota.used,
        reserveTokens: quota.reserveTokens,
        totalIfReserved: quota.used + quota.reserveTokens,
        limit: quota.limit,
        ip: actor.kind === 'anon' ? req.ip : undefined
      });
      return quota429(res, actor.kind);
    }

    return next();
  } catch (e) {
    console.error('[TOKEN_QUOTA_MIDDLEWARE] Public chat precheck failed:', e);
    return next(); // fail-open (your choice)
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
    if (!userId) return next(); // requireJWT already enforces, but keep safe

    const chatToken = (req.params as any)?.chatToken;
    if (!chatToken) return next();

    const decoded = detokenizeId(chatToken);
    if (!decoded || decoded.type !== 'chat') return next();

    const chatId = decoded.id;

    const r = await db.query(
      `
      SELECT c."userId", t."tokenLimit"
      FROM "Chat" c
      JOIN "Twin" t ON c."twinId" = t.id
      WHERE c.id = $1 AND c."userId" = $2
      `,
      [chatId, userId],
    );
    if (!r.rows?.length) return next(); // controller handles create/not found path

    const tokenLimit = r.rows[0].tokenLimit;
    const actor = { kind: 'user' as const, userId };

    // must match privateChatController reservation logic (it uses base + 600)
    const baseTokenLimit = Math.min(tokenLimit || 500, 800);
    const reserveTokens = baseTokenLimit + 600;

    const quota = await checkQuotaStatus({ actor, reserveTokens });
    if (quota.exceeded) {
      console.log('[TOKEN_QUOTA_MIDDLEWARE] ❌ QUOTA EXCEEDED - Blocking private chat message:', {
        actorType: actor.kind,
        userId,
        used: quota.used,
        reserveTokens: quota.reserveTokens,
        totalIfReserved: quota.used + quota.reserveTokens,
        limit: quota.limit
      });
      return quota429(res, 'user');
    }

    return next();
  } catch (e) {
    console.error('[TOKEN_QUOTA_MIDDLEWARE] Private chat precheck failed:', e);
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
    if (quota.exceeded) {
      console.log('[TOKEN_QUOTA_MIDDLEWARE] ❌ QUOTA EXCEEDED - Blocking enhanced chat:', {
        actorType: actor.kind,
        userId,
        used: quota.used,
        reserveTokens: quota.reserveTokens,
        totalIfReserved: quota.used + quota.reserveTokens,
        limit: quota.limit
      });
      return quota429(res, 'user');
    }

    return next();
  } catch (e) {
    console.error('[TOKEN_QUOTA_MIDDLEWARE] Enhanced chat precheck failed:', e);
    return next();
  }
};

