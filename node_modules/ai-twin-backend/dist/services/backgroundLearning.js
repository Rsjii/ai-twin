"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.backgroundLearningService = exports.BackgroundLearningService = void 0;
const database_1 = require("../config/database");
const logger_1 = require("../config/logger");
class BackgroundLearningService {
    async shouldUpdateTwin(twinId) {
        try {
            const chatCountResult = await database_1.db.query(`
        SELECT COUNT(*) as count FROM "Chat" WHERE "twinId" = $1
      `, [twinId]);
            const chatCount = parseInt(chatCountResult.rows[0].count);
            const lastUpdateResult = await database_1.db.query(`
        SELECT "last_updated", "createdAt" FROM "Twin" WHERE id = $1
      `, [twinId]);
            if (lastUpdateResult.rows.length === 0) {
                return false;
            }
            const lastUpdate = lastUpdateResult.rows[0].last_updated || lastUpdateResult.rows[0].createdAt;
            const hoursSinceUpdate = (Date.now() - new Date(lastUpdate).getTime()) / (1000 * 60 * 60);
            return chatCount >= 10 || hoursSinceUpdate >= 24;
        }
        catch (error) {
            logger_1.logger.error('Error checking if twin needs update:', error);
            return false;
        }
    }
    async processTwinLearning(twinId, userId) {
        try {
            logger_1.logger.info(`Processing background learning for twin: ${twinId}`);
            const shouldUpdate = await this.shouldUpdateTwin(twinId);
            if (!shouldUpdate) {
                logger_1.logger.info(`Twin ${twinId} does not need update yet`);
                return false;
            }
            const feedbackResult = await database_1.db.query(`
        SELECT knob, AVG(delta) as avg_delta, COUNT(*) as count
        FROM style_corrections 
        WHERE twin_id = $1 AND source = 'user_feedback'
        AND ts >= NOW() - INTERVAL '7 days'
        GROUP BY knob
        HAVING COUNT(*) >= 2
      `, [twinId]);
            if (feedbackResult.rows.length === 0) {
                logger_1.logger.info(`No recent feedback for twin ${twinId}`);
                return false;
            }
            logger_1.logger.info(`Found ${feedbackResult.rows.length} feedback patterns for twin ${twinId}`);
            await this.applyLearningCorrections(twinId, feedbackResult.rows);
            const utcTimestamp = new Date().toISOString();
            await database_1.db.query(`
        UPDATE "Twin" SET "last_updated" = $1::timestamptz WHERE id = $2
      `, [utcTimestamp, twinId]);
            logger_1.logger.info(`Background learning completed for twin ${twinId}`);
            return true;
        }
        catch (error) {
            logger_1.logger.error(`Error processing learning for twin ${twinId}:`, error);
            return false;
        }
    }
    async applyLearningCorrections(twinId, feedbackData) {
        try {
            const twinResult = await database_1.db.query(`
        SELECT "styleVector" FROM "Twin" WHERE id = $1
      `, [twinId]);
            if (twinResult.rows.length === 0) {
                throw new Error('Twin not found');
            }
            let styleVector = twinResult.rows[0].styleVector || {};
            for (const feedback of feedbackData) {
                const { knob, avg_delta } = feedback;
                const delta = parseFloat(avg_delta);
                logger_1.logger.info(`Applying correction: ${knob} = ${delta}`);
                switch (knob) {
                    case 'casual':
                        if (delta > 0) {
                            styleVector.formality_level = Math.min(1, (styleVector.formality_level || 0.5) + 0.1);
                        }
                        else {
                            styleVector.formality_level = Math.max(0, (styleVector.formality_level || 0.5) - 0.1);
                        }
                        break;
                }
            }
            await database_1.db.query(`
        UPDATE "Twin" 
        SET "styleVector" = $1, "style_version" = "style_version" + 1
        WHERE id = $2
      `, [JSON.stringify(styleVector), twinId]);
            logger_1.logger.info(`Style vector updated for twin ${twinId}`);
        }
        catch (error) {
            logger_1.logger.error('Error applying learning corrections:', error);
            throw error;
        }
    }
    async processAllTwins() {
        try {
            logger_1.logger.info('Starting background learning process');
            const twinsResult = await database_1.db.query(`
        SELECT t.id, t."userId"
        FROM "Twin" t
        WHERE (
          SELECT COUNT(*) FROM "Chat" c WHERE c."twinId" = t.id
        ) >= 10
        OR t."last_updated" IS NULL
        OR t."last_updated" < NOW() - INTERVAL '24 hours'
      `);
            logger_1.logger.info(`Found ${twinsResult.rows.length} twins to process`);
            for (const twin of twinsResult.rows) {
                await this.processTwinLearning(twin.id, twin.userId);
            }
            logger_1.logger.info('Background learning process completed');
        }
        catch (error) {
            logger_1.logger.error('Error in background learning process:', error);
        }
    }
}
exports.BackgroundLearningService = BackgroundLearningService;
exports.backgroundLearningService = new BackgroundLearningService();
//# sourceMappingURL=backgroundLearning.js.map