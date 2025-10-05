"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const analyticsController_1 = require("./analyticsController");
const auth_1 = require("../../middleware/auth");
const router = (0, express_1.Router)();
router.get('/summary', analyticsController_1.getMetricsSummary);
router.get('/user', auth_1.requireAuth, analyticsController_1.getUserAnalytics);
exports.default = router;
//# sourceMappingURL=analyticsRoutes.js.map