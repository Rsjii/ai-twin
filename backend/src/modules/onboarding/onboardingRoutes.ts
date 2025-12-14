import express from 'express';
import { createEnhancedTwin } from './onboardingController';
import { requireJWTFromCookie } from '../../middleware/jwtCookie';
import { generateCSRFToken, validateCSRF } from '../../middleware/csrf';

const router = express.Router();

// Enhanced onboarding route - CSRF protection added
router.post('/create-enhanced-twin', 
  requireJWTFromCookie,
  generateCSRFToken,
  validateCSRF, // ✅ CSRF protection for POST
  createEnhancedTwin
);

export default router;
