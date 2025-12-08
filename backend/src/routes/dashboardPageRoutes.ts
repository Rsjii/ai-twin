import { Router } from 'express';
import { generateCSRFToken } from '../middleware/csrf';
import * as dashboardPageController from '../controllers/dashboardPageController';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

// Dashboard page
router.get('/dashboard', generateCSRFToken, asyncHandler(dashboardPageController.getDashboard));

export default router;

