import { Router } from 'express';
import { extractJWTFromCookie } from '../../middleware/jwtCookie';
import { 
  getMemoryStats, 
  retrieveMemories, 
  ingestMemories, 
  updateMemory, 
  deleteMemory 
} from './memoryController';

const router = Router();

// All routes require authentication
router.use(extractJWTFromCookie);

// Memory management routes
router.get('/:id/memory/stats', getMemoryStats);
router.get('/:id/memory/retrieve', retrieveMemories);
router.post('/:id/memory/ingest', ingestMemories);
router.put('/:id/memory/:memId', updateMemory);
router.delete('/:id/memory/:memId', deleteMemory);

export default router;