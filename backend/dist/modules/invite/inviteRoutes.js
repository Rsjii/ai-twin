"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const inviteController_1 = require("./inviteController");
const auth_1 = require("../../middleware/auth");
const csrf_1 = require("../../middleware/csrf");
const validation_1 = require("../../middleware/validation");
const router = (0, express_1.Router)();
router.get('/accept', inviteController_1.acceptInvite);
router.use(auth_1.requireAuth);
router.use(csrf_1.generateCSRFToken);
router.post('/create', csrf_1.validateCSRF, inviteController_1.createInvite);
router.post('/process', validation_1.sanitizeInput, csrf_1.validateCSRF, inviteController_1.processInviteAcceptance);
exports.default = router;
//# sourceMappingURL=inviteRoutes.js.map