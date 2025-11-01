import { Router } from 'express';
import { extractJWTFromCookie } from '../middleware/jwtCookie';
import { generateCSRFToken } from '../middleware/csrf';
import * as profilePageController from '../controllers/profilePageController';

const router = Router();

// Profile page
router.get('/profile', extractJWTFromCookie, generateCSRFToken, profilePageController.getProfile);

// Change Password page
router.get('/change-password', extractJWTFromCookie, generateCSRFToken, profilePageController.getChangePassword);

export default router;

