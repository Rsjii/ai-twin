import { Router } from 'express';
import { createTwin, getUserTwins, getTwinById } from './twinController';
import { requireJWTFromCookie } from '../../middleware/jwtCookie';
import { generateCSRFToken } from '../../middleware/csrf';
import { getTwinEditData, updateTwinStyle, updateTwinPersona, previewStyleChanges } from './twinEditController';
import {
  regeneratePrompt,
  getLearningData,
  updateLearningSettings,
  getTwinChatHistory
} from './twinLearningController';
import {
  addManualTraining,
  getChatMessages,
  convertMessagesToTraining,
  getTrainingEffectiveness,
  convertToTraining,
  getTrainingProgress
} from './twinTrainingController';
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
import {
  getTwinAnchors,
  addTwinAnchor,
  updateTwinAnchor,
  deleteTwinAnchor,
  getTwinPhrases
} from './styleAnchorController';

const router = Router();

// Apply authentication and CSRF protection
router.use(requireJWTFromCookie);
router.use(generateCSRFToken);

// Twin routes
router.post('/create', requireJWTFromCookie, createTwin);
router.get('/', getUserTwins);
router.get('/:id', getTwinById);

// Twin edit endpoints
router.get('/:id/edit-data', getTwinEditData);
router.post('/:id/update-style', updateTwinStyle);
router.post('/:id/update-persona', updateTwinPersona);
router.post('/:id/style-preview', previewStyleChanges);

// Twin learning endpoints
router.post('/:id/regenerate-prompt', regeneratePrompt);
router.get('/:id/learning-data', getLearningData);
router.post('/:id/learning-settings', updateLearningSettings);
router.get('/:id/chat-history', getTwinChatHistory);

// Twin training endpoints
router.post('/:id/manual-training', addManualTraining);
router.get('/:id/chat/:chatId/messages', getChatMessages);
router.post('/:id/convert-messages-to-training', convertMessagesToTraining);
router.get('/:id/training/effectiveness', getTrainingEffectiveness);
router.post('/:id/convert-to-training', convertToTraining);
router.get('/:id/training-progress', getTrainingProgress);

// Twin performance endpoints
router.get('/:id/templates', getTemplates);
router.get('/:id/milestones', getMilestones);
router.post('/:id/goals', setLearningGoal);
router.get('/:id/performance', getPerformanceMetrics);
router.post('/:id/optimize/memories', optimizeMemories);
router.post('/:id/analyze/performance', analyzePerformance);
router.get('/:id/export/analytics', exportAnalytics);
router.post('/:id/reset/performance', resetPerformance);

// Unified Long-Term Memory API
router.get('/:id/long-term-memory', requireJWTFromCookie, getLongTermMemories);
router.post('/:id/long-term-memory', requireJWTFromCookie, addLongTermMemory);
router.put('/:id/long-term-memory/:key', requireJWTFromCookie, updateLongTermMemory);
router.delete('/:id/long-term-memory/:key', requireJWTFromCookie, deleteLongTermMemory);

// Style Anchor API
router.get('/:id/style-anchors', getTwinAnchors);
router.get('/:id/style-anchors/phrases', getTwinPhrases);
router.post('/:id/style-anchors', addTwinAnchor);
router.put('/:id/style-anchors/:anchorId', updateTwinAnchor);
router.delete('/:id/style-anchors/:anchorId', deleteTwinAnchor);

export default router;
