"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.logSystemEvent = exports.logUserEvent = exports.logEvent = exports.EventLogger = void 0;
const logger_1 = require("../config/logger");
class EventLogger {
    static async log(userId, type, meta) {
        try {
            const { db } = await Promise.resolve().then(() => __importStar(require('../config/database')));
            await db.query(`
        INSERT INTO "Event" ("id", "userId", "type", "meta", "createdAt")
        VALUES ($1, $2, $3, $4, NOW())
      `, [
                `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                userId || null,
                type,
                JSON.stringify(meta || {})
            ]);
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
            const { db } = await Promise.resolve().then(() => __importStar(require('../config/database')));
            const result = await db.query(`
      SELECT id, "userId", type, meta, "createdAt"
      FROM "Event"
      WHERE "userId" = $1
      ORDER BY "createdAt" DESC
      LIMIT $2
    `, [userId, limit]);
            return result.rows;
        }
        catch (error) {
            logger_1.logger.error('Failed to get user events:', error);
            return [];
        }
    }
    static async getEventsByType(type, limit = 100) {
        try {
            const { db } = await Promise.resolve().then(() => __importStar(require('../config/database')));
            const result = await db.query(`
        SELECT id, "userId", type, meta, "createdAt"
        FROM "Event"
        WHERE type = $1
        ORDER BY "createdAt" DESC
        LIMIT $2
      `, [type, limit]);
            return result.rows;
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