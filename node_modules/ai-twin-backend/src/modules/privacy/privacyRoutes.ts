import { Router } from 'express';
import { 
  updatePrivacySettings,
  getPrivacySettings,
  blockUser,
  unblockUser,
  isUserBlocked,
  getPrivacyAnalytics
} from './privacyController';
import { requireJWTFromCookie } from '../../middleware/jwtCookie';

const router = Router();

// Protected routes (authentication required)
router.put('/settings', requireJWTFromCookie, updatePrivacySettings);
router.get('/settings/:twinId', requireJWTFromCookie, getPrivacySettings);
router.post('/block', requireJWTFromCookie, blockUser);
router.post('/unblock', requireJWTFromCookie, unblockUser);
router.get('/analytics/:twinId', requireJWTFromCookie, getPrivacyAnalytics);

// Public route (no authentication required)
router.get('/check-blocked/:twinId/:userId', isUserBlocked);

export default router;
