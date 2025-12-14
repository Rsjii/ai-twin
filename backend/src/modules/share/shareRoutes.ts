import { Router } from 'express';
import { 
  generateShareLink,
  getShareAnalytics,
  trackShareClick,
  getPopularSharePlatforms,
  generateQRCode,
  getShareableContent
} from './shareController';
import { requireJWTFromCookie } from '../../middleware/jwtCookie';
import { validateCSRF } from '../../middleware/csrf';

const router = Router();

// Protected routes (authentication required) - CSRF protection added
router.post('/generate', requireJWTFromCookie, validateCSRF, generateShareLink);
router.get('/analytics/:twinId', requireJWTFromCookie, getShareAnalytics);
router.get('/qr/:twinId', requireJWTFromCookie, generateQRCode);

// Public routes (no authentication required)
router.post('/track-click', trackShareClick);
router.get('/popular-platforms', getPopularSharePlatforms);
router.get('/content/:handle', getShareableContent);

export default router;
