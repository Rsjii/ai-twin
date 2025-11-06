import { Router } from 'express';
import { googleAuth, googleAuthCallback } from './googleAuthController';

const router = Router();

// Google OAuth routes (no CSRF needed as these are GET requests to external service)
router.get('/google', googleAuth);
router.get('/google/callback', googleAuthCallback);

export default router;