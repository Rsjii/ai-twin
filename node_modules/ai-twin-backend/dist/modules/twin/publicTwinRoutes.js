"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const publicTwinController_1 = require("./publicTwinController");
const jwtCookie_1 = require("../../middleware/jwtCookie");
const router = (0, express_1.Router)();
router.get('/public/:handle', publicTwinController_1.getPublicTwinProfile);
router.post('/make-public', jwtCookie_1.requireJWTFromCookie, publicTwinController_1.makeTwinPublic);
router.post('/make-private', jwtCookie_1.requireJWTFromCookie, publicTwinController_1.makeTwinPrivate);
router.put('/profile', jwtCookie_1.requireJWTFromCookie, publicTwinController_1.updateTwinProfile);
router.get('/my-profile', jwtCookie_1.requireJWTFromCookie, publicTwinController_1.getMyTwinProfile);
exports.default = router;
//# sourceMappingURL=publicTwinRoutes.js.map