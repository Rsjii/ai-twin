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
  toggleFollow,
  getTwinLikers,
  getTwinFollowers,
  getTwinChatters
} from './socialController';
import { requireJWTFromCookie, extractJWTFromCookie } from '../../middleware/jwtCookie';
import { generateCSRFToken, validateCSRF } from '../../middleware/csrf';

const router = Router();

// Apply CSRF protection to authenticated routes
router.use(generateCSRFToken);

// Public routes (no authentication required, but extract JWT if available)
router.get('/stats/:twinToken', extractJWTFromCookie, getTwinStats);

// Protected routes (authentication required) - CSRF protection added
router.post('/like', requireJWTFromCookie, validateCSRF, likeTwin);
router.post('/unlike', requireJWTFromCookie, validateCSRF, unlikeTwin);
router.post('/follow', requireJWTFromCookie, validateCSRF, followTwin);
router.post('/unfollow', requireJWTFromCookie, validateCSRF, unfollowTwin);
router.post('/toggle-like', requireJWTFromCookie, validateCSRF, toggleLike);
router.post('/toggle-follow', requireJWTFromCookie, validateCSRF, toggleFollow);
router.get('/my-likes', requireJWTFromCookie, getUserLikedTwins);
router.get('/my-follows', requireJWTFromCookie, getUserFollowedTwins);
router.get('/twin/:twinToken/likers', extractJWTFromCookie, getTwinLikers);
router.get('/twin/:twinToken/followers', extractJWTFromCookie, getTwinFollowers);
router.get('/twin/:twinToken/chatters', extractJWTFromCookie, getTwinChatters);

export default router;
