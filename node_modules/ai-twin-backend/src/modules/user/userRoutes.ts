import { Router } from 'express';
import { exportUserData, deleteAccount } from './userController';
import { requireJWTFromCookie } from '../../middleware/jwtCookie';
import { sanitizeInput } from '../../middleware/validation';

const router = Router();

// All routes require authentication
router.use(requireJWTFromCookie);
router.use(sanitizeInput);

router.get('/export-data', exportUserData);
router.delete('/account', deleteAccount);

export default router;