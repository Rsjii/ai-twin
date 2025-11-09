"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTwinPhrases = exports.deleteTwinAnchor = exports.updateTwinAnchor = exports.addTwinAnchor = exports.getTwinAnchors = void 0;
const database_1 = require("../../config/database");
const errors_1 = require("../../utils/errors");
const getTwinAnchors = async (req, res, next) => {
    try {
        const { id: twinId } = req.params;
        const { limit = 10, offset = 0 } = req.query;
        const userId = req.user.id;
        const twinResult = await database_1.db.query(`
      SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);
        if (twinResult.rows.length === 0) {
            throw errors_1.createError.notFound('Twin not found', errors_1.ErrorCodes.TWIN_NOT_FOUND);
        }
        const anchors = await database_1.styleAnchorsQueries.findByTwinId(twinId, parseInt(limit), parseInt(offset));
        res.json({ success: true, anchors });
    }
    catch (error) {
        if (error instanceof errors_1.AppError) {
            throw error;
        }
        throw errors_1.createError.internal('Failed to get style anchors', error);
    }
};
exports.getTwinAnchors = getTwinAnchors;
const addTwinAnchor = async (req, res, next) => {
    try {
        const { id: twinId } = req.params;
        const { userUtterance = '', idealReply = '', tags = [], type = 'interaction', phrase, patternType, context } = req.body;
        const userId = req.user.id;
        const twinResult = await database_1.db.query('SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2', [twinId, userId]);
        if (twinResult.rows.length === 0) {
            throw errors_1.createError.notFound('Twin not found', errors_1.ErrorCodes.TWIN_NOT_FOUND);
        }
        if (type === 'interaction') {
            if (!userUtterance || !idealReply) {
                throw errors_1.createError.validation('User utterance and ideal reply are required for interactions');
            }
        }
        else if (type === 'phrase') {
            if (!phrase || phrase.trim().length === 0) {
                throw errors_1.createError.validation('Phrase is required for phrase type anchors');
            }
        }
        else if (type === 'pattern') {
            if (!userUtterance || userUtterance.trim().length === 0) {
                throw errors_1.createError.validation('Pattern examples (userUtterance) are required for pattern type anchors');
            }
        }
        const anchor = await database_1.styleAnchorsQueries.create(twinId, userUtterance || '', idealReply || '', tags, type, phrase, patternType, context);
        res.json({
            success: true,
            anchor,
            message: 'Style anchor added successfully'
        });
    }
    catch (error) {
        if (error instanceof errors_1.AppError) {
            throw error;
        }
        throw errors_1.createError.internal('Failed to add style anchor', error);
    }
};
exports.addTwinAnchor = addTwinAnchor;
const updateTwinAnchor = async (req, res, next) => {
    try {
        const { id: twinId, anchorId } = req.params;
        const { userUtterance = '', idealReply = '', tags = [], type, phrase, patternType, context } = req.body;
        const userId = req.user.id;
        const twinResult = await database_1.db.query('SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2', [twinId, userId]);
        if (twinResult.rows.length === 0) {
            throw errors_1.createError.notFound('Twin not found', errors_1.ErrorCodes.TWIN_NOT_FOUND);
        }
        const anchor = await database_1.styleAnchorsQueries.update(anchorId, userUtterance || '', idealReply || '', tags, type, phrase, patternType, context);
        if (!anchor) {
            throw errors_1.createError.notFound('Style anchor not found');
        }
        res.json({
            success: true,
            anchor,
            message: 'Style anchor updated successfully'
        });
    }
    catch (error) {
        if (error instanceof errors_1.AppError) {
            throw error;
        }
        throw errors_1.createError.internal('Failed to update style anchor', error);
    }
};
exports.updateTwinAnchor = updateTwinAnchor;
const deleteTwinAnchor = async (req, res, next) => {
    try {
        const { id: twinId, anchorId } = req.params;
        const userId = req.user.id;
        const twinResult = await database_1.db.query(`
      SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);
        if (twinResult.rows.length === 0) {
            throw errors_1.createError.notFound('Twin not found', errors_1.ErrorCodes.TWIN_NOT_FOUND);
        }
        const anchor = await database_1.styleAnchorsQueries.delete(anchorId);
        if (!anchor) {
            throw errors_1.createError.notFound('Style anchor not found');
        }
        res.json({
            success: true,
            message: 'Style anchor deleted successfully'
        });
    }
    catch (error) {
        if (error instanceof errors_1.AppError) {
            throw error;
        }
        throw errors_1.createError.internal('Failed to delete style anchor', error);
    }
};
exports.deleteTwinAnchor = deleteTwinAnchor;
const getTwinPhrases = async (req, res, next) => {
    try {
        const { id: twinId } = req.params;
        const { limit = 10 } = req.query;
        const userId = req.user.id;
        const twinResult = await database_1.db.query('SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2', [twinId, userId]);
        if (twinResult.rows.length === 0) {
            throw errors_1.createError.notFound('Twin not found', errors_1.ErrorCodes.TWIN_NOT_FOUND);
        }
        const phrases = await database_1.styleAnchorsQueries.findPhrasesByTwinId(twinId, parseInt(limit) || 10);
        res.json({ success: true, phrases });
    }
    catch (error) {
        if (error instanceof errors_1.AppError) {
            throw error;
        }
        throw errors_1.createError.internal('Failed to get phrases', error);
    }
};
exports.getTwinPhrases = getTwinPhrases;
//# sourceMappingURL=styleAnchorController.js.map