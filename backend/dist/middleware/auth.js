"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.optionalAuth = exports.requireAuth = void 0;
const requireAuth = (req, res, next) => {
    if (!req.session?.userId) {
        return res.redirect('/login');
    }
    req.user = {
        id: req.session.userId,
        email: req.session.userEmail,
        handle: req.session.userHandle,
    };
    next();
};
exports.requireAuth = requireAuth;
const optionalAuth = (req, res, next) => {
    if (req.session?.userId) {
        req.user = {
            id: req.session.userId,
            email: req.session.userEmail,
            handle: req.session.userHandle,
        };
    }
    next();
};
exports.optionalAuth = optionalAuth;
//# sourceMappingURL=auth.js.map