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
// ✅ CSRF should protect state-changing requests only (NOT GET/HEAD/OPTIONS)
router.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  return validateCSRF(req, res, next);
});

router.get('/export-data', exportUserData);
router.delete('/account', deleteAccount);

export default router;