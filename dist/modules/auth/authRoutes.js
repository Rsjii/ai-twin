"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authController_1 = require("./authController");
const rateLimit_1 = require("../../middleware/rateLimit");
const csrf_1 = require("../../middleware/csrf");
const validation_1 = require("../../middleware/validation");
const router = (0, express_1.Router)();
router.use(csrf_1.generateCSRFToken);
router.post('/waitlist', validation_1.sanitizeInput, csrf_1.validateCSRF, authController_1.waitlistSignup);
router.post('/login/start', validation_1.sanitizeInput, csrf_1.validateCSRF, rateLimit_1.otpRateLimit, authController_1.loginStart);
router.post('/login/verify', validation_1.sanitizeInput, csrf_1.validateCSRF, authController_1.loginVerify);
router.post('/logout', csrf_1.validateCSRF, authController_1.logout);
exports.default = router;
//# sourceMappingURL=authRoutes.js.map