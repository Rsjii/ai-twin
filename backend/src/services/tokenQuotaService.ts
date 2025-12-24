import crypto from 'crypto';
import { db } from '../config/database';
import { generateId } from '../utils/idGenerator';
import { TOKEN_QUOTAS } from '../config/constants';

type Actor =
  | { kind: 'user'; userId: string }
  | { kind: 'anon'; visitorId?: string | null; ip?: string | null };

export class TokenQuotaError extends Error {
  statusCode: number;
  errorCode: string;
  retryAfterSeconds: number;

  constructor(message: string, opts: { statusCode: number; errorCode: string; retryAfterSeconds: number }) {
    super(message);
    this.statusCode = opts.statusCode;
    this.errorCode = opts.errorCode;
    this.retryAfterSeconds = opts.retryAfterSeconds;
  }
}

function utcDay(d = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`; // YYYY-MM-DD
}

export function secondsUntilNextUtcMidnight(d = new Date()): number {
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0));
  return Math.max(1, Math.floor((next.getTime() - d.getTime()) / 1000));
}

function hashIp(ip?: string | null): string {
  const secret = process.env.IP_HASH_SECRET || 'dev_ip_hash_secret_change_me';
  const raw = (ip || 'unknown').trim();
  return crypto.createHmac('sha256', secret).update(raw).digest('hex').slice(0, 32);
}

export async function reserveDailyTokens(params: {
  actor: Actor;
  reserveTokens: number;
}): Promise<{ day: string; actorKey: string; reserved: number }> {
  const day = utcDay();
  const reserve = Math.max(0, Math.floor(params.reserveTokens));

  console.log('[TOKEN_QUOTA] [RESERVE] Starting reservation:', {
    actorKind: params.actor.kind,
    reserveTokens: reserve,
    day
  });

  if (reserve <= 0) {
    console.log('[TOKEN_QUOTA] [RESERVE] Reserve <= 0, skipping');
    return { day, actorKey: 'noop', reserved: 0 };
  }

  const now = new Date();
  const retryAfterSeconds = secondsUntilNextUtcMidnight(now);

  let actorKey = '';
  let actorType: 'user' | 'anon' = 'anon';
  let userId: string | null = null;
  let visitorId: string | null = null;
  let ipHash: string | null = null;

  if (params.actor.kind === 'user') {
    actorType = 'user';
    userId = params.actor.userId;
    actorKey = `user:${userId}`;
  } else {
    actorType = 'anon';
    visitorId = params.actor.visitorId || null;
    ipHash = hashIp(params.actor.ip);
    // ✅ FIX: Use IP-only for anonymous users (not IP + visitorId)
    // This ensures same IP cannot bypass limits by changing visitorId
    actorKey = `anon:${ipHash}`; // Changed from: `anon:${ipHash}:${visitorId || 'no_visitor'}`
  }

  const limit = actorType === 'user' ? TOKEN_QUOTAS.USER_DAILY_TOKENS : TOKEN_QUOTAS.ANON_DAILY_TOKENS;
  
  console.log('[TOKEN_QUOTA] [RESERVE] Actor details:', {
    actorType,
    actorKey,
    limit,
    reserve
  });

  await db.query('BEGIN');
  try {
    // Upsert row if missing
    await db.query(
      `
      INSERT INTO "TokenUsageDaily" (id, day, "actorKey", "actorType", "userId", "visitorId", "ipHash", "tokensUsed", "updatedAt")
      VALUES ($1, $2::date, $3, $4, $5, $6, $7, 0, NOW())
      ON CONFLICT (day, "actorKey") DO NOTHING
      `,
      [generateId.event(), day, actorKey, actorType, userId, visitorId, ipHash],
    );

    // Lock row
    const row = await db.query(
      `SELECT "tokensUsed" FROM "TokenUsageDaily" WHERE day = $1::date AND "actorKey" = $2 FOR UPDATE`,
      [day, actorKey],
    );

    const used = Number(row.rows?.[0]?.tokensUsed || 0);
    console.log('[TOKEN_QUOTA] [RESERVE] Current usage:', {
      used,
      reserve,
      total: used + reserve,
      limit
    });
    
    if (used + reserve > limit) {
      console.log('[TOKEN_QUOTA] [RESERVE] ❌ QUOTA EXCEEDED:', {
        used,
        reserve,
        total: used + reserve,
        limit,
        actorType
      });
      throw new TokenQuotaError(
        actorType === 'anon'
          ? 'Daily token limit reached. Please login to continue.'
          : 'Daily token limit reached. Please try again tomorrow.',
        {
          statusCode: 429,
          errorCode: actorType === 'anon' ? 'LOGIN_REQUIRED' : 'QUOTA_EXCEEDED',
          retryAfterSeconds,
        },
      );
    }

    // Reserve
    await db.query(
      `UPDATE "TokenUsageDaily" SET "tokensUsed" = "tokensUsed" + $1, "updatedAt" = NOW() WHERE day = $2::date AND "actorKey" = $3`,
      [reserve, day, actorKey],
    );

    await db.query('COMMIT');
    console.log('[TOKEN_QUOTA] [RESERVE] ✅ Reservation successful:', {
      day,
      actorKey,
      reserved: reserve,
      newTotal: used + reserve
    });
    return { day, actorKey, reserved: reserve };
  } catch (e) {
    await db.query('ROLLBACK');
    throw e;
  }
}

export async function reconcileDailyTokens(params: {
  day: string;
  actorKey: string;
  reserved: number;
  actualTokensUsed: number;
}): Promise<void> {
  if (!params.actorKey || params.actorKey === 'noop') {
    console.log('[TOKEN_QUOTA] [RECONCILE] Skipping (noop)');
    return;
  }

  const delta = Math.floor(params.actualTokensUsed) - Math.floor(params.reserved);
  console.log('[TOKEN_QUOTA] [RECONCILE] Reconciliation:', {
    day: params.day,
    actorKey: params.actorKey,
    reserved: params.reserved,
    actualTokensUsed: params.actualTokensUsed,
    delta
  });

  if (delta === 0) {
    console.log('[TOKEN_QUOTA] [RECONCILE] No adjustment needed (delta = 0)');
    // Still log total usage even if delta is 0
    const currentResult = await db.query(
      `SELECT "tokensUsed" FROM "TokenUsageDaily" WHERE day = $1::date AND "actorKey" = $2`,
      [params.day, params.actorKey]
    );
    const currentTotal = currentResult.rows?.[0]?.tokensUsed || 0;
    console.log('[TOKEN_USAGE] [DAILY_TOTAL] Current daily usage:', {
      actorKey: params.actorKey,
      totalUsed: currentTotal,
      thisMessage: params.actualTokensUsed,
      delta: 0
    });
    return;
  }

  // delta can be negative if our reserve was higher than actual; that's fine.
  await db.query(
    `UPDATE "TokenUsageDaily" SET "tokensUsed" = GREATEST(0, "tokensUsed" + $1), "updatedAt" = NOW()
     WHERE day = $2::date AND "actorKey" = $3`,
    [delta, params.day, params.actorKey],
  );
  
  // Get updated total after reconciliation
  const updatedResult = await db.query(
    `SELECT "tokensUsed" FROM "TokenUsageDaily" WHERE day = $1::date AND "actorKey" = $2`,
    [params.day, params.actorKey]
  );
  const updatedTotal = updatedResult.rows?.[0]?.tokensUsed || 0;
  
  console.log('[TOKEN_QUOTA] [RECONCILE] ✅ Reconciliation complete:', {
    day: params.day,
    actorKey: params.actorKey,
    reserved: params.reserved,
    actualTokensUsed: params.actualTokensUsed,
    delta,
    updatedTotal: updatedTotal
  });
  
  // ✅ Log total daily usage summary
  console.log('[TOKEN_USAGE] [DAILY_TOTAL] Current daily usage:', {
    actorKey: params.actorKey,
    totalUsed: updatedTotal,
    thisMessage: params.actualTokensUsed,
    delta: delta
  });
}

/**
 * Check if quota is exceeded for an actor (read-only, no transaction)
 * Used for pre-checking quota status before rendering pages
 * 
 * @param reserveTokens - Optional: if provided, checks if (used + reserveTokens) > limit
 *                        This matches the behavior of reserveDailyTokens for accurate pre-checking
 */
export async function checkQuotaStatus(params: {
  actor: Actor;
  reserveTokens?: number; // ✅ optional: precheck for a planned reservation
}): Promise<{ exceeded: boolean; used: number; limit: number; reserveTokens: number }> {
  const day = utcDay();
  
  let actorKey = '';
  let actorType: 'user' | 'anon' = 'anon';
  
  if (params.actor.kind === 'user') {
    actorType = 'user';
    actorKey = `user:${params.actor.userId}`;
  } else {
    const ipHash = hashIp(params.actor.ip);
    actorKey = `anon:${ipHash}`;
  }

  const limit = actorType === 'user' ? TOKEN_QUOTAS.USER_DAILY_TOKENS : TOKEN_QUOTAS.ANON_DAILY_TOKENS;
  
  // Read current usage (no lock, no transaction - just a snapshot)
  const row = await db.query(
    `SELECT "tokensUsed" FROM "TokenUsageDaily" WHERE day = $1::date AND "actorKey" = $2`,
    [day, actorKey],
  );

  const used = Number(row.rows?.[0]?.tokensUsed || 0);
  const reserveTokens = Math.max(0, Math.floor(params.reserveTokens || 0));

  // ✅ If reserveTokens provided, check used + reserve against limit (matches reserveDailyTokens behavior)
  const exceeded = reserveTokens > 0 ? (used + reserveTokens > limit) : (used >= limit);

  console.log('[TOKEN_QUOTA] [CHECK] Quota status:', {
    actorType,
    actorKey,
    used,
    reserveTokens,
    totalIfReserved: used + reserveTokens,
    limit,
    exceeded
  });

  return { exceeded, used, limit, reserveTokens };
}

