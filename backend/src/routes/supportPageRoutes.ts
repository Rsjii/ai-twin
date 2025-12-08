import { Router } from 'express';
import { generateCSRFToken } from '../middleware/csrf';
import * as supportPageController from '../controllers/supportPageController';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

// Support pages (public, but extract user for header consistency)
router.get('/help-center', generateCSRFToken, asyncHandler(supportPageController.getHelpCenter));
router.get('/contact', generateCSRFToken, asyncHandler(supportPageController.getContact));
router.get('/privacy', generateCSRFToken, asyncHandler(supportPageController.getPrivacy));
router.get('/terms', generateCSRFToken, asyncHandler(supportPageController.getTerms));

export default router;