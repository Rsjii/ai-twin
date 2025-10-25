import { db } from '../config/database';
import { logger } from '../config/logger';

export class BackgroundLearningService {
  /**
   * Check if twin needs learning update
   */
  async shouldUpdateTwin(twinId: string): Promise<boolean> {
    try {
      // Get chat count
      const chatCountResult = await db.query(`
        SELECT COUNT(*) as count FROM "Chat" WHERE "twinId" = $1
      `, [twinId]);
      
      const chatCount = parseInt(chatCountResult.rows[0].count);
      
      // Get last update time
      const lastUpdateResult = await db.query(`
        SELECT "last_updated", "createdAt" FROM "Twin" WHERE id = $1
      `, [twinId]);
      
      if (lastUpdateResult.rows.length === 0) {
        return false;
      }
      
      const lastUpdate = lastUpdateResult.rows[0].last_updated || lastUpdateResult.rows[0].createdAt;
      const hoursSinceUpdate = (Date.now() - new Date(lastUpdate).getTime()) / (1000 * 60 * 60);
      
      // Update if: 10+ chats OR 24+ hours since last update
      return chatCount >= 10 || hoursSinceUpdate >= 24;
      
    } catch (error) {
      logger.error('Error checking if twin needs update:', error);
      return false;
    }
  }

  /**
   * Process learning for a twin
   */
  async processTwinLearning(twinId: string, userId: string): Promise<boolean> {
    try {
      logger.info(`Processing background learning for twin: ${twinId}`);
      
      // Check if twin needs update
      const shouldUpdate = await this.shouldUpdateTwin(twinId);
      if (!shouldUpdate) {
        logger.info(`Twin ${twinId} does not need update yet`);
        return false;
      }
      
      // Get recent feedback
      const feedbackResult = await db.query(`
        SELECT knob, AVG(delta) as avg_delta, COUNT(*) as count
        FROM style_corrections 
        WHERE twin_id = $1 AND source = 'user_feedback'
        AND ts >= NOW() - INTERVAL '7 days'
        GROUP BY knob
        HAVING COUNT(*) >= 2
      `, [twinId]);
      
      if (feedbackResult.rows.length === 0) {
        logger.info(`No recent feedback for twin ${twinId}`);
        return false;
      }
      
      logger.info(`Found ${feedbackResult.rows.length} feedback patterns for twin ${twinId}`);
      
      // Apply corrections using existing logic
      await this.applyLearningCorrections(twinId, feedbackResult.rows);
      
      // Update last_updated timestamp
      await db.query(`
        UPDATE "Twin" SET "last_updated" = NOW() WHERE id = $1
      `, [twinId]);
      
      logger.info(`Background learning completed for twin ${twinId}`);
      return true;
      
    } catch (error) {
      logger.error(`Error processing learning for twin ${twinId}:`, error);
      return false;
    }
  }

  /**
   * Apply learning corrections
   */
  private async applyLearningCorrections(twinId: string, feedbackData: any[]): Promise<void> {
    try {
      // Get current style vector
      const twinResult = await db.query(`
        SELECT "styleVector" FROM "Twin" WHERE id = $1
      `, [twinId]);
      
      if (twinResult.rows.length === 0) {
        throw new Error('Twin not found');
      }
      
      let styleVector = twinResult.rows[0].styleVector || {};
      
      // Apply corrections based on feedback
      for (const feedback of feedbackData) {
        const { knob, avg_delta } = feedback;
        const delta = parseFloat(avg_delta);
        
        logger.info(`Applying correction: ${knob} = ${delta}`);
        
        switch (knob) {
          case 'casual':
            // Apply general style adjustments based on feedback
            if (delta > 0) {
              // Positive feedback - enhance current style
              styleVector.formality_level = Math.min(1, (styleVector.formality_level || 0.5) + 0.1);
            } else {
              // Negative feedback - adjust style
              styleVector.formality_level = Math.max(0, (styleVector.formality_level || 0.5) - 0.1);
            }
            break;
        }
      }
      
      // Update style vector
      await db.query(`
        UPDATE "Twin" 
        SET "styleVector" = $1, "style_version" = "style_version" + 1
        WHERE id = $2
      `, [JSON.stringify(styleVector), twinId]);
      
      logger.info(`Style vector updated for twin ${twinId}`);
      
    } catch (error) {
      logger.error('Error applying learning corrections:', error);
      throw error;
    }
  }

  /**
   * Process all twins that need learning
   */
  async processAllTwins(): Promise<void> {
    try {
      logger.info('Starting background learning process');
      
      // Get all twins that need updates
      const twinsResult = await db.query(`
        SELECT t.id, t."userId"
        FROM "Twin" t
        WHERE (
          SELECT COUNT(*) FROM "Chat" c WHERE c."twinId" = t.id
        ) >= 10
        OR t."last_updated" IS NULL
        OR t."last_updated" < NOW() - INTERVAL '24 hours'
      `);
      
      logger.info(`Found ${twinsResult.rows.length} twins to process`);
      
      for (const twin of twinsResult.rows) {
        await this.processTwinLearning(twin.id, twin.userId);
      }
      
      logger.info('Background learning process completed');
      
    } catch (error) {
      logger.error('Error in background learning process:', error);
    }
  }
}

export const backgroundLearningService = new BackgroundLearningService();