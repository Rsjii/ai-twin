import { Router } from 'express';
import { 
  makeTwinPublic, 
  makeTwinPrivate, 
  updateTwinProfile, 
  getPublicTwinProfile,
  getMyTwinProfile,
  checkTwinOwner
  // getPublicChatPage removed - moved to page routes
} from './publicTwinController';
import { requireJWTFromCookie } from '../../middleware/jwtCookie';
import { validateCSRF } from '../../middleware/csrf';

const router = Router();

// Public routes (no authentication required)
router.get('/public/:handle', getPublicTwinProfile);
// router.get('/chat/:twinId', getPublicChatPage); REMOVED - moved to page routes

// Protected routes (authentication required) - CSRF protection added
router.post('/make-public', requireJWTFromCookie, validateCSRF, makeTwinPublic);
router.post('/make-private', requireJWTFromCookie, validateCSRF, makeTwinPrivate);
router.put('/profile', requireJWTFromCookie, validateCSRF, updateTwinProfile);
router.get('/my-profile', requireJWTFromCookie, getMyTwinProfile);
router.get('/check-owner/:twinToken', requireJWTFromCookie, checkTwinOwner);

export default router;
