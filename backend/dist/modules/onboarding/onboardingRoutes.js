"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const onboardingController_1 = require("./onboardingController");
const jwtCookie_1 = require("../../middleware/jwtCookie");
const csrf_1 = require("../../middleware/csrf");
const router = express_1.default.Router();
router.post('/create-enhanced-twin', jwtCookie_1.requireJWTFromCookie, csrf_1.generateCSRFToken, onboardingController_1.createEnhancedTwin);
exports.default = router;
//# sourceMappingURL=onboardingRoutes.js.map