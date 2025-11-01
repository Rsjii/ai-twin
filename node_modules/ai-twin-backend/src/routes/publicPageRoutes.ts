import { Router } from 'express';
import { extractJWTFromCookie } from '../middleware/jwtCookie';
import { generateCSRFToken } from '../middleware/csrf';
import * as publicPageController from '../controllers/publicPageController';

const router = Router();

// Landing page
router.get('/', generateCSRFToken, publicPageController.getLanding);

// Simple test page (no middleware)
router.get('/simple', publicPageController.getSimple);

// Public Profile page
router.get('/@:handle', extractJWTFromCookie, generateCSRFToken, publicPageController.getPublicProfile);

// Public Profile alternative route
router.get('/p/:handle', generateCSRFToken, publicPageController.getPublicProfileAlt);

export default router;

