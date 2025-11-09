"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const adminAnalyticsController_1 = require("./adminAnalyticsController");
const jwtCookie_1 = require("../../middleware/jwtCookie");
const router = (0, express_1.Router)();
router.use(jwtCookie_1.requireJWTFromCookie);
router.use(adminAnalyticsController_1.requireAdminAuth);
router.get('/dashboard', adminAnalyticsController_1.getAdminAnalytics);
router.get('/time/:period', adminAnalyticsController_1.getTimeBasedAnalytics);
router.get('/detailed/:type', adminAnalyticsController_1.getDetailedMetrics);
router.get('/page/users', (req, res, next) => {
    console.log('=== ROUTE: /page/users ===');
    console.log('Request query:', req.query);
    console.log('Request user:', req.user);
    next();
}, adminAnalyticsController_1.getDetailedUsersPage);
router.get('/page/twins', (req, res, next) => {
    console.log('=== ROUTE: /page/twins ===');
    console.log('Request query:', req.query);
    console.log('Request user:', req.user);
    next();
}, adminAnalyticsController_1.getDetailedTwinsPage);
router.get('/page/chats', (req, res, next) => {
    console.log('=== ROUTE: /page/chats ===');
    console.log('Request query:', req.query);
    console.log('Request user:', req.user);
    next();
}, adminAnalyticsController_1.getDetailedChatsPage);
router.get('/page/messages', (req, res, next) => {
    console.log('=== ROUTE: /page/messages ===');
    console.log('Request query:', req.query);
    next();
}, adminAnalyticsController_1.getDetailedMessagesPage);
router.get('/users', adminAnalyticsController_1.getUsersList);
router.get('/user/:userId', adminAnalyticsController_1.getAdminUserAnalytics);
router.get('/user/:userId/detailed', adminAnalyticsController_1.getDetailedUserInfo);
router.delete('/user/:userId', adminAnalyticsController_1.removeUser);
router.get('/health', adminAnalyticsController_1.getSystemHealth);
exports.default = router;
//# sourceMappingURL=adminAnalyticsRoutes.js.map