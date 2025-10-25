import { Router } from 'express';
import { previewStyleChanges, getStyleComparison } from './styleSandboxController';
import { requireJWTFromCookie } from '../../middleware/jwtCookie';
import { generateCSRFToken, validateCSRF } from '../../middleware/csrf';

const router = Router();

// Apply authentication and CSRF protection
router.use(requireJWTFromCookie);
router.use(generateCSRFToken);

router.post('/:twinId/preview-style', validateCSRF, previewStyleChanges);
router.get('/:twinId/style-comparison', getStyleComparison);

export default router;