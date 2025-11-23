"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const googleAuthController_1 = require("./googleAuthController");
const router = (0, express_1.Router)();
router.get('/google', googleAuthController_1.googleAuth);
router.get('/google/callback', googleAuthController_1.googleAuthCallback);
exports.default = router;
//# sourceMappingURL=googleAuthRoutes.js.map