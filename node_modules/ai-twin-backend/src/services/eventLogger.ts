import { prisma } from '../config/prisma';
import { logger } from '../config/logger';

export interface EventLogData {
  userId?: string | null;
  type: string;
  meta?: any;
}

/**
 * Event Logger Service
 * Logs user actions and system events for analytics and debugging
 */
export class EventLogger {
  /**
   * Log an event to the database
   * @param userId - User ID (optional for system events)
   * @param type - Event type (e.g., 'twin_created', 'chat_started', 'draft_generated')
   * @param meta - Additional metadata about the event
   */
  static async log(userId: string | null, type: string, meta?: any): Promise<void> {
    try {
      await prisma.event.create({
        data: {
          userId: userId || null,
          type,
          meta: meta || {},
        },
      });
      
      // Log to console in development
      if (process.env['NODE_ENV'] === 'development') {
        logger.info(`Event logged: ${type}`, { userId, meta });
      }
    } catch (error) {
      // Don't throw errors for logging failures
      logger.error('Event logging failed:', error);
    }
  }

  /**
   * Log user-specific events
   */
  static async logUserEvent(userId: string, type: string, meta?: any): Promise<void> {
    return this.log(userId, type, meta);
  }

  /**
   * Log system events (no user)
   */
  static async logSystemEvent(type: string, meta?: any): Promise<void> {
    return this.log(null, type, meta);
  }

  /**
   * Get events for a specific user
   */
  static async getUserEvents(userId: string, limit: number = 50): Promise<any[]> {
    try {
      return await prisma.event.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
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
      return await prisma.event.findMany({
        where: { type },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
    } catch (error) {
      logger.error('Failed to get events by type:', error);
      return [];
    }
  }
}

// Convenience function for direct usage
export const logEvent = EventLogger.log;
export const logUserEvent = EventLogger.logUserEvent;
export const logSystemEvent = EventLogger.logSystemEvent;
