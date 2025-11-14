import { Router } from 'express';
import { extractJWTFromCookie } from '../middleware/jwtCookie';
import { generateCSRFToken } from '../middleware/csrf';
import * as supportPageController from '../controllers/supportPageController';

const router = Router();

// Support pages (public, but extract user for header consistency)
router.get('/help-center', extractJWTFromCookie, generateCSRFToken, supportPageController.getHelpCenter);
router.get('/contact', extractJWTFromCookie, generateCSRFToken, supportPageController.getContact);
router.get('/privacy', extractJWTFromCookie, generateCSRFToken, supportPageController.getPrivacy);
router.get('/terms', extractJWTFromCookie, generateCSRFToken, supportPageController.getTerms);

export default router;