"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const twinController_1 = require("./twinController");
const jwtCookie_1 = require("../../middleware/jwtCookie");
const rateLimit_1 = require("../../middleware/rateLimit");
const csrf_1 = require("../../middleware/csrf");
const router = (0, express_1.Router)();
router.use(jwtCookie_1.requireJWTFromCookie);
router.use(csrf_1.generateCSRFToken);
router.post('/create', rateLimit_1.twinCreationRateLimit, twinController_1.createTwin);
router.get('/', twinController_1.getUserTwins);
router.get('/:id', twinController_1.getTwinById);
exports.default = router;
//# sourceMappingURL=twinRoutes.js.map