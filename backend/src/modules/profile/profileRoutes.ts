import { Router } from 'express';
import { updateHandle, getPublicProfile, generateProfileLink, logProfileShare } from './profileController';
import { requireAuth, optionalAuth } from '../../middleware/auth';
import { generateCSRFToken, validateCSRF } from '../../middleware/csrf';
import { sanitizeInput } from '../../middleware/validation';

const router = Router();

// Public profile route (no auth required)
router.get('/p/:handle', getPublicProfile);

// Protected routes
router.use(requireAuth);
router.use(generateCSRFToken);

router.post('/handle', sanitizeInput, validateCSRF, updateHandle);
router.post('/link', validateCSRF, generateProfileLink);
router.post('/share', validateCSRF, logProfileShare);

export default router;
