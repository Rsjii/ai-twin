"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const analyticsController_1 = require("./analyticsController");
const jwtCookie_1 = require("../../middleware/jwtCookie");
const analyticsController_2 = require("./analyticsController");
const feedbackController_1 = require("../chat/feedbackController");
const router = (0, express_1.Router)();
router.get('/summary', analyticsController_1.getMetricsSummary);
router.get('/debug', jwtCookie_1.requireJWTFromCookie, analyticsController_1.debugUserData);
router.post('/create-sample', jwtCookie_1.requireJWTFromCookie, analyticsController_1.createSampleData);
router.get('/user', jwtCookie_1.requireJWTFromCookie, analyticsController_1.getUserAnalytics);
router.get('/twin/:twinId/analytics', jwtCookie_1.requireJWTFromCookie, analyticsController_2.getTwinAnalytics);
router.get('/referrals', jwtCookie_1.requireJWTFromCookie, analyticsController_1.getReferralStats);
router.get('/feedback', jwtCookie_1.requireJWTFromCookie, feedbackController_1.getFeedbackAnalytics);
router.get('/chatters-stats', jwtCookie_1.requireJWTFromCookie, analyticsController_1.getChattersStats);
exports.default = router;
//# sourceMappingURL=analyticsRoutes.js.map