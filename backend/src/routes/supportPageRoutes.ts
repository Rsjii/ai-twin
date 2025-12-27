import { Router } from 'express';
import { generateCSRFToken, validateCSRF } from '../middleware/csrf';
import { sanitizeInput } from '../middleware/validation';
import * as supportPageController from '../controllers/supportPageController';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

// Support pages (public, but extract user for header consistency)
router.get('/help-center', generateCSRFToken, asyncHandler(supportPageController.getHelpCenter));
router.get('/contact', generateCSRFToken, asyncHandler(supportPageController.getContact));
router.get('/privacy', generateCSRFToken, asyncHandler(supportPageController.getPrivacy));
router.get('/terms', generateCSRFToken, asyncHandler(supportPageController.getTerms));

// Contact form submission (POST)
router.post('/contact', generateCSRFToken, sanitizeInput, validateCSRF, asyncHandler(supportPageController.postContact));

export default router;