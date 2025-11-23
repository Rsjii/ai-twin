import { Router } from 'express';
import { updateHandle, getPublicProfile, generateProfileLink, logProfileShare, updateProfile } from './profileController';
import { uploadProfileImage, handleProfileImageUpload } from './uploadController';
import { optionalAuth } from '../../middleware/auth';
import { generateCSRFToken, validateCSRF } from '../../middleware/csrf';
import { sanitizeInput } from '../../middleware/validation';
import { requireJWTFromCookie } from '../../middleware/jwtCookie';
import multer from 'multer';

const router = Router();

// Public profile route (no auth required)
router.get('/p/:handle', getPublicProfile);

// Apply CSRF token generation to all routes
router.use(generateCSRFToken);

// Configure multer for form data parsing
const upload = multer();

// Protected routes (JWT cookie-based auth)
router.post('/handle', sanitizeInput, validateCSRF, requireJWTFromCookie, updateHandle);
router.post('/link', validateCSRF, requireJWTFromCookie, generateProfileLink);
router.post('/share', validateCSRF, requireJWTFromCookie, logProfileShare);
router.post('/update', upload.single('profileImageFile'), validateCSRF, requireJWTFromCookie, updateProfile);
router.post('/upload', uploadProfileImage, handleProfileImageUpload);

export default router;
