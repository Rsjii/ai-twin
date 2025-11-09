"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const jwtCookie_1 = require("../../middleware/jwtCookie");
const memoryController_1 = require("./memoryController");
const router = (0, express_1.Router)();
router.use(jwtCookie_1.extractJWTFromCookie);
router.get('/:id/memory/stats', memoryController_1.getMemoryStats);
router.get('/:id/memory/retrieve', memoryController_1.retrieveMemories);
router.post('/:id/memory/ingest', memoryController_1.ingestMemories);
router.put('/:id/memory/:memId', memoryController_1.updateMemory);
router.delete('/:id/memory/:memId', memoryController_1.deleteMemory);
exports.default = router;
//# sourceMappingURL=memoryRoutes.js.map