import { Router } from 'express';
import { createTwin, getUserTwins, getTwinById } from './twinController';
import { requireAuth } from '../../middleware/auth';
import { twinCreationRateLimit } from '../../middleware/rateLimit';
import { generateCSRFToken, validateCSRF } from '../../middleware/csrf';
import { sanitizeInput } from '../../middleware/validation';

const router = Router();

// Apply authentication and CSRF protection
router.use(requireAuth);
router.use(generateCSRFToken);

// Twin routes
router.post('/create', sanitizeInput, validateCSRF, twinCreationRateLimit, createTwin);
router.get('/', getUserTwins);
router.get('/:id', getTwinById);

export default router;
