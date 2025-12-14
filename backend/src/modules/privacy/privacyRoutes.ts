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
import { generateCSRFToken, validateCSRF } from '../../middleware/csrf';

const router = Router();

// Apply CSRF protection to authenticated routes
router.use(generateCSRFToken);

// Protected routes (authentication required) - CSRF protection added
router.put('/settings', requireJWTFromCookie, validateCSRF, updatePrivacySettings);
router.get('/settings/:twinId', requireJWTFromCookie, getPrivacySettings);
router.post('/block', requireJWTFromCookie, validateCSRF, blockUser);
router.post('/unblock', requireJWTFromCookie, validateCSRF, unblockUser);
router.get('/analytics/:twinId', requireJWTFromCookie, getPrivacyAnalytics);

// Public route (no authentication required)
router.get('/check-blocked/:twinId/:userId', isUserBlocked);

export default router;
