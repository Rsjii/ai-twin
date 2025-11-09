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
exports.deleteLongTermMemory = exports.updateLongTermMemory = exports.addLongTermMemory = exports.getLongTermMemories = void 0;
const database_1 = require("../../config/database");
const memoryService_1 = require("../../services/memoryService");
const errors_1 = require("../../utils/errors");
const getLongTermMemories = async (req, res, next) => {
    try {
        const { id: twinId } = req.params;
        const { category, limit = 20, query } = req.query;
        const userId = req.user?.id || req.userId;
        if (!userId) {
            throw errors_1.createError.unauthorized();
        }
        const twinResult = await database_1.db.query('SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2', [twinId, userId]);
        if (twinResult.rows.length === 0) {
            throw errors_1.createError.notFound('Twin not found', errors_1.ErrorCodes.TWIN_NOT_FOUND);
        }
        if (query && typeof query === 'string') {
            const memories = await memoryService_1.memoryService.getRelevantLongTermMemories(twinId, query, parseInt(limit) || 10);
            return res.json({ success: true, memories });
        }
        const memories = await memoryService_1.memoryService.getLongTermMemories(twinId, category, parseInt(limit) || 20);
        res.json({ success: true, memories });
    }
    catch (error) {
        if (error instanceof errors_1.AppError) {
            throw error;
        }
        throw errors_1.createError.internal('Failed to get memories', error);
    }
};
exports.getLongTermMemories = getLongTermMemories;
const addLongTermMemory = async (req, res, next) => {
    try {
        const { id: twinId } = req.params;
        const { key, value, category = 'fact' } = req.body;
        const userId = req.user?.id || req.userId;
        if (!userId) {
            throw errors_1.createError.unauthorized();
        }
        if (!value || typeof value !== 'string' || value.trim().length === 0) {
            throw errors_1.createError.validation('Value is required');
        }
        const twinResult = await database_1.db.query('SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2', [twinId, userId]);
        if (twinResult.rows.length === 0) {
            throw errors_1.createError.notFound('Twin not found', errors_1.ErrorCodes.TWIN_NOT_FOUND);
        }
        const finalKey = key || `fact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await memoryService_1.memoryService.storeLongTermMemory(twinId, finalKey, value.trim(), category, 'manual');
        res.json({
            success: true,
            message: 'Memory stored successfully',
            memory: { key: finalKey, value: value.trim(), category }
        });
    }
    catch (error) {
        if (error instanceof errors_1.AppError) {
            throw error;
        }
        throw errors_1.createError.internal('Failed to store memory', error);
    }
};
exports.addLongTermMemory = addLongTermMemory;
const updateLongTermMemory = async (req, res, next) => {
    try {
        const { id: twinId, key } = req.params;
        const { value, category } = req.body;
        const userId = req.user?.id || req.userId;
        if (!userId) {
            throw errors_1.createError.unauthorized();
        }
        if (!value || typeof value !== 'string' || value.trim().length === 0) {
            throw errors_1.createError.validation('Value is required');
        }
        const twinResult = await database_1.db.query('SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2', [twinId, userId]);
        if (twinResult.rows.length === 0) {
            throw errors_1.createError.notFound('Twin not found', errors_1.ErrorCodes.TWIN_NOT_FOUND);
        }
        await memoryService_1.memoryService.storeLongTermMemory(twinId, key, value.trim(), category || 'fact', 'manual');
        res.json({
            success: true,
            message: 'Memory updated successfully',
            memory: { key, value: value.trim(), category: category || 'fact' }
        });
    }
    catch (error) {
        if (error instanceof errors_1.AppError) {
            throw error;
        }
        throw errors_1.createError.internal('Failed to update memory', error);
    }
};
exports.updateLongTermMemory = updateLongTermMemory;
const deleteLongTermMemory = async (req, res, next) => {
    try {
        const { id: twinId, key } = req.params;
        const userId = req.user?.id || req.userId;
        if (!userId) {
            throw errors_1.createError.unauthorized();
        }
        const twinResult = await database_1.db.query('SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2', [twinId, userId]);
        if (twinResult.rows.length === 0) {
            throw errors_1.createError.notFound('Twin not found', errors_1.ErrorCodes.TWIN_NOT_FOUND);
        }
        const { memoryLongTermQueries } = await Promise.resolve().then(() => __importStar(require('../../config/database')));
        await memoryLongTermQueries.delete(twinId, key);
        res.json({ success: true, message: 'Memory deleted successfully' });
    }
    catch (error) {
        if (error instanceof errors_1.AppError) {
            throw error;
        }
        throw errors_1.createError.internal('Failed to delete memory', error);
    }
};
exports.deleteLongTermMemory = deleteLongTermMemory;
//# sourceMappingURL=longTermMemoryController.js.map