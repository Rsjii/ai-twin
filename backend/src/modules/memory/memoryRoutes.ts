import { Router } from 'express';
import { extractJWTFromCookie } from '../../middleware/jwtCookie';
import { 
  getMemoryStats, 
  retrieveMemories, 
  ingestMemories
} from './memoryController';

const router = Router();

// All routes require authentication
router.use(extractJWTFromCookie);

// Memory management routes
router.get('/:twinToken/memory/stats', getMemoryStats);
router.get('/:twinToken/memory/retrieve', retrieveMemories);
router.post('/:twinToken/memory/ingest', ingestMemories);

export default router;