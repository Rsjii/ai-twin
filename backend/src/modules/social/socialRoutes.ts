import { Router } from 'express';
import { 
  likeTwin, 
  unlikeTwin, 
  followTwin, 
  unfollowTwin,
  getTwinStats,
  getUserLikedTwins,
  getUserFollowedTwins,
  toggleLike,
  toggleFollow
} from './socialController';
import { requireJWTFromCookie, extractJWTFromCookie } from '../../middleware/jwtCookie';

const router = Router();

// Public routes (no authentication required, but extract JWT if available)
router.get('/stats/:twinId', extractJWTFromCookie, getTwinStats);

// Protected routes (authentication required)
router.post('/like', requireJWTFromCookie, likeTwin);
router.post('/unlike', requireJWTFromCookie, unlikeTwin);
router.post('/follow', requireJWTFromCookie, followTwin);
router.post('/unfollow', requireJWTFromCookie, unfollowTwin);
router.post('/toggle-like', requireJWTFromCookie, toggleLike);
router.post('/toggle-follow', requireJWTFromCookie, toggleFollow);
router.get('/my-likes', requireJWTFromCookie, getUserLikedTwins);
router.get('/my-follows', requireJWTFromCookie, getUserFollowedTwins);

export default router;
