import { Router } from 'express';
import { extractJWTFromCookie } from '../../middleware/jwtCookie';

const router = Router();

// All routes require authentication
router.use(extractJWTFromCookie);

// Temporary placeholder routes
router.post('/:id/memory/ingest', (req, res) => {
  res.json({ message: 'Memory ingest endpoint - coming soon' });
});

router.get('/:id/memory/retrieve', (req, res) => {
  res.json({ message: 'Memory retrieve endpoint - coming soon' });
});

router.get('/:id/memory/stats', (req, res) => {
  res.json({ message: 'Memory stats endpoint - coming soon' });
});

export default router;