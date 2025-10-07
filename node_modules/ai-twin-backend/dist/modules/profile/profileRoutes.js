"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const profileController_1 = require("./profileController");
const uploadController_1 = require("./uploadController");
const csrf_1 = require("../../middleware/csrf");
const validation_1 = require("../../middleware/validation");
const jwtCookie_1 = require("../../middleware/jwtCookie");
const multer_1 = __importDefault(require("multer"));
const router = (0, express_1.Router)();
router.get('/p/:handle', profileController_1.getPublicProfile);
router.use(csrf_1.generateCSRFToken);
const upload = (0, multer_1.default)();
router.post('/handle', validation_1.sanitizeInput, csrf_1.validateCSRF, jwtCookie_1.requireJWTFromCookie, profileController_1.updateHandle);
router.post('/link', csrf_1.validateCSRF, jwtCookie_1.requireJWTFromCookie, profileController_1.generateProfileLink);
router.post('/share', csrf_1.validateCSRF, jwtCookie_1.requireJWTFromCookie, profileController_1.logProfileShare);
router.post('/update', upload.none(), csrf_1.validateCSRF, jwtCookie_1.requireJWTFromCookie, profileController_1.updateProfile);
router.post('/upload', uploadController_1.uploadProfileImage, uploadController_1.handleProfileImageUpload);
exports.default = router;
//# sourceMappingURL=profileRoutes.js.map