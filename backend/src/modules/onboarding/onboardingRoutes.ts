import express from 'express';
import { createEnhancedTwin } from './onboardingController';
import { requireJWTFromCookie } from '../../middleware/jwtCookie';
import { generateCSRFToken } from '../../middleware/csrf';

const router = express.Router();

// Enhanced onboarding route
router.post('/create-enhanced-twin', 
  requireJWTFromCookie,
  generateCSRFToken,
  createEnhancedTwin
);

export default router;
