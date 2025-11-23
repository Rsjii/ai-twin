"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTwinPublicChatHistoryPage = getTwinPublicChatHistoryPage;
exports.getViewPublicChatHistoryPage = getViewPublicChatHistoryPage;
const database_1 = require("../config/database");
const logger_1 = require("../config/logger");
const errors_1 = require("../utils/errors");
const errorHandler_1 = require("../utils/errorHandler");
async function getTwinPublicChatHistoryPage(req, res) {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.redirect('/auth');
        }
        const { id: twinId } = req.params;
        const userTwins = await database_1.twinQueries.findByUserId(userId);
        const twin = userTwins.find(t => t.id === twinId) || null;
        if (!twin) {
            throw errors_1.createError.notFound('Twin not found or access denied');
        }
        const fullUser = await database_1.db.query('SELECT id, email, handle, name, "profileImage" FROM "User" WHERE id = $1', [userId]);
        const user = fullUser.rows[0] || null;
        res.render('twin-public-chat-history', {
            title: 'Public Chat History - My Twin',
            user: user,
            twin: twin,
            twinId: twinId,
            hasTwins: true,
            csrfToken: res.locals['csrfToken']
        });
    }
    catch (error) {
        logger_1.logger.error('Twin public chat history page error:', {
            error: error instanceof Error ? error.message : 'Unknown error',
            userId: req.user?.id,
            path: req.path
        });
        (0, errorHandler_1.handleControllerError)(error, 'Failed to load public chat history page');
    }
}
async function getViewPublicChatHistoryPage(req, res) {
    try {
        const { chatId } = req.params;
        const userId = req.user?.id;
        if (!userId) {
            return res.redirect('/auth');
        }
        const chatResult = await database_1.db.query(`
      SELECT pc."twinId", t."userId" as twin_owner_id
      FROM "PublicChat" pc
      LEFT JOIN "Twin" t ON pc."twinId" = t.id
      WHERE pc.id = $1
    `, [chatId]);
        if (chatResult.rows.length === 0 || chatResult.rows[0].twin_owner_id !== userId) {
            throw errors_1.createError.notFound('Chat not found or access denied');
        }
        res.render('view-public-chat-history', {
            title: 'View Chat History',
            user: req.user,
            chatId: chatId,
            csrfToken: res.locals['csrfToken']
        });
    }
    catch (error) {
        logger_1.logger.error('View chat history page error:', error);
        (0, errorHandler_1.handleControllerError)(error, 'Failed to load chat history');
    }
}
//# sourceMappingURL=twinPublicChatHistoryPageController.js.map