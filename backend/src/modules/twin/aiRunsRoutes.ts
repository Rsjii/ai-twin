import { Router } from 'express';
import { extractJWTFromCookie } from '../../middleware/jwtCookie';
import { validateCSRF } from '../../middleware/csrf';
import {
  createRun,
  getRuns,
  updateRun,
  getRunStats,
  getQualityDashboard
} from './aiRunsController';

const router = Router();

// All routes require authentication (optional - extractJWTFromCookie)
router.use(extractJWTFromCookie);

// AI runs CRUD - CSRF protection added for POST/PUT
router.post('/:id/runs', validateCSRF, createRun);
router.get('/:id/runs', getRuns);
router.put('/:id/runs/:runId', validateCSRF, updateRun);

// Analytics and quality tracking
router.get('/:id/runs/stats', getRunStats);
router.get('/:id/runs/quality-dashboard', getQualityDashboard);

export default router;
