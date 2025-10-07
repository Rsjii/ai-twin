"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logSystemEvent = exports.logUserEvent = exports.logEvent = exports.EventLogger = void 0;
const prisma_1 = require("../config/prisma");
const logger_1 = require("../config/logger");
class EventLogger {
    static async log(userId, type, meta) {
        try {
            await prisma_1.prisma.event.create({
                data: {
                    userId: userId || null,
                    type,
                    meta: meta || {},
                },
            });
            if (process.env['NODE_ENV'] === 'development') {
                logger_1.logger.info(`Event logged: ${type}`, { userId, meta });
            }
        }
        catch (error) {
            logger_1.logger.error('Event logging failed:', error);
        }
    }
    static async logUserEvent(userId, type, meta) {
        return this.log(userId, type, meta);
    }
    static async logSystemEvent(type, meta) {
        return this.log(null, type, meta);
    }
    static async getUserEvents(userId, limit = 50) {
        try {
            return await prisma_1.prisma.event.findMany({
                where: { userId },
                orderBy: { createdAt: 'desc' },
                take: limit,
            });
        }
        catch (error) {
            logger_1.logger.error('Failed to get user events:', error);
            return [];
        }
    }
    static async getEventsByType(type, limit = 100) {
        try {
            return await prisma_1.prisma.event.findMany({
                where: { type },
                orderBy: { createdAt: 'desc' },
                take: limit,
            });
        }
        catch (error) {
            logger_1.logger.error('Failed to get events by type:', error);
            return [];
        }
    }
}
exports.EventLogger = EventLogger;
exports.logEvent = EventLogger.log;
exports.logUserEvent = EventLogger.logUserEvent;
exports.logSystemEvent = EventLogger.logSystemEvent;
//# sourceMappingURL=eventLogger.js.map