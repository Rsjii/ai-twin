"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const inviteController_1 = require("./inviteController");
const jwtCookie_1 = require("../../middleware/jwtCookie");
const csrf_1 = require("../../middleware/csrf");
const router = (0, express_1.Router)();
router.get('/my-code', (req, res, next) => {
    console.log('🟢 Route /api/invite/my-code hit');
    console.log('📝 Method:', req.method);
    console.log('🔑 Headers:', req.headers);
    next();
}, csrf_1.generateCSRFToken, jwtCookie_1.requireJWTFromCookie, inviteController_1.getMyReferralCode);
router.get('/my-referrals', csrf_1.generateCSRFToken, jwtCookie_1.requireJWTFromCookie, inviteController_1.getMyReferrals);
exports.default = router;
//# sourceMappingURL=inviteRoutes.js.map