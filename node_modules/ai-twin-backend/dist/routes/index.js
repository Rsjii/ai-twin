"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authPageRoutes_1 = __importDefault(require("./authPageRoutes"));
const dashboardPageRoutes_1 = __importDefault(require("./dashboardPageRoutes"));
const profilePageRoutes_1 = __importDefault(require("./profilePageRoutes"));
const analyticsPageRoutes_1 = __importDefault(require("./analyticsPageRoutes"));
const twinPageRoutes_1 = __importDefault(require("./twinPageRoutes"));
const chatPageRoutes_1 = __importDefault(require("./chatPageRoutes"));
const discoverPageRoutes_1 = __importDefault(require("./discoverPageRoutes"));
const publicPageRoutes_1 = __importDefault(require("./publicPageRoutes"));
const supportPageRoutes_1 = __importDefault(require("./supportPageRoutes"));
const router = (0, express_1.Router)();
router.use(authPageRoutes_1.default);
router.use(dashboardPageRoutes_1.default);
router.use(profilePageRoutes_1.default);
router.use(analyticsPageRoutes_1.default);
router.use(twinPageRoutes_1.default);
router.use(chatPageRoutes_1.default);
router.use(discoverPageRoutes_1.default);
router.use(publicPageRoutes_1.default);
router.use(supportPageRoutes_1.default);
exports.default = router;
//# sourceMappingURL=index.js.map