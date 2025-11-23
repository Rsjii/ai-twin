import { Router } from 'express';
import { 
  getTrendingTwins,
  searchTwins,
  getRecommendedTwins,
  getRecentTwins,
  getMostLikedTwins,
  getMostFollowedTwins,
  getPopularTwins,
  getDiscoverFeed
} from './discoverController';
// ✅ Use extractJWTFromCookie instead of optionalJWT (cookie-based auth)
import { extractJWTFromCookie } from '../../middleware/jwtCookie';

const router = Router();

// ✅ Add JWT middleware to all routes (optional - doesn't require auth, but extracts user if available)
// Public routes (authentication optional for blocked user filtering)
router.get('/trending', extractJWTFromCookie, getTrendingTwins);
router.get('/search', extractJWTFromCookie, searchTwins);
router.get('/recent', extractJWTFromCookie, getRecentTwins);
router.get('/popular', extractJWTFromCookie, getPopularTwins);
router.get('/most-liked', extractJWTFromCookie, getMostLikedTwins);
router.get('/most-followed', extractJWTFromCookie, getMostFollowedTwins);
router.get('/feed', extractJWTFromCookie, getDiscoverFeed);

// Personalized routes (authentication optional for better recommendations)
router.get('/recommended', extractJWTFromCookie, getRecommendedTwins);

export default router;
