import { Router } from 'express';
import { 
  getTrendingTwins,
  searchTwins,
  getRecommendedTwins,
  getRecentTwins,
  getMostLikedTwins,
  getMostFollowedTwins,
  getDiscoverFeed
} from './discoverController';
import { optionalJWT } from '../../middleware/jwtAuth';

const router = Router();

// Public routes (no authentication required)
router.get('/trending', getTrendingTwins);
router.get('/search', searchTwins);
router.get('/recent', getRecentTwins);
router.get('/most-liked', getMostLikedTwins);
router.get('/most-followed', getMostFollowedTwins);
router.get('/feed', getDiscoverFeed);

// Personalized routes (authentication optional for better recommendations)
router.get('/recommended', optionalJWT, getRecommendedTwins);

export default router;
