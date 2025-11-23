"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTwinChatHistory = exports.updateLearningSettings = exports.getLearningData = exports.regeneratePrompt = void 0;
const database_1 = require("../../config/database");
const logger_1 = require("../../config/logger");
const systemPromptUpdater_1 = require("../../services/systemPromptUpdater");
const twinUtils_1 = require("../../utils/twinUtils");
const regeneratePrompt = async (req, res) => {
    try {
        const { id: twinId } = req.params;
        const userId = req.user.id;
        await (0, twinUtils_1.verifyTwinOwnership)(twinId, userId);
        const success = await systemPromptUpdater_1.systemPromptUpdater.updateTwinSystemPrompt(twinId);
        if (success) {
            res.json({ success: true, message: 'System prompt regenerated successfully' });
        }
        else {
            res.status(500).json({ success: false, error: 'Failed to regenerate system prompt' });
        }
    }
    catch (error) {
        logger_1.logger.error('Regenerate prompt API error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
};
exports.regeneratePrompt = regeneratePrompt;
const getLearningData = async (req, res) => {
    try {
        const { id: twinId } = req.params;
        const userId = req.user.id;
        await (0, twinUtils_1.verifyTwinOwnership)(twinId, userId);
        const learningData = {
            totalInteractions: 0,
            learningScore: 0,
            styleAccuracy: 0,
            events: []
        };
        try {
            const analyticsResult = await database_1.db.query(`
        SELECT 
          COUNT(DISTINCT c.id) as total_chats,
          COUNT(m.id) as total_messages,
          COUNT(CASE WHEN cf.rating = 'positive' THEN 1 END) as positive_feedback,
          COUNT(CASE WHEN cf.rating = 'negative' THEN 1 END) as negative_feedback
        FROM "Chat" c
        LEFT JOIN "Message" m ON c.id = m."chatId"
        LEFT JOIN "ChatFeedback" cf ON c.id = cf."chatId"
        WHERE c."twinId" = $1
      `, [twinId]);
            if (analyticsResult && analyticsResult.rows.length > 0) {
                const analytics = analyticsResult.rows[0];
                const eventsResult = await database_1.db.query(`
          SELECT 
            'Style correction applied' as description,
            ts as timestamp
          FROM "style_corrections" 
          WHERE "twin_id" = $1
          ORDER BY ts DESC
          LIMIT 5
        `, [twinId]);
                learningData.totalInteractions = parseInt(analytics.total_messages) || 0;
                learningData.learningScore = analytics.total_messages > 0 ?
                    Math.round((parseInt(analytics.positive_feedback) / parseInt(analytics.total_messages)) * 100) : 0;
                learningData.styleAccuracy = analytics.total_messages > 0 ?
                    Math.round((parseInt(analytics.positive_feedback) / parseInt(analytics.total_messages)) * 100) : 0;
                if (eventsResult && eventsResult.rows) {
                    learningData.events = eventsResult.rows.map((event) => ({
                        description: event.description,
                        timestamp: event.timestamp
                    }));
                }
            }
        }
        catch (error) {
            logger_1.logger.error('Error loading learning data:', error);
        }
        res.json({ success: true, learning: learningData });
    }
    catch (error) {
        logger_1.logger.error('Learning data API error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
};
exports.getLearningData = getLearningData;
const updateLearningSettings = async (req, res) => {
    try {
        const { id: twinId } = req.params;
        const userId = req.user.id;
        const { autoLearning, learningSensitivity } = req.body;
        await (0, twinUtils_1.verifyTwinOwnership)(twinId, userId);
        res.json({ success: true, message: 'Learning settings updated successfully' });
    }
    catch (error) {
        logger_1.logger.error('Learning settings API error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
};
exports.updateLearningSettings = updateLearningSettings;
const getTwinChatHistory = async (req, res) => {
    try {
        const { id: twinId } = req.params;
        const { limit = 20, offset = 0 } = req.query;
        const userId = req.user.id;
        await (0, twinUtils_1.verifyTwinOwnership)(twinId, userId);
        const chats = await database_1.db.query(`
      SELECT 
        c.id, 
        c."createdAt", 
        c."lastMessage",
        COUNT(m.id) as message_count,
        MAX(m."createdAt") as last_message_time
      FROM "Chat" c
      LEFT JOIN "Message" m ON c.id = m."chatId"
      WHERE c."twinId" = $1 AND c."userId" = $2
      GROUP BY c.id, c."createdAt", c."lastMessage"
      ORDER BY c."createdAt" DESC
      LIMIT $3 OFFSET $4
    `, [twinId, userId, parseInt(limit), parseInt(offset)]);
        if (!chats) {
            return res.status(500).json({ success: false, error: 'Failed to fetch chats' });
        }
        const chatHistory = chats.rows.map((chat) => ({
            id: chat.id,
            createdAt: chat.createdAt,
            lastMessage: chat.last_message,
            messageCount: parseInt(chat.message_count) || 0,
            lastMessageTime: chat.last_message_time
        }));
        res.json({
            success: true,
            chats: chatHistory,
            total: chatHistory.length
        });
    }
    catch (error) {
        logger_1.logger.error('Chat history API error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
};
exports.getTwinChatHistory = getTwinChatHistory;
//# sourceMappingURL=twinLearningController.js.map