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
exports.ingestMemories = exports.retrieveMemories = exports.getMemoryStats = void 0;
const database_1 = require("../../config/database");
const logger_1 = require("../../config/logger");
const errors_1 = require("../../utils/errors");
const twinUtils_1 = require("../../utils/twinUtils");
const idGenerator_1 = require("../../utils/idGenerator");
const errorHandler_1 = require("../../utils/errorHandler");
const getMemoryStats = async (req, res, next) => {
    try {
        const { id: twinId } = req.params;
        const userId = req.user?.id || req.userId;
        console.log('[MEMORY_STATS:START]', {
            twinId,
            userId,
            path: req.path,
            method: req.method,
        });
        if (!userId) {
            throw errors_1.createError.unauthorized();
        }
        await (0, twinUtils_1.verifyTwinOwnership)(twinId, userId);
        const longTermResult = await database_1.db.query(`
      SELECT 
        category,
        COUNT(*) as count
      FROM "MemoryLongTerm"
      WHERE "twinId" = $1
      GROUP BY category
    `, [twinId]);
        const anchorsResult = await database_1.db.query(`
      SELECT 
        type,
        COUNT(*) as count
      FROM "style_anchors"
      WHERE twin_id = $1
      GROUP BY type
    `, [twinId]);
        console.log('[MEMORY_STATS] Query results:', {
            longTermRows: longTermResult.rows.length,
            anchorsRows: anchorsResult.rows.length,
            longTermData: longTermResult.rows,
            anchorsData: anchorsResult.rows,
        });
        const totalMemories = longTermResult.rows.reduce((sum, row) => sum + parseInt(row.count), 0);
        const totalAnchors = anchorsResult.rows.reduce((sum, row) => sum + parseInt(row.count), 0);
        const stats = [
            ...longTermResult.rows.map(row => ({
                bucket: row.category === 'fact' ? 'facts' : row.category,
                count: parseInt(row.count)
            })),
            ...anchorsResult.rows.map(row => ({
                bucket: row.type === 'phrase' ? 'voice' : row.type,
                count: parseInt(row.count)
            }))
        ];
        console.log('[MEMORY_STATS] Final response:', {
            success: true,
            total: totalMemories + totalAnchors,
            totalMemories,
            totalAnchors,
            statsCount: stats.length,
            stats,
        });
        res.set({
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0, private',
            'Pragma': 'no-cache',
            'Expires': '0',
        });
        res.json({
            success: true,
            total: totalMemories + totalAnchors,
            stats
        });
    }
    catch (error) {
        (0, errorHandler_1.handleControllerError)(error, 'Failed to get memory statistics');
    }
};
exports.getMemoryStats = getMemoryStats;
const retrieveMemories = async (req, res, next) => {
    try {
        const { id: twinId } = req.params;
        const { bucket, limit = 10, offset = 0 } = req.query;
        const userId = req.user?.id || req.userId;
        if (!userId) {
            throw errors_1.createError.unauthorized();
        }
        await (0, twinUtils_1.verifyTwinOwnership)(twinId, userId);
        if (bucket === 'facts') {
            const longTermResult = await database_1.db.query(`
        SELECT key, value, category, "createdAt", "updatedAt"
        FROM "MemoryLongTerm"
        WHERE "twinId" = $1 AND category = 'fact'
        ORDER BY "updatedAt" DESC
        LIMIT $2 OFFSET $3
      `, [twinId, parseInt(limit), parseInt(offset)]);
            res.json({
                success: true,
                memories: longTermResult.rows.map(row => ({
                    id: row.key,
                    text: row.value,
                    bucket: 'facts',
                    createdAt: row.createdAt,
                    updatedAt: row.updatedAt
                }))
            });
        }
        else if (bucket === 'voice') {
            const phrasesResult = await database_1.db.query(`
        SELECT id, phrase, user_utterance, ideal_reply, tags, created_at
        FROM "style_anchors"
        WHERE twin_id = $1 AND type = 'phrase'
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3
      `, [twinId, parseInt(limit), parseInt(offset)]);
            res.json({
                success: true,
                memories: phrasesResult.rows.map(row => ({
                    id: row.id,
                    text: row.phrase || row.user_utterance,
                    bucket: 'voice',
                    createdAt: row.created_at
                }))
            });
        }
        else if (bucket === 'all') {
            const [longTermResult, phrasesResult] = await Promise.all([
                database_1.db.query(`
          SELECT key, value, category, "createdAt", "updatedAt"
          FROM "MemoryLongTerm"
          WHERE "twinId" = $1
          ORDER BY "updatedAt" DESC
          LIMIT $2 OFFSET $3
        `, [twinId, parseInt(limit), parseInt(offset)]),
                database_1.db.query(`
          SELECT id, phrase, user_utterance, ideal_reply, tags, created_at
          FROM "style_anchors"
          WHERE twin_id = $1 AND type = 'phrase'
          ORDER BY created_at DESC
          LIMIT $2 OFFSET $3
        `, [twinId, parseInt(limit), parseInt(offset)])
            ]);
            res.json({
                success: true,
                memories: [
                    ...longTermResult.rows.map(row => ({
                        id: row.key,
                        text: row.value,
                        bucket: 'facts',
                        createdAt: row.createdAt
                    })),
                    ...phrasesResult.rows.map(row => ({
                        id: row.id,
                        text: row.phrase || row.user_utterance,
                        bucket: 'voice',
                        createdAt: row.created_at
                    }))
                ]
            });
        }
        else {
            throw errors_1.createError.validation('Invalid bucket. Use "facts", "voice", or "all"');
        }
    }
    catch (error) {
        (0, errorHandler_1.handleControllerError)(error, 'Failed to retrieve memories');
    }
};
exports.retrieveMemories = retrieveMemories;
const ingestMemories = async (req, res, next) => {
    try {
        const { id: twinId } = req.params;
        const { bucket, text } = req.body;
        const userId = req.user?.id || req.userId;
        logger_1.logger.warn('⚠️ DEPRECATED: ingestMemories endpoint called. Consider using unified endpoints.');
        if (!userId) {
            throw errors_1.createError.unauthorized();
        }
        await (0, twinUtils_1.verifyTwinOwnership)(twinId, userId);
        if (!bucket || !text) {
            throw errors_1.createError.validation('Bucket and text are required', {
                deprecated: true,
                message: 'This endpoint is deprecated. Use /api/twin/:id/long-term-memory for facts or /api/twin/:id/style-anchors for voice patterns.'
            });
        }
        if (!['facts', 'voice'].includes(bucket)) {
            throw errors_1.createError.validation('Invalid bucket. Use "facts" or "voice".', {
                deprecated: true,
                message: 'This endpoint is deprecated. Use /api/twin/:id/long-term-memory for facts or /api/twin/:id/style-anchors for voice patterns.'
            });
        }
        if (bucket === 'facts') {
            const { addLongTermMemory } = await Promise.resolve().then(() => __importStar(require('../twin/longTermMemoryController')));
            req.params.id = twinId;
            req.body.key = idGenerator_1.generateId.fact();
            req.body.category = 'fact';
            req.body.value = text;
            return addLongTermMemory(req, res);
        }
        else if (bucket === 'voice') {
            const { addTwinAnchor } = await Promise.resolve().then(() => __importStar(require('../twin/styleAnchorController')));
            req.params.id = twinId;
            req.body.type = 'phrase';
            req.body.phrase = text;
            req.body.userUtterance = '';
            req.body.idealReply = '';
            req.body.tags = ['migrated'];
            return addTwinAnchor(req, res);
        }
        throw errors_1.createError.validation('Invalid bucket type');
    }
    catch (error) {
        (0, errorHandler_1.handleControllerError)(error, 'Failed to ingest memory');
    }
};
exports.ingestMemories = ingestMemories;
//# sourceMappingURL=memoryController.js.map