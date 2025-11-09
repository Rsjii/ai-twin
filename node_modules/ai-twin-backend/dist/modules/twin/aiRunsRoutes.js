"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const jwtCookie_1 = require("../../middleware/jwtCookie");
const aiRunsController_1 = require("./aiRunsController");
const router = (0, express_1.Router)();
router.use(jwtCookie_1.extractJWTFromCookie);
router.post('/:id/runs', aiRunsController_1.createRun);
router.get('/:id/runs', aiRunsController_1.getRuns);
router.put('/:id/runs/:runId', aiRunsController_1.updateRun);
router.get('/:id/runs/stats', aiRunsController_1.getRunStats);
router.get('/:id/runs/quality-dashboard', aiRunsController_1.getQualityDashboard);
exports.default = router;
//# sourceMappingURL=aiRunsRoutes.js.map