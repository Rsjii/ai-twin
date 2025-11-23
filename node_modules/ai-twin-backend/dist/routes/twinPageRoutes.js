"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const jwtCookie_1 = require("../middleware/jwtCookie");
const csrf_1 = require("../middleware/csrf");
const auth_1 = require("../middleware/auth");
const twinPageController = __importStar(require("../controllers/twinPageController"));
const twinManagePageController = __importStar(require("../controllers/twinManagePageController"));
const twinPublicChatHistoryPageController_1 = require("../controllers/twinPublicChatHistoryPageController");
const router = (0, express_1.Router)();
router.get('/my-twins', jwtCookie_1.requireJWTFromCookie, csrf_1.generateCSRFToken, twinPageController.getMyTwins);
router.get('/twin/create', auth_1.optionalAuth, csrf_1.generateCSRFToken, twinPageController.getTwinCreate);
router.get('/twin/:id/ai-edit', jwtCookie_1.requireJWTFromCookie, csrf_1.generateCSRFToken, twinPageController.getTwinAiEdit);
router.get('/twin/:id/style-customize', jwtCookie_1.requireJWTFromCookie, csrf_1.generateCSRFToken, twinPageController.getTwinStyleCustomize);
router.get('/twin/:id/learning-dashboard', jwtCookie_1.requireJWTFromCookie, csrf_1.generateCSRFToken, twinPageController.getTwinLearningDashboard);
router.get('/twin/manage', jwtCookie_1.requireJWTFromCookie, csrf_1.generateCSRFToken, twinManagePageController.getTwinManage);
router.get('/twin/:id/public-chat-history', jwtCookie_1.requireJWTFromCookie, csrf_1.generateCSRFToken, twinPublicChatHistoryPageController_1.getTwinPublicChatHistoryPage);
router.get('/twin/:twinId/view-chat-history/:chatId', jwtCookie_1.requireJWTFromCookie, csrf_1.generateCSRFToken, twinPublicChatHistoryPageController_1.getViewPublicChatHistoryPage);
exports.default = router;
//# sourceMappingURL=twinPageRoutes.js.map