import { backgroundLearningService } from './backgroundLearning';
import { logger } from '../config/logger';
import cron from 'node-cron';
import { systemPromptUpdater } from './systemPromptUpdater';

export class LearningScheduler {
  private intervalId: NodeJS.Timeout | null = null;

  /**
   * Start the background learning scheduler
   */
  start(): void {
    // ✅ Run background learning every 12 hours (was 6 hours)
    // This updates style vector and prompt based on user feedback
    this.intervalId = setInterval(async () => {
      try {
        logger.info('Running scheduled background learning (updating style vector & prompt from feedback)');
        await backgroundLearningService.processAllTwins();
      } catch (error) {
        logger.error('Scheduled background learning error:', error);
      }
    }, 12 * 60 * 60 * 1000); // ✅ 12 hours (was 6 hours)

    // ✅ Keep system prompt updates weekly (Sunday 2 AM)
    cron.schedule('0 2 * * 0', async () => {
      try {
        logger.info('Running weekly system prompt updates');
        await systemPromptUpdater.updateAllTwins();
      } catch (error) {
        logger.error('Weekly system prompt update error:', error);
      }
    });

    logger.info('Background learning scheduler started (12 hour interval)');
  }
  /**
   * Stop the background learning scheduler
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('Background learning scheduler stopped');
    }
  }
}

export const learningScheduler = new LearningScheduler();