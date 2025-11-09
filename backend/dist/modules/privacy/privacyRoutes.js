"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const privacyController_1 = require("./privacyController");
const jwtCookie_1 = require("../../middleware/jwtCookie");
const router = (0, express_1.Router)();
router.put('/settings', jwtCookie_1.requireJWTFromCookie, privacyController_1.updatePrivacySettings);
router.get('/settings/:twinId', jwtCookie_1.requireJWTFromCookie, privacyController_1.getPrivacySettings);
router.post('/block', jwtCookie_1.requireJWTFromCookie, privacyController_1.blockUser);
router.post('/unblock', jwtCookie_1.requireJWTFromCookie, privacyController_1.unblockUser);
router.get('/analytics/:twinId', jwtCookie_1.requireJWTFromCookie, privacyController_1.getPrivacyAnalytics);
router.get('/check-blocked/:twinId/:userId', privacyController_1.isUserBlocked);
exports.default = router;
//# sourceMappingURL=privacyRoutes.js.map