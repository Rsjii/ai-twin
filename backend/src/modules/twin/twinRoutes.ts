import { Router } from 'express';
import { createTwin, getUserTwins, getTwinById, deleteTwin } from './twinController';
import { requireJWTFromCookie } from '../../middleware/jwtCookie';
import { generateCSRFToken, validateCSRF } from '../../middleware/csrf';
import { getTwinEditData, updateTwinStyle, updateTwinPersona, previewStyleChanges, aiEditRewrite, getTwinSettings, updateTwinSettings, aiToolsGenerate } from './twinEditController';
import {
  regeneratePrompt,
  getLearningData,
  updateLearningSettings,
  getTwinChatHistory,
  getLearningSettings,
} from './twinLearningController';
// ❌ MVP: training disabled
// import {
//   addManualTraining,
//   getChatMessages,
//   convertMessagesToTraining,
//   getTrainingEffectiveness,
//   convertToTraining,
//   getTrainingProgress
// } from './twinTrainingController';
import {
  getTemplates,
  getMilestones,
  setLearningGoal,
  getPerformanceMetrics,
  optimizeMemories,
  analyzePerformance,
  exportAnalytics,
  resetPerformance
} from './twinPerformanceController';
import {
  getLongTermMemories,
  addLongTermMemory,
  updateLongTermMemory,
  deleteLongTermMemory
} from './longTermMemoryController';
import { asyncHandler } from '../../middleware/errorHandler';
import { twinDeletionRateLimit, twinCreationRateLimit, twinDeletionSuccessRateLimit } from '../../middleware/rateLimit';

const router = Router();

// Apply authentication and CSRF protection
router.use(requireJWTFromCookie);
router.use(generateCSRFToken);
router.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  return validateCSRF(req, res, next);
});

// Twin routes
router.post('/create', requireJWTFromCookie, twinCreationRateLimit, asyncHandler(createTwin));
router.get('/', asyncHandler(getUserTwins));
// ✅ SECURITY: Use tokenized IDs for owner routes
router.get('/:twinToken', asyncHandler(getTwinById));
router.delete('/:twinToken', twinDeletionSuccessRateLimit, twinDeletionRateLimit, asyncHandler(deleteTwin));

// Twin edit endpoints
router.get('/:twinToken/edit-data', asyncHandler(getTwinEditData));
router.post('/:twinToken/update-style', asyncHandler(updateTwinStyle));
router.post('/:twinToken/update-persona', asyncHandler(updateTwinPersona));
router.post('/:twinToken/style-preview', asyncHandler(previewStyleChanges));

// ✅ AI Edit (draft rewrite)
router.post('/:twinToken/ai-edit', asyncHandler(aiEditRewrite));

// ✅ AI Tools (Tester + Rewrite) — required by your new `ai-edit.ejs`
router.post('/:twinToken/ai-tools', asyncHandler(aiToolsGenerate));

// ✅ Twin Settings
router.get('/:twinToken/settings', asyncHandler(getTwinSettings));
router.put('/:twinToken/settings', asyncHandler(updateTwinSettings));

// Twin learning endpoints
router.post('/:twinToken/regenerate-prompt', asyncHandler(regeneratePrompt));
router.get('/:twinToken/learning-data', asyncHandler(getLearningData));
router.get('/:twinToken/learning-settings', asyncHandler(getLearningSettings));
router.post('/:twinToken/learning-settings', asyncHandler(updateLearningSettings));
router.get('/:twinToken/chat-history', asyncHandler(getTwinChatHistory));

// Twin training endpoints
// ❌ MVP: training disabled (removes style_anchors dependency + saves cost)
// router.post('/:twinToken/manual-training', asyncHandler(addManualTraining));
// router.get('/:twinToken/chat/:chatId/messages', asyncHandler(getChatMessages));
// router.post('/:twinToken/convert-messages-to-training', asyncHandler(convertMessagesToTraining));
// router.get('/:twinToken/training/effectiveness', asyncHandler(getTrainingEffectiveness));
// router.post('/:twinToken/convert-to-training', asyncHandler(convertToTraining));
// router.get('/:twinToken/training-progress', asyncHandler(getTrainingProgress));

// Twin performance endpoints
router.get('/:twinToken/templates', asyncHandler(getTemplates));
router.get('/:twinToken/milestones', asyncHandler(getMilestones));
router.post('/:twinToken/goals', asyncHandler(setLearningGoal));
router.get('/:twinToken/performance', asyncHandler(getPerformanceMetrics));
router.post('/:twinToken/optimize/memories', asyncHandler(optimizeMemories));
router.post('/:twinToken/analyze/performance', asyncHandler(analyzePerformance));
router.get('/:twinToken/export/analytics', asyncHandler(exportAnalytics));
router.post('/:twinToken/reset/performance', asyncHandler(resetPerformance));

// Unified Long-Term Memory API
router.get('/:twinToken/long-term-memory', asyncHandler(getLongTermMemories));
router.post('/:twinToken/long-term-memory', asyncHandler(addLongTermMemory));
router.put('/:twinToken/long-term-memory/:key', asyncHandler(updateLongTermMemory));
router.delete('/:twinToken/long-term-memory/:key', asyncHandler(deleteLongTermMemory));

// Style Anchor API
// ❌ REMOVE Style Anchor API routes entirely

export default router;
