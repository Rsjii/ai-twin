"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const twinController_1 = require("./twinController");
const auth_1 = require("../../middleware/auth");
const rateLimit_1 = require("../../middleware/rateLimit");
const csrf_1 = require("../../middleware/csrf");
const validation_1 = require("../../middleware/validation");
const router = (0, express_1.Router)();
router.use(auth_1.requireAuth);
router.use(csrf_1.generateCSRFToken);
router.post('/create', validation_1.sanitizeInput, csrf_1.validateCSRF, rateLimit_1.twinCreationRateLimit, twinController_1.createTwin);
router.get('/', twinController_1.getUserTwins);
router.get('/:id', twinController_1.getTwinById);
exports.default = router;
//# sourceMappingURL=twinRoutes.js.map