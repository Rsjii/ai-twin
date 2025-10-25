import { backgroundLearningService } from './backgroundLearning';
import { logger } from '../config/logger';

export class LearningScheduler {
  private intervalId: NodeJS.Timeout | null = null;

  /**
   * Start the background learning scheduler
   */
  start(): void {
    // Run every 6 hours
    this.intervalId = setInterval(async () => {
      try {
        logger.info('Running scheduled background learning');
        await backgroundLearningService.processAllTwins();
      } catch (error) {
        logger.error('Scheduled background learning error:', error);
      }
    }, 6 * 60 * 60 * 1000); // 6 hours

    logger.info('Background learning scheduler started');
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