import { Router } from 'express';
import { extractJWTFromCookie, requireJWTFromCookie } from '../middleware/jwtCookie';
import { generateCSRFToken } from '../middleware/csrf';
import * as discoverPageController from '../controllers/discoverPageController';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

// Discover page
router.get('/discover', generateCSRFToken, asyncHandler(discoverPageController.getDiscover));

// Onboarding page
router.get('/onboarding', requireJWTFromCookie, generateCSRFToken, asyncHandler(discoverPageController.getOnboarding));

// Memory Management page
router.get('/memory-management', requireJWTFromCookie, generateCSRFToken, asyncHandler(discoverPageController.getMemoryManagement));

export default router;

