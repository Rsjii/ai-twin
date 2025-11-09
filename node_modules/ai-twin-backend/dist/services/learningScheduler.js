"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.learningScheduler = exports.LearningScheduler = void 0;
const backgroundLearning_1 = require("./backgroundLearning");
const logger_1 = require("../config/logger");
const node_cron_1 = __importDefault(require("node-cron"));
const systemPromptUpdater_1 = require("./systemPromptUpdater");
class LearningScheduler {
    intervalId = null;
    start() {
        this.intervalId = setInterval(async () => {
            try {
                logger_1.logger.info('Running scheduled background learning');
                await backgroundLearning_1.backgroundLearningService.processAllTwins();
            }
            catch (error) {
                logger_1.logger.error('Scheduled background learning error:', error);
            }
        }, 6 * 60 * 60 * 1000);
        node_cron_1.default.schedule('0 2 * * 0', async () => {
            try {
                logger_1.logger.info('Running weekly system prompt updates');
                await systemPromptUpdater_1.systemPromptUpdater.updateAllTwins();
            }
            catch (error) {
                logger_1.logger.error('Weekly system prompt update error:', error);
            }
        });
        logger_1.logger.info('Background learning scheduler started');
    }
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            logger_1.logger.info('Background learning scheduler stopped');
        }
    }
}
exports.LearningScheduler = LearningScheduler;
exports.learningScheduler = new LearningScheduler();
//# sourceMappingURL=learningScheduler.js.map