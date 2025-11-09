"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const jwtCookie_1 = require("../../middleware/jwtCookie");
const enhancedChatController_1 = require("./enhancedChatController");
const feedbackController_1 = require("./feedbackController");
const router = (0, express_1.Router)();
router.use(jwtCookie_1.requireJWTFromCookie);
router.get('/:id', enhancedChatController_1.getChatHistory);
router.post('/:id/enhanced-reply', enhancedChatController_1.generateEnhancedReply);
router.post('/:id/style-correct', enhancedChatController_1.applyStyleCorrection);
router.post('/:id/add-anchor', enhancedChatController_1.addToAnchors);
router.post('/:chatId/regenerate', feedbackController_1.regenerateResponse);
router.post('/:chatId/feedback', feedbackController_1.submitChatFeedback);
router.get('/:chatId/feedback-status', feedbackController_1.getChatFeedbackStatus);
router.post('/:chatId/adjust-tone', feedbackController_1.adjustTone);
exports.default = router;
//# sourceMappingURL=enhancedChatRoutes.js.map