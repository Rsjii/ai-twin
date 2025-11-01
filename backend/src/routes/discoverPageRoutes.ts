import { Router } from 'express';
import { requireJWTFromCookie } from '../middleware/jwtCookie';
import { generateCSRFToken } from '../middleware/csrf';
import * as discoverPageController from '../controllers/discoverPageController';

const router = Router();

// Discover page
router.get('/discover', discoverPageController.getDiscover);

// Onboarding page
router.get('/onboarding', requireJWTFromCookie, generateCSRFToken, discoverPageController.getOnboarding);

// Memory Management page
router.get('/memory-management', requireJWTFromCookie, generateCSRFToken, discoverPageController.getMemoryManagement);

export default router;

