import { logger } from '../config/logger';
import { generateId } from '../utils/idGenerator';
import { db } from '../config/database';
import { EVENT_TYPES } from '../config/constants';
import { tokenizeId } from '../utils/idTokenization';
import { capturePostHogEvent } from './posthogService';
import { isDev } from '../config/env';

// Standard event meta schema
export interface StandardEventMeta {
  // IDs (always use public/tokenized IDs for external tools)
  publicUserId?: string;
  publicTwinId?: string;
  publicChatId?: string;
  
  // Source tracking
  source?: 'landing' | 'referral' | 'public_profile' | 'dashboard' | 'discover' | 'direct';
  
  // Context
  wv?: string; // view/page identifier
  deviceType?: 'web' | 'mobile';
  country?: string;
  
  // Event-specific data (keep minimal, no PII)
  [key: string]: any;
}

export interface EventLogData {
  userId?: string | null;
  type: string;
  meta?: StandardEventMeta;
}

/**
 * Event Logger Service - Enhanced for Phase 4
 * Logs user actions and system events for analytics and debugging
 * 
 * Phase 4 enhancements:
 * - Standardized meta schema
 * - Automatic public ID tokenization
 * - Ready for PostHog integration (async forwarding)
 */
export class EventLogger {
  /**
   * Log an event to the database with standardized meta
   * @param userId - User ID (optional for system events)
   * @param type - Event type (use EVENT_TYPES constants)
   * @param meta - Additional metadata (StandardEventMeta format)
   */
  static async log(userId: string | null, type: string, meta?: StandardEventMeta): Promise<void> {
    try {
      const utcTimestamp = new Date().toISOString();
      
      // Enhance meta with public IDs if userId provided
      let enhancedMeta: StandardEventMeta = { ...meta };
      if (userId) {
        enhancedMeta.publicUserId = tokenizeId(userId, 'user');
      }
      
      // Tokenize other IDs if present in meta
      if (meta?.publicTwinId && !meta.publicTwinId.startsWith('twin_')) {
        enhancedMeta.publicTwinId = tokenizeId(meta.publicTwinId, 'twin');
      }
      if (meta?.publicChatId && !meta.publicChatId.startsWith('chat_')) {
        enhancedMeta.publicChatId = tokenizeId(meta.publicChatId, 'chat');
      }
      
      await db.query(`
        INSERT INTO "Event" ("id", "userId", "type", "meta", "createdAt")
        VALUES ($1, $2, $3, $4, $5::timestamptz)
      `, [
        generateId.event(),
        userId || null,
        type,
        JSON.stringify(enhancedMeta || {}),
        utcTimestamp
      ]);
      
      // Log to console in development
      if (isDev) {
        logger.info(`Event logged: ${type}`, { userId, meta: enhancedMeta });
      }
      
      // ✅ Phase 4C: Async forward to PostHog (fire-and-forget)
      capturePostHogEvent(userId, type, enhancedMeta);
      
    } catch (error) {
      // Don't throw errors for logging failures
      logger.error('Event logging failed:', error);
    }
  }

  /**
   * Log user-specific events (convenience method)
   */
  static async logUserEvent(userId: string, type: string, meta?: StandardEventMeta): Promise<void> {
    return this.log(userId, type, meta);
  }

  /**
   * Log system events (no user)
   */
  static async logSystemEvent(type: string, meta?: StandardEventMeta): Promise<void> {
    return this.log(null, type, meta);
  }

  // ========== Helper methods for common event patterns ==========
  
  /**
   * Log signup event
   */
  static async logSignup(userId: string, meta?: { source?: string; referralCode?: string }): Promise<void> {
    return this.log(userId, EVENT_TYPES.SIGNUP, {
      source: meta?.source as any,
      ...meta
    });
  }

  /**
   * Log login event
   */
  static async logLogin(userId: string, meta?: { source?: string }): Promise<void> {
    return this.log(userId, EVENT_TYPES.LOGIN, {
      source: meta?.source as any,
      ...meta
    });
  }

  /**
   * Log twin creation event
   */
  static async logTwinCreated(userId: string, twinId: string, meta?: { samplesCount?: number }): Promise<void> {
    return this.log(userId, EVENT_TYPES.TWIN_CREATED, {
      publicTwinId: twinId, // Will be tokenized automatically
      ...meta
    });
  }

  /**
   * Log chat started event
   */
  static async logChatStarted(userId: string, chatId: string, twinId?: string, meta?: { source?: string }): Promise<void> {
    return this.log(userId, EVENT_TYPES.CHAT_STARTED, {
      publicChatId: chatId, // Will be tokenized automatically
      publicTwinId: twinId, // Will be tokenized automatically
      source: meta?.source as any,
      ...meta
    });
  }

  /**
   * Log message approved event
   */
  static async logMessageApproved(userId: string, chatId: string, meta?: { messageLength?: number }): Promise<void> {
    return this.log(userId, EVENT_TYPES.MESSAGE_APPROVED, {
      publicChatId: chatId,
      ...meta
    });
  }

  /**
   * Log profile shared event
   */
  static async logProfileShared(userId: string, twinId: string, meta?: { shareMethod?: string }): Promise<void> {
    return this.log(userId, EVENT_TYPES.TWIN_SHARED, {
      twinId, //Internal ID for DB queries
      publicTwinId: tokenizeId(twinId, 'twin'),
      ...meta
    });
  }

  /**
   * Log invite sent event
   */
  static async logInviteSent(userId: string, inviteCode: string, meta?: { method?: string }): Promise<void> {
    return this.log(userId, EVENT_TYPES.INVITE_SENT, {
      inviteCode,
      ...meta
    });
  }

  /**
   * Log invite accepted event
   */
  static async logInviteAccepted(userId: string, inviteCode: string, inviterId?: string): Promise<void> {
    return this.log(userId, EVENT_TYPES.INVITE_ACCEPTED, {
      inviteCode,
      inviterPublicId: inviterId ? tokenizeId(inviterId, 'user') : undefined
    });
  }

  /**
   * Get events for a specific user
   */
  static async getUserEvents(userId: string, limit: number = 50): Promise<any[]> {
    try {
      const { db } = await import('../config/database');
      
      const result = await db.query(`
        SELECT id, "userId", type, meta, "createdAt"
        FROM "Event"
        WHERE "userId" = $1
        ORDER BY "createdAt" DESC
        LIMIT $2
      `, [userId, limit]);
      
      return result.rows;
    } catch (error) {
      logger.error('Failed to get user events:', error);
      return [];
    }
  }

  /**
   * Get events by type
   */
  static async getEventsByType(type: string, limit: number = 100): Promise<any[]> {
    try {
      const { db } = await import('../config/database');
      
      const result = await db.query(`
        SELECT id, "userId", type, meta, "createdAt"
        FROM "Event"
        WHERE type = $1
        ORDER BY "createdAt" DESC
        LIMIT $2
      `, [type, limit]);
      
      return result.rows;
    } catch (error) {
      logger.error('Failed to get events by type:', error);
      return [];
    }
  }
}

// Convenience exports
export const logEvent = EventLogger.log;
export const logUserEvent = EventLogger.logUserEvent;
export const logSystemEvent = EventLogger.logSystemEvent;
