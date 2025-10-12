import { Router } from 'express';
import { 
  makeTwinPublic, 
  makeTwinPrivate, 
  updateTwinProfile, 
  getPublicTwinProfile,
  getMyTwinProfile 
} from './publicTwinController';
import { requireJWTFromCookie } from '../../middleware/jwtCookie';

const router = Router();

// Public routes (no authentication required)
router.get('/public/:handle', getPublicTwinProfile);

// Protected routes (authentication required)
router.post('/make-public', requireJWTFromCookie, makeTwinPublic);
router.post('/make-private', requireJWTFromCookie, makeTwinPrivate);
router.put('/profile', requireJWTFromCookie, updateTwinProfile);
router.get('/my-profile', requireJWTFromCookie, getMyTwinProfile);

export default router;
