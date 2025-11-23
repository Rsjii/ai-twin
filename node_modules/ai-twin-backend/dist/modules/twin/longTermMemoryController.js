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
const memoryService_1 = require("../../services/memoryService");
const errors_1 = require("../../utils/errors");
const twinUtils_1 = require("../../utils/twinUtils");
const idGenerator_1 = require("../../utils/idGenerator");
const errorHandler_1 = require("../../utils/errorHandler");
const getLongTermMemories = async (req, res, next) => {
    try {
        const { id: twinId } = req.params;
        const { category, limit = 20, query } = req.query;
        const userId = req.user?.id || req.userId;
        console.log('[LONG_TERM_MEMORIES:START]', {
            twinId,
            userId,
            category,
            limit,
            query,
            path: req.path,
            method: req.method,
        });
        if (!userId) {
            throw errors_1.createError.unauthorized();
        }
        await (0, twinUtils_1.verifyTwinOwnership)(twinId, userId);
        if (query && typeof query === 'string') {
            const memories = await memoryService_1.memoryService.getRelevantLongTermMemories(twinId, query, parseInt(limit) || 10);
            console.log('[LONG_TERM_MEMORIES] Smart retrieval result:', {
                memoriesCount: memories.length,
                query,
                limit,
            });
            res.set({
                'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0, private',
                'Pragma': 'no-cache',
                'Expires': '0',
            });
            return res.json({ success: true, memories });
        }
        const memories = await memoryService_1.memoryService.getLongTermMemories(twinId, category, parseInt(limit) || 20);
        console.log('[LONG_TERM_MEMORIES] Query result:', {
            memoriesCount: memories.length,
            category,
            limit,
            sampleMemory: memories[0] ? {
                id: memories[0].key || memories[0].id,
                category: memories[0].category,
            } : null,
        });
        res.set({
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0, private',
            'Pragma': 'no-cache',
            'Expires': '0',
        });
        res.json({ success: true, memories });
    }
    catch (error) {
        (0, errorHandler_1.handleControllerError)(error, 'Failed to get memories');
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
        await (0, twinUtils_1.verifyTwinOwnership)(twinId, userId);
        const finalKey = key || idGenerator_1.generateId.fact();
        await memoryService_1.memoryService.storeLongTermMemory(twinId, finalKey, value.trim(), category, 'manual');
        res.json({
            success: true,
            message: 'Memory stored successfully',
            memory: { key: finalKey, value: value.trim(), category }
        });
    }
    catch (error) {
        (0, errorHandler_1.handleControllerError)(error, 'Failed to store memory');
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
        await (0, twinUtils_1.verifyTwinOwnership)(twinId, userId);
        await memoryService_1.memoryService.storeLongTermMemory(twinId, key, value.trim(), category || 'fact', 'manual');
        res.json({
            success: true,
            message: 'Memory updated successfully',
            memory: { key, value: value.trim(), category: category || 'fact' }
        });
    }
    catch (error) {
        (0, errorHandler_1.handleControllerError)(error, 'Failed to update memory');
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
        await (0, twinUtils_1.verifyTwinOwnership)(twinId, userId);
        const { memoryLongTermQueries } = await Promise.resolve().then(() => __importStar(require('../../config/database')));
        await memoryLongTermQueries.delete(twinId, key);
        res.json({ success: true, message: 'Memory deleted successfully' });
    }
    catch (error) {
        (0, errorHandler_1.handleControllerError)(error, 'Failed to delete memory');
    }
};
exports.deleteLongTermMemory = deleteLongTermMemory;
//# sourceMappingURL=longTermMemoryController.js.map