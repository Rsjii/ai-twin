import { Router } from 'express';
import { createInvite, acceptInvite, processInviteAcceptance } from './inviteController';
import { requireAuth, optionalAuth } from '../../middleware/auth';
import { generateCSRFToken, validateCSRF } from '../../middleware/csrf';
import { sanitizeInput } from '../../middleware/validation';

const router = Router();

// Public invite acceptance route
router.get('/accept', acceptInvite);

// Protected routes
router.use(requireAuth);
router.use(generateCSRFToken);

router.post('/create', validateCSRF, createInvite);
router.post('/process', sanitizeInput, validateCSRF, processInviteAcceptance);

export default router;
