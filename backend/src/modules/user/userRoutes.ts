import { Router } from 'express';
import { exportUserData, deleteAccount } from './userController';
import { requireJWTFromCookie } from '../../middleware/jwtCookie';
import { sanitizeInput } from '../../middleware/validation';
import { generateCSRFToken, validateCSRF } from '../../middleware/csrf';

const router = Router();

// All routes require authentication and CSRF protection
router.use(requireJWTFromCookie);
router.use(sanitizeInput);
router.use(generateCSRFToken);
router.use(validateCSRF); // ✅ CSRF protection for DELETE route

router.get('/export-data', exportUserData);
router.delete('/account', deleteAccount);

export default router;