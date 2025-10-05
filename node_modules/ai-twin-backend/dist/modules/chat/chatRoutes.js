"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const chatController_1 = require("./chatController");
const auth_1 = require("../../middleware/auth");
const rateLimit_1 = require("../../middleware/rateLimit");
const csrf_1 = require("../../middleware/csrf");
const validation_1 = require("../../middleware/validation");
const router = (0, express_1.Router)();
router.use(auth_1.requireAuth);
router.use(csrf_1.generateCSRFToken);
router.post('/start', validation_1.sanitizeInput, csrf_1.validateCSRF, chatController_1.startChat);
router.get('/', chatController_1.getUserChats);
router.get('/:id', chatController_1.getChat);
router.post('/:id/draft', validation_1.sanitizeInput, csrf_1.validateCSRF, rateLimit_1.draftRateLimit, chatController_1.generateDraft);
router.post('/:id/send', validation_1.sanitizeInput, csrf_1.validateCSRF, chatController_1.sendMessage);
exports.default = router;
//# sourceMappingURL=chatRoutes.js.map