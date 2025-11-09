"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const discoverController_1 = require("./discoverController");
const jwtAuth_1 = require("../../middleware/jwtAuth");
const router = (0, express_1.Router)();
router.get('/trending', discoverController_1.getTrendingTwins);
router.get('/search', discoverController_1.searchTwins);
router.get('/recent', discoverController_1.getRecentTwins);
router.get('/popular', discoverController_1.getPopularTwins);
router.get('/most-liked', discoverController_1.getMostLikedTwins);
router.get('/most-followed', discoverController_1.getMostFollowedTwins);
router.get('/feed', discoverController_1.getDiscoverFeed);
router.get('/recommended', jwtAuth_1.optionalJWT, discoverController_1.getRecommendedTwins);
exports.default = router;
//# sourceMappingURL=discoverRoutes.js.map