"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const userController_1 = require("./userController");
const jwtCookie_1 = require("../../middleware/jwtCookie");
const validation_1 = require("../../middleware/validation");
const router = (0, express_1.Router)();
router.use(jwtCookie_1.requireJWTFromCookie);
router.use(validation_1.sanitizeInput);
router.get('/export-data', userController_1.exportUserData);
router.delete('/account', userController_1.deleteAccount);
exports.default = router;
//# sourceMappingURL=userRoutes.js.map