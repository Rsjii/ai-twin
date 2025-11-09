"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adjustTone = exports.getChatFeedbackStatus = exports.getFeedbackAnalytics = exports.regenerateResponse = exports.submitChatFeedback = exports.getFeedbackStats = exports.submitResponseFeedback = void 0;
const zod_1 = require("zod");
const database_1 = require("../../config/database");
const logger_1 = require("../../config/logger");
const errors_1 = require("../../utils/errors");
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
        const correctionId = `correction_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const delta = rating === 'up' ? 1 : -1;
        await database_1.db.query(`
      INSERT INTO style_corrections (id, twin_id, knob, delta, source, ts)
      VALUES ($1, $2, $3, $4, 'user_feedback', NOW())
    `, [correctionId, twinId, knobMapping['user_style'], delta]);
        await database_1.db.query(`
      UPDATE ai_runs 
      SET feedback_score = $1, user_rating = $2 
      WHERE twin_id = $3 
      ORDER BY ts DESC LIMIT 1
    `, [rating === 'up' ? 85 : 25, rating, twinId]);
        if (correction) {
            const anchorId = `anchor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            await database_1.db.query(`
        INSERT INTO style_anchors (id, twin_id, user_utterance, ideal_reply, tags, created_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
      `, [anchorId, twinId, 'User feedback', correction, ['user_correction']]);
        }
        res.json({
            success: true,
            message: 'Feedback submitted successfully',
            correctionId
        });
    }
    catch (error) {
        if (error instanceof errors_1.AppError) {
            throw error;
        }
        throw errors_1.createError.internal('Failed to submit feedback', error);
    }
};
exports.submitResponseFeedback = submitResponseFeedback;
const getFeedbackStats = async (req, res, next) => {
    try {
        const { twinId } = req.params;
        const userId = req.user.id;
        const twinResult = await database_1.db.query(`
      SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);
        if (twinResult.rows.length === 0) {
            throw errors_1.createError.notFound('Twin not found or access denied', errors_1.ErrorCodes.TWIN_NOT_FOUND);
        }
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
        if (error instanceof errors_1.AppError) {
            throw error;
        }
        throw errors_1.createError.internal('Failed to get feedback statistics', error);
    }
};
exports.getFeedbackStats = getFeedbackStats;
const aiLearningService_1 = require("../../services/aiLearningService");
const chatService_1 = require("../../services/chatService");
const submitChatFeedback = async (req, res, next) => {
    try {
        const { chatId } = req.params;
        const { responseId, rating, suggestion, tonePreference } = req.body;
        const userId = req.user.id;
        await database_1.db.query(`
      INSERT INTO "ChatFeedback" ("chatId", "responseId", "userId", "rating", "suggestion", "tonePreference", "createdAt")
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
    `, [chatId, responseId, userId, rating, suggestion, tonePreference]);
        await (0, aiLearningService_1.updateAILearning)(chatId, rating, suggestion, tonePreference);
        res.json({ success: true });
    }
    catch (error) {
        if (error instanceof errors_1.AppError) {
            throw error;
        }
        throw errors_1.createError.internal('Failed to submit chat feedback', error);
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
        if (error instanceof errors_1.AppError) {
            throw error;
        }
        throw errors_1.createError.internal('Failed to adjust tone', error);
    }
};
exports.adjustTone = adjustTone;
//# sourceMappingURL=feedbackController.js.map