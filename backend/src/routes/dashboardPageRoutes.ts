import { Router } from 'express';
import { generateCSRFToken } from '../middleware/csrf';
import * as dashboardPageController from '../controllers/dashboardPageController';

const router = Router();

// Dashboard page
router.get('/dashboard', generateCSRFToken, dashboardPageController.getDashboard);

export default router;

