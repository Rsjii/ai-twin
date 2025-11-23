"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const discoverController_1 = require("./discoverController");
const jwtCookie_1 = require("../../middleware/jwtCookie");
const router = (0, express_1.Router)();
router.get('/trending', jwtCookie_1.extractJWTFromCookie, discoverController_1.getTrendingTwins);
router.get('/search', jwtCookie_1.extractJWTFromCookie, discoverController_1.searchTwins);
router.get('/recent', jwtCookie_1.extractJWTFromCookie, discoverController_1.getRecentTwins);
router.get('/popular', jwtCookie_1.extractJWTFromCookie, discoverController_1.getPopularTwins);
router.get('/most-liked', jwtCookie_1.extractJWTFromCookie, discoverController_1.getMostLikedTwins);
router.get('/most-followed', jwtCookie_1.extractJWTFromCookie, discoverController_1.getMostFollowedTwins);
router.get('/feed', jwtCookie_1.extractJWTFromCookie, discoverController_1.getDiscoverFeed);
router.get('/recommended', jwtCookie_1.extractJWTFromCookie, discoverController_1.getRecommendedTwins);
exports.default = router;
//# sourceMappingURL=discoverRoutes.js.map