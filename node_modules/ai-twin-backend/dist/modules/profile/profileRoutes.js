"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const profileController_1 = require("./profileController");
const auth_1 = require("../../middleware/auth");
const csrf_1 = require("../../middleware/csrf");
const validation_1 = require("../../middleware/validation");
const router = (0, express_1.Router)();
router.get('/p/:handle', profileController_1.getPublicProfile);
router.use(auth_1.requireAuth);
router.use(csrf_1.generateCSRFToken);
router.post('/handle', validation_1.sanitizeInput, csrf_1.validateCSRF, profileController_1.updateHandle);
router.post('/link', csrf_1.validateCSRF, profileController_1.generateProfileLink);
router.post('/share', csrf_1.validateCSRF, profileController_1.logProfileShare);
exports.default = router;
//# sourceMappingURL=profileRoutes.js.map