"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const shareController_1 = require("./shareController");
const jwtCookie_1 = require("../../middleware/jwtCookie");
const router = (0, express_1.Router)();
router.post('/generate', jwtCookie_1.requireJWTFromCookie, shareController_1.generateShareLink);
router.get('/analytics/:twinId', jwtCookie_1.requireJWTFromCookie, shareController_1.getShareAnalytics);
router.get('/qr/:twinId', jwtCookie_1.requireJWTFromCookie, shareController_1.generateQRCode);
router.post('/track-click', shareController_1.trackShareClick);
router.get('/popular-platforms', shareController_1.getPopularSharePlatforms);
router.get('/content/:handle', shareController_1.getShareableContent);
exports.default = router;
//# sourceMappingURL=shareRoutes.js.map