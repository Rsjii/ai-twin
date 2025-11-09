"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const socialController_1 = require("./socialController");
const jwtCookie_1 = require("../../middleware/jwtCookie");
const router = (0, express_1.Router)();
router.get('/stats/:twinId', socialController_1.getTwinStats);
router.post('/like', jwtCookie_1.requireJWTFromCookie, socialController_1.likeTwin);
router.post('/unlike', jwtCookie_1.requireJWTFromCookie, socialController_1.unlikeTwin);
router.post('/follow', jwtCookie_1.requireJWTFromCookie, socialController_1.followTwin);
router.post('/unfollow', jwtCookie_1.requireJWTFromCookie, socialController_1.unfollowTwin);
router.post('/toggle-like', jwtCookie_1.requireJWTFromCookie, socialController_1.toggleLike);
router.post('/toggle-follow', jwtCookie_1.requireJWTFromCookie, socialController_1.toggleFollow);
router.get('/my-likes', jwtCookie_1.requireJWTFromCookie, socialController_1.getUserLikedTwins);
router.get('/my-follows', jwtCookie_1.requireJWTFromCookie, socialController_1.getUserFollowedTwins);
exports.default = router;
//# sourceMappingURL=socialRoutes.js.map