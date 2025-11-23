"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adjustTone = exports.getChatFeedbackStatus = exports.getFeedbackAnalytics = exports.regenerateResponse = exports.submitChatFeedback = exports.getFeedbackStats = exports.submitResponseFeedback = void 0;
const zod_1 = require("zod");
const database_1 = require("../../config/database");
const logger_1 = require("../../config/logger");
const errors_1 = require("../../utils/errors");
const twinUtils_1 = require("../../utils/twinUtils");
const idGenerator_1 = require("../../utils/idGenerator");
const errorHandler_1 = require("../../utils/errorHandler");
const feedbackSchema = zod_1.z.object({
    rating: zod_1.z.enum(['up', 'down']),
    messageId: zod_1.z.string(),
    correction: zod_1.z.string().optional()
});
const knobMapping = {
    'user_style': 'casual',
    'formality': 'formal',
    'emoji': 'emoji_off',
    'humor': 'humor',
    'question_freq': 'question_freq'
};
const submitResponseFeedback = async (req, res, next) => {
    try {
        const { rating, messageId, correction } = feedbackSchema.parse(req.body);
        const { id: chatId } = req.params;
        const userId = req.user.id;
        const chatResult = await database_1.db.query(`
      SELECT c."twinId" FROM "Chat" c
      WHERE c.id = $1 AND c."userId" = $2
    `, [chatId, userId]);
        if (chatResult.rows.length === 0) {
            throw errors_1.createError.notFound('Chat not found or access denied', errors_1.ErrorCodes.CHAT_NOT_FOUND);
        }
        const twinId = chatResult.rows[0].twinId;
        const correctionId = idGenerator_1.generateId.correction();
        const delta = rating === 'up' ? 1 : -1;
        const utcTimestamp = new Date().toISOString();
        await database_1.db.query(`
      INSERT INTO style_corrections (id, twin_id, knob, delta, source, ts)
      VALUES ($1, $2, $3, $4, 'user_feedback', $5::timestamptz)
    `, [correctionId, twinId, knobMapping['user_style'], delta, utcTimestamp]);
        await database_1.db.query(`
      UPDATE ai_runs 
      SET feedback_score = $1, user_rating = $2 
      WHERE twin_id = $3 
      ORDER BY ts DESC LIMIT 1
    `, [rating === 'up' ? 85 : 25, rating, twinId]);
        if (correction) {
            const anchorId = idGenerator_1.generateId.anchor();
            await database_1.db.query(`
        INSERT INTO style_anchors (id, twin_id, user_utterance, ideal_reply, tags, created_at)
        VALUES ($1, $2, $3, $4, $5, $6::timestamptz)
      `, [anchorId, twinId, 'User feedback', correction, ['user_correction'], utcTimestamp]);
        }
        res.json({
            success: true,
            message: 'Feedback submitted successfully',
            correctionId
        });
    }
    catch (error) {
        (0, errorHandler_1.handleControllerError)(error, 'Failed to submit feedback');
    }
};
exports.submitResponseFeedback = submitResponseFeedback;
const getFeedbackStats = async (req, res, next) => {
    try {
        const { twinId } = req.params;
        const userId = req.user.id;
        await (0, twinUtils_1.verifyTwinOwnership)(twinId, userId);
        const statsResult = await database_1.db.query(`
      SELECT 
        COUNT(*) as total_feedback,
        SUM(CASE WHEN delta > 0 THEN 1 ELSE 0 END) as positive_feedback,
        SUM(CASE WHEN delta < 0 THEN 1 ELSE 0 END) as negative_feedback,
        AVG(delta) as avg_delta
      FROM style_corrections 
      WHERE twin_id = $1 AND source = 'user_feedback'
    `, [twinId]);
        const stats = statsResult.rows[0];
        res.json({
            success: true,
            stats: {
                totalFeedback: parseInt(stats.total_feedback),
                positiveFeedback: parseInt(stats.positive_feedback),
                negativeFeedback: parseInt(stats.negative_feedback),
                averageDelta: parseFloat(stats.avg_delta) || 0
            }
        });
    }
    catch (error) {
        (0, errorHandler_1.handleControllerError)(error, 'Failed to get feedback statistics');
    }
};
exports.getFeedbackStats = getFeedbackStats;
const aiLearningService_1 = require("../../services/aiLearningService");
const chatService_1 = require("../../services/chatService");
const submitChatFeedback = async (req, res, next) => {
    try {
        const utcTimestamp = new Date().toISOString();
        const { chatId } = req.params;
        const { responseId, rating, suggestion, tonePreference } = req.body;
        const userId = req.user.id;
        await database_1.db.query(`
      INSERT INTO "ChatFeedback" ("chatId", "responseId", "userId", "rating", "suggestion", "tonePreference", "createdAt")
      VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz)
    `, [chatId, responseId, userId, rating, suggestion, tonePreference, utcTimestamp]);
        await (0, aiLearningService_1.updateAILearning)(chatId, rating, suggestion, tonePreference);
        res.json({ success: true });
    }
    catch (error) {
        (0, errorHandler_1.handleControllerError)(error, 'Failed to submit chat feedback');
    }
};
exports.submitChatFeedback = submitChatFeedback;
const regenerateResponse = async (req, res, next) => {
    try {
        const { chatId } = req.params;
        const { responseId, tonePreference } = req.body;
        const userId = req.user.id;
        const newResponse = await (0, chatService_1.generateResponseWithTone)(chatId, tonePreference);
        res.json({ success: true, newResponse });
    }
    catch (error) {
        logger_1.logger.error('Regenerate API error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
};
exports.regenerateResponse = regenerateResponse;
const getFeedbackAnalytics = async (req, res, next) => {
    try {
        try {
            logger_1.logger.info('[FEEDBACK_ANALYTICS:START]', {
                path: req.path,
                method: req.method,
                userId: req.user?.id || null,
                headers: {
                    ifNoneMatch: req.headers['if-none-match'] || null,
                    ifModifiedSince: req.headers['if-modified-since'] || null,
                    cacheControl: req.headers['cache-control'] || null,
                },
            });
        }
        catch (logErr) {
            logger_1.logger.warn('[FEEDBACK_ANALYTICS] Failed to log START:', logErr);
        }
        const userId = req.user.id;
        const feedbackResult = await database_1.db.query(`
      SELECT 
        COUNT(CASE WHEN rating = 'positive' THEN 1 END) as positive_count,
        COUNT(CASE WHEN rating = 'negative' THEN 1 END) as negative_count,
        COUNT(*) as total_feedback
      FROM "ChatFeedback" 
      WHERE "userId" = $1
    `, [userId]);
        const feedback = feedbackResult.rows[0];
        const satisfactionScore = feedback.total_feedback > 0
            ? Math.round((feedback.positive_count / feedback.total_feedback) * 100)
            : 0;
        console.log('[FEEDBACK_ANALYTICS] Query result:', {
            positiveCount: feedback.positive_count,
            negativeCount: feedback.negative_count,
            totalFeedback: feedback.total_feedback,
            satisfactionScore,
        });
        try {
            logger_1.logger.info('[FEEDBACK_ANALYTICS:RESPONSE]', {
                userId,
                positiveCount: feedback.positive_count,
                negativeCount: feedback.negative_count,
                totalFeedback: feedback.total_feedback,
                satisfactionScore,
            });
        }
        catch (logErr) {
            logger_1.logger.warn('[FEEDBACK_ANALYTICS] Failed to log RESPONSE:', logErr);
        }
        console.log('[FEEDBACK_ANALYTICS] Final response data:', {
            success: true,
            analytics: {
                positiveFeedback: feedback.positive_count,
                negativeFeedback: feedback.negative_count,
                totalFeedback: feedback.total_feedback,
                satisfactionScore,
            },
        });
        res.set({
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0, private',
            'Pragma': 'no-cache',
            'Expires': '0',
        });
        res.json({
            success: true,
            analytics: {
                positiveFeedback: feedback.positive_count,
                negativeFeedback: feedback.negative_count,
                totalFeedback: feedback.total_feedback,
                satisfactionScore: satisfactionScore
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Feedback analytics error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
};
exports.getFeedbackAnalytics = getFeedbackAnalytics;
const getChatFeedbackStatus = async (req, res, next) => {
    try {
        const { chatId } = req.params;
        const userId = req.user.id;
        const feedbackResult = await database_1.db.query(`
      SELECT "responseId", "rating", "suggestion", "tonePreference"
      FROM "ChatFeedback"
      WHERE "chatId" = $1 AND "userId" = $2
    `, [chatId, userId]);
        const feedback = {};
        feedbackResult.rows.forEach(row => {
            feedback[row.responseId] = {
                rating: row.rating,
                suggestion: row.suggestion,
                tonePreference: row.tonePreference
            };
        });
        res.json({ success: true, feedback });
    }
    catch (error) {
        logger_1.logger.error('Feedback status API error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
};
exports.getChatFeedbackStatus = getChatFeedbackStatus;
const adjustTone = async (req, res, next) => {
    try {
        const { chatId } = req.params;
        const { responseId, tone } = req.body;
        const userId = req.user.id;
        const chatResult = await database_1.db.query(`
      SELECT c."twinId", c."chatVector" FROM "Chat" c
      WHERE c.id = $1 AND c."userId" = $2
    `, [chatId, userId]);
        if (chatResult.rows.length === 0) {
            throw errors_1.createError.notFound('Chat not found', errors_1.ErrorCodes.CHAT_NOT_FOUND);
        }
        const adjustedResponse = await (0, chatService_1.adjustResponseTone)(chatResult.rows[0].twinId, responseId, tone);
        res.json({ success: true, adjustedResponse });
    }
    catch (error) {
        (0, errorHandler_1.handleControllerError)(error, 'Failed to adjust tone');
    }
};
exports.adjustTone = adjustTone;
//# sourceMappingURL=feedbackController.js.map