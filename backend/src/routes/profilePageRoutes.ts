import { Router } from 'express';
import { generateCSRFToken } from '../middleware/csrf';
import * as profilePageController from '../controllers/profilePageController';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

// Profile page
router.get('/profile', generateCSRFToken, asyncHandler(profilePageController.getProfile));

// Change Password page
router.get('/change-password', generateCSRFToken, asyncHandler(profilePageController.getChangePassword));

export default router;

