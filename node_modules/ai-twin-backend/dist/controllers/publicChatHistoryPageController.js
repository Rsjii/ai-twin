"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPublicChatHistoryPage = getPublicChatHistoryPage;
const logger_1 = require("../config/logger");
async function getPublicChatHistoryPage(req, res) {
    const user = res.locals.user || null;
    try {
        logger_1.logger.info('[PAGE_PUBLIC_CHAT_HISTORY]', {
            path: req.path,
            userFromReq: req.user
                ? { id: req.user.id, email: req.user.email, handle: req.user.handle }
                : null,
            userFromLocals: user
                ? { id: user.id, email: user.email, handle: user.handle }
                : null,
        });
    }
    catch (logError) {
        logger_1.logger.warn('[PAGE_PUBLIC_CHAT_HISTORY] Failed to log context:', logError);
    }
    console.log('[PAGE_PUBLIC_CHAT_HISTORY] Render data:', {
        user: user ? { id: user.id, email: user.email } : null,
        userFromReq: req.user ? { id: req.user.id, email: req.user.email } : null,
        userFromLocals: user ? { id: user.id, email: user.email } : null,
        path: req.path,
    });
    res.render('public-chat-history', {
        title: 'Your Chat History - AI Twin',
        user,
        csrfToken: res.locals['csrfToken'] || ''
    });
}
//# sourceMappingURL=publicChatHistoryPageController.js.map