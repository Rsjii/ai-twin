import { Router } from 'express';
import { createTwin, getUserTwins, getTwinById } from './twinController';
import { requireJWTFromCookie } from '../../middleware/jwtCookie';
import { generateCSRFToken } from '../../middleware/csrf';
import { getTwinEditData, updateTwinStyle, updateTwinPersona } from './twinEditController';

const router = Router();

// Apply authentication and CSRF protection
router.use(requireJWTFromCookie);
router.use(generateCSRFToken);

// Twin routes
router.post('/create', requireJWTFromCookie, createTwin);
router.get('/', getUserTwins);
router.get('/:id', getTwinById);

// Twin edit endpoints
router.get('/:id/edit-data', getTwinEditData);
router.post('/:id/update-style', updateTwinStyle);
router.post('/:id/update-persona', updateTwinPersona);

export default router;
