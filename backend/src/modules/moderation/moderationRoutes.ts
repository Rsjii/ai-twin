import { Router } from 'express';
import { 
  moderateContent,
  reportContent,
  getModerationStats
} from './moderationController';
import { requireJWTFromCookie } from '../../middleware/jwtCookie';

const router = Router();

// Public routes (no authentication required for content moderation)
router.post('/moderate', moderateContent);

// Protected routes (authentication required)
router.post('/report', requireJWTFromCookie, reportContent);
router.get('/stats', requireJWTFromCookie, getModerationStats);

export default router;
