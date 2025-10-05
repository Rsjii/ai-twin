import { Router } from 'express';
import { updateHandle, getPublicProfile, generateProfileLink, logProfileShare, updateProfile } from './profileController';
import { optionalAuth } from '../../middleware/auth';
import { generateCSRFToken, validateCSRF } from '../../middleware/csrf';
import { sanitizeInput } from '../../middleware/validation';
import { authenticateJWT } from '../../middleware/jwtAuth';

const router = Router();

// Public profile route (no auth required)
router.get('/p/:handle', getPublicProfile);

// Apply CSRF token generation to all routes
router.use(generateCSRFToken);

// Protected routes (JWT-based auth)
router.post('/handle', sanitizeInput, validateCSRF, authenticateJWT, updateHandle);
router.post('/link', validateCSRF, authenticateJWT, generateProfileLink);
router.post('/share', validateCSRF, authenticateJWT, logProfileShare);
router.post('/update', sanitizeInput, validateCSRF, authenticateJWT, updateProfile);

export default router;
