import { Router } from 'express';
import { generateCSRFToken, validateCSRF } from '../middleware/csrf';
import { sanitizeInput } from '../middleware/validation';
import * as supportPageController from '../controllers/supportPageController';
import { asyncHandler } from '../middleware/errorHandler';
import { contactFormRateLimit, contactFormDailyLimit } from '../middleware/rateLimit';

const router = Router();

// Support pages (public, but extract user for header consistency)
router.get('/help-center', generateCSRFToken, asyncHandler(supportPageController.getHelpCenter));
router.get('/contact', generateCSRFToken, asyncHandler(supportPageController.getContact));
router.get('/privacy', generateCSRFToken, asyncHandler(supportPageController.getPrivacy));
router.get('/terms', generateCSRFToken, asyncHandler(supportPageController.getTerms));

// Contact form submission (POST) - ✅ ADDED RATE LIMITING
router.post('/contact', 
  generateCSRFToken, 
  sanitizeInput, 
  validateCSRF,
  contactFormDailyLimit,  // ✅ Daily limit first (10 per day per IP)
  contactFormRateLimit,   // ✅ Per-request limit (3 per 15 min per IP/email)
  asyncHandler(supportPageController.postContact)
);

export default router;