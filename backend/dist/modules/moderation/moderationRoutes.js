"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const moderationController_1 = require("./moderationController");
const jwtCookie_1 = require("../../middleware/jwtCookie");
const router = (0, express_1.Router)();
router.post('/moderate', moderationController_1.moderateContent);
router.post('/report', jwtCookie_1.requireJWTFromCookie, moderationController_1.reportContent);
router.get('/stats', jwtCookie_1.requireJWTFromCookie, moderationController_1.getModerationStats);
exports.default = router;
//# sourceMappingURL=moderationRoutes.js.map