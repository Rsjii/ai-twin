import { Router } from 'express';
import { 
  generateShareLink,
  getShareAnalytics,
  trackShareClick,
  getPopularSharePlatforms,
  generateQRCode,
  getShareableContent
} from './shareController';
import { requireJWTFromCookie, extractJWTFromCookie } from '../../middleware/jwtCookie';
import { validateCSRF, validateCSRFOptional } from '../../middleware/csrf';

const router = Router();

// ✅ FIX: Optional auth + optional CSRF for share - anonymous users can also share
router.post('/generate', extractJWTFromCookie, validateCSRFOptional, generateShareLink);
router.get('/analytics/:twinId', requireJWTFromCookie, getShareAnalytics);
router.get('/qr/:twinId', requireJWTFromCookie, generateQRCode);

// Public routes (no authentication required)
router.post('/track-click', trackShareClick);
router.get('/popular-platforms', getPopularSharePlatforms);
router.get('/content/:handle', getShareableContent);

export default router;
