import { Router } from 'express';
import { getTwinEditData, updateTwinStyle, updateTwinPersona } from './twinEditController';
import { requireJWTFromCookie } from '../../middleware/jwtCookie';
import { generateCSRFToken, validateCSRF } from '../../middleware/csrf';

const router = Router();

// Apply authentication and CSRF protection
router.use(requireJWTFromCookie);
router.use(generateCSRFToken);

router.get('/:id/edit-data', getTwinEditData);
router.post('/:id/update-style', validateCSRF, updateTwinStyle);
router.post('/:id/update-persona', validateCSRF, updateTwinPersona);

export default router;