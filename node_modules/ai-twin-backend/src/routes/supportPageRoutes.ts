import { Router } from 'express';
import { generateCSRFToken } from '../middleware/csrf';
import * as supportPageController from '../controllers/supportPageController';

const router = Router();

// Support pages (public, but extract user for header consistency)
router.get('/help-center', generateCSRFToken, supportPageController.getHelpCenter);
router.get('/contact', generateCSRFToken, supportPageController.getContact);
router.get('/privacy', generateCSRFToken, supportPageController.getPrivacy);
router.get('/terms', generateCSRFToken, supportPageController.getTerms);

export default router;