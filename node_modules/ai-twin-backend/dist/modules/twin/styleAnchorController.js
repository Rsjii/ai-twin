"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTwinPhrases = exports.deleteTwinAnchor = exports.updateTwinAnchor = exports.addTwinAnchor = exports.getTwinAnchors = void 0;
const database_1 = require("../../config/database");
const errors_1 = require("../../utils/errors");
const twinUtils_1 = require("../../utils/twinUtils");
const errorHandler_1 = require("../../utils/errorHandler");
const getTwinAnchors = async (req, res, next) => {
    try {
        const { id: twinId } = req.params;
        const { limit = 10, offset = 0 } = req.query;
        const userId = req.user.id;
        console.log('[STYLE_ANCHORS:START]', {
            twinId,
            userId,
            limit,
            offset,
            path: req.path,
            method: req.method,
        });
        await (0, twinUtils_1.verifyTwinOwnership)(twinId, userId);
        const anchors = await database_1.styleAnchorsQueries.findByTwinId(twinId, parseInt(limit), parseInt(offset));
        console.log('[STYLE_ANCHORS] Query result:', {
            anchorsCount: anchors.length,
            limit,
            offset,
            sampleAnchor: anchors[0] ? {
                id: anchors[0].id,
                type: anchors[0].type,
                phrase: anchors[0].phrase || null,
            } : null,
        });
        res.set({
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0, private',
            'Pragma': 'no-cache',
            'Expires': '0',
        });
        res.json({ success: true, anchors });
    }
    catch (error) {
        (0, errorHandler_1.handleControllerError)(error, 'Failed to get style anchors');
    }
};
exports.getTwinAnchors = getTwinAnchors;
const addTwinAnchor = async (req, res, next) => {
    try {
        const { id: twinId } = req.params;
        const { userUtterance = '', idealReply = '', tags = [], type = 'interaction', phrase, patternType, context } = req.body;
        const userId = req.user.id;
        await (0, twinUtils_1.verifyTwinOwnership)(twinId, userId);
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
        let finalUserUtterance;
        let finalIdealReply;
        if (type === 'phrase') {
            finalUserUtterance = phrase || '';
            finalIdealReply = '';
        }
        else {
            finalUserUtterance = userUtterance || '';
            finalIdealReply = idealReply || '';
        }
        const anchor = await database_1.styleAnchorsQueries.create(twinId, finalUserUtterance, finalIdealReply, tags, type, phrase, patternType, context);
        res.json({
            success: true,
            anchor,
            message: 'Style anchor added successfully'
        });
    }
    catch (error) {
        (0, errorHandler_1.handleControllerError)(error, 'Failed to add style anchor');
    }
};
exports.addTwinAnchor = addTwinAnchor;
const updateTwinAnchor = async (req, res, next) => {
    try {
        const { id: twinId, anchorId } = req.params;
        const { userUtterance = '', idealReply = '', tags = [], type, phrase, patternType, context } = req.body;
        const userId = req.user.id;
        await (0, twinUtils_1.verifyTwinOwnership)(twinId, userId);
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
        (0, errorHandler_1.handleControllerError)(error, 'Failed to update style anchor');
    }
};
exports.updateTwinAnchor = updateTwinAnchor;
const deleteTwinAnchor = async (req, res, next) => {
    try {
        const { id: twinId, anchorId } = req.params;
        const userId = req.user.id;
        await (0, twinUtils_1.verifyTwinOwnership)(twinId, userId);
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
        (0, errorHandler_1.handleControllerError)(error, 'Failed to delete style anchor');
    }
};
exports.deleteTwinAnchor = deleteTwinAnchor;
const getTwinPhrases = async (req, res, next) => {
    try {
        const { id: twinId } = req.params;
        const { limit = 10 } = req.query;
        const userId = req.user.id;
        await (0, twinUtils_1.verifyTwinOwnership)(twinId, userId);
        const phrases = await database_1.styleAnchorsQueries.findPhrasesByTwinId(twinId, parseInt(limit) || 10);
        res.json({ success: true, phrases });
    }
    catch (error) {
        (0, errorHandler_1.handleControllerError)(error, 'Failed to get phrases');
    }
};
exports.getTwinPhrases = getTwinPhrases;
//# sourceMappingURL=styleAnchorController.js.map