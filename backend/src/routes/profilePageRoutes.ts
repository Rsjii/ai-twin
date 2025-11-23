import { Router } from 'express';
import { generateCSRFToken } from '../middleware/csrf';
import * as profilePageController from '../controllers/profilePageController';

const router = Router();

// Profile page
router.get('/profile', generateCSRFToken, profilePageController.getProfile);

// Change Password page
router.get('/change-password', generateCSRFToken, profilePageController.getChangePassword);

export default router;

