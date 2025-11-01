import { Router } from 'express';
import { extractJWTFromCookie } from '../middleware/jwtCookie';
import { generateCSRFToken } from '../middleware/csrf';
import * as dashboardPageController from '../controllers/dashboardPageController';

const router = Router();

// Dashboard page
router.get('/dashboard', extractJWTFromCookie, generateCSRFToken, dashboardPageController.getDashboard);

export default router;

