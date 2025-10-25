import { Router } from 'express';
import { submitResponseFeedback, getFeedbackStats } from './feedbackController';
import { requireJWTFromCookie } from '../../middleware/jwtCookie';
import { generateCSRFToken, validateCSRF } from '../../middleware/csrf';

const router = Router();

// Apply authentication and CSRF protection
router.use(requireJWTFromCookie);
router.use(generateCSRFToken);

router.post('/:id/feedback', validateCSRF, submitResponseFeedback);
router.get('/twin/:twinId/feedback-stats', getFeedbackStats);

export default router;