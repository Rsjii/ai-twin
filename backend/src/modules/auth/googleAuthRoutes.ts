import { Router } from 'express';
import { googleAuth, googleAuthCallback } from './googleAuthController';
import { googleOAuthRateLimit } from '../../middleware/rateLimit';

const router = Router();

// Google OAuth routes (no CSRF needed as these are GET requests to external service)
router.get('/google', googleOAuthRateLimit, googleAuth);
router.get('/google/callback', googleOAuthRateLimit, googleAuthCallback);

export default router;