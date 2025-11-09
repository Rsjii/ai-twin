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
exports.deleteMemory = exports.updateMemory = exports.ingestMemories = exports.retrieveMemories = exports.getMemoryStats = void 0;
const database_1 = require("../../config/database");
const logger_1 = require("../../config/logger");
const errors_1 = require("../../utils/errors");
const getMemoryStats = async (req, res, next) => {
    try {
        const { id: twinId } = req.params;
        const userId = req.user?.id || req.userId;
        logger_1.logger.warn('⚠️ DEPRECATED: getMemoryStats - Consider using unified endpoints');
        if (!userId) {
            throw errors_1.createError.unauthorized();
        }
        const twinResult = await database_1.db.query('SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2', [twinId, userId]);
        if (!twinResult || twinResult.rows.length === 0) {
            throw errors_1.createError.notFound('Twin not found', errors_1.ErrorCodes.TWIN_NOT_FOUND);
        }
        const statsResult = await database_1.db.query(`
      SELECT 
        bucket,
        COUNT(*) as count
      FROM mem_chunks 
      WHERE twin_id = $1 
      GROUP BY bucket
    `, [twinId]);
        if (!statsResult) {
            throw errors_1.createError.internal('Failed to get memory statistics');
        }
        const totalMemories = statsResult.rows.reduce((sum, row) => sum + parseInt(row.count), 0);
        res.set('X-Deprecated', 'true');
        res.set('X-Alternative-Endpoint', '/api/twin/:id/long-term-memory');
        res.json({
            success: true,
            deprecated: true,
            total: totalMemories,
            stats: statsResult.rows.map(row => ({
                bucket: row.bucket,
                count: parseInt(row.count)
            }))
        });
    }
    catch (error) {
        if (error instanceof errors_1.AppError) {
            throw error;
        }
        throw errors_1.createError.internal('Failed to get memory statistics', error);
    }
};
exports.getMemoryStats = getMemoryStats;
const retrieveMemories = async (req, res, next) => {
    try {
        const { id: twinId } = req.params;
        const { bucket, limit = 10, offset = 0 } = req.query;
        const userId = req.user?.id || req.userId;
        logger_1.logger.warn('⚠️ DEPRECATED: retrieveMemories - Consider using unified endpoints');
        if (!userId) {
            throw errors_1.createError.unauthorized();
        }
        const twinResult = await database_1.db.query('SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2', [twinId, userId]);
        if (!twinResult || twinResult.rows.length === 0) {
            throw errors_1.createError.notFound('Twin not found', errors_1.ErrorCodes.TWIN_NOT_FOUND);
        }
        let memories;
        if (bucket === 'all') {
            const factsMemories = await database_1.memChunksQueries.findByTwinIdAndBucket(twinId, 'facts', parseInt(limit), parseInt(offset));
            const voiceMemories = await database_1.memChunksQueries.findByTwinIdAndBucket(twinId, 'voice', parseInt(limit), parseInt(offset));
            memories = [...factsMemories, ...voiceMemories];
        }
        else {
            memories = await database_1.memChunksQueries.findByTwinIdAndBucket(twinId, bucket, parseInt(limit), parseInt(offset));
        }
        res.set('X-Deprecated', 'true');
        res.set('X-Alternative-Endpoint', '/api/twin/:id/long-term-memory');
        res.json({ success: true, memories, deprecated: true });
    }
    catch (error) {
        if (error instanceof errors_1.AppError) {
            throw error;
        }
        throw errors_1.createError.internal('Failed to retrieve memories', error);
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
        const twinResult = await database_1.db.query('SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2', [twinId, userId]);
        if (!twinResult || twinResult.rows.length === 0) {
            throw errors_1.createError.notFound('Twin not found', errors_1.ErrorCodes.TWIN_NOT_FOUND);
        }
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
            req.body.key = `fact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
        if (error instanceof errors_1.AppError) {
            throw error;
        }
        throw errors_1.createError.internal('Failed to ingest memory', error);
    }
};
exports.ingestMemories = ingestMemories;
const updateMemory = async (req, res, next) => {
    try {
        const { id: twinId, memId } = req.params;
        const { text } = req.body;
        const userId = req.user?.id || req.userId;
        if (!userId) {
            throw errors_1.createError.unauthorized();
        }
        const twinResult = await database_1.db.query('SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2', [twinId, userId]);
        if (!twinResult || twinResult.rows.length === 0) {
            throw errors_1.createError.notFound('Twin not found', errors_1.ErrorCodes.TWIN_NOT_FOUND);
        }
        if (!text) {
            throw errors_1.createError.validation('Text is required');
        }
        const memory = await database_1.memChunksQueries.update(memId, text);
        if (!memory) {
            throw errors_1.createError.notFound('Memory not found');
        }
        res.json({
            success: true,
            memory,
            message: 'Memory updated successfully'
        });
    }
    catch (error) {
        if (error instanceof errors_1.AppError) {
            throw error;
        }
        throw errors_1.createError.internal('Failed to update memory', error);
    }
};
exports.updateMemory = updateMemory;
const deleteMemory = async (req, res, next) => {
    try {
        const { id: twinId, memId } = req.params;
        const userId = req.user?.id || req.userId;
        if (!userId) {
            throw errors_1.createError.unauthorized();
        }
        const twinResult = await database_1.db.query('SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2', [twinId, userId]);
        if (!twinResult || twinResult.rows.length === 0) {
            throw errors_1.createError.notFound('Twin not found', errors_1.ErrorCodes.TWIN_NOT_FOUND);
        }
        const memory = await database_1.memChunksQueries.delete(memId);
        if (!memory) {
            throw errors_1.createError.notFound('Memory not found');
        }
        res.json({
            success: true,
            message: 'Memory deleted successfully'
        });
    }
    catch (error) {
        if (error instanceof errors_1.AppError) {
            throw error;
        }
        throw errors_1.createError.internal('Failed to delete memory', error);
    }
};
exports.deleteMemory = deleteMemory;
//# sourceMappingURL=memoryController.js.map