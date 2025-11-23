import { Router } from 'express';
import { extractJWTFromCookie } from '../../middleware/jwtCookie';
import {
  createRun,
  getRuns,
  updateRun,
  getRunStats,
  getQualityDashboard
} from './aiRunsController';

const router = Router();

// All routes require authentication
router.use(extractJWTFromCookie);

// AI runs CRUD
router.post('/:id/runs', createRun);
router.get('/:id/runs', getRuns);
router.put('/:id/runs/:runId', updateRun);

// Analytics and quality tracking
router.get('/:id/runs/stats', getRunStats);
router.get('/:id/runs/quality-dashboard', getQualityDashboard);

export default router;
