"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPublicChatHistoryPage = getPublicChatHistoryPage;
function getPublicChatHistoryPage(req, res) {
    res.render('public-chat-history', {
        title: 'Your Chat History - AI Twin',
        user: req.user,
        csrfToken: res.locals['csrfToken'] || ''
    });
}
//# sourceMappingURL=publicChatHistoryPageController.js.map