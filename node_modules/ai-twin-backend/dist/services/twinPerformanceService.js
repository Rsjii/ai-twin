"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateTwinPerformanceScores = updateTwinPerformanceScores;
const database_1 = require("../config/database");
const logger_1 = require("../config/logger");
async function updateTwinPerformanceScores(twinId) {
    try {
        const twinResult = await database_1.db.query(`
      SELECT "likeCount", "followCount", "chatCount", "verified"
      FROM "Twin"
      WHERE id = $1
    `, [twinId]);
        if (twinResult.rows.length === 0) {
            logger_1.logger.warn(`Twin ${twinId} not found for performance update`);
            return;
        }
        const twin = twinResult.rows[0];
        const engagementScore = ((twin.likeCount || 0) * 0.3 +
            (twin.followCount || 0) * 0.4 +
            (twin.chatCount || 0) * 0.3 +
            (twin.verified ? 10 : 0));
        const popularityScore = ((twin.likeCount || 0) * 0.4 +
            (twin.followCount || 0) * 0.3 +
            (twin.chatCount || 0) * 0.3);
        const id = `twin_perf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await database_1.db.query(`
      INSERT INTO "TwinPerformance" (id, "twinId", "engagementScore", "popularityScore", "updatedAt")
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT ("twinId")
      DO UPDATE SET
        "engagementScore" = EXCLUDED."engagementScore",
        "popularityScore" = EXCLUDED."popularityScore",
        "updatedAt" = NOW()
    `, [id, twinId, engagementScore, popularityScore]);
        logger_1.logger.debug(`Updated TwinPerformance scores for twin ${twinId}: engagement=${engagementScore.toFixed(2)}, popularity=${popularityScore.toFixed(2)}`);
    }
    catch (error) {
        logger_1.logger.error(`Error updating TwinPerformance scores for twin ${twinId}:`, error);
    }
}
//# sourceMappingURL=twinPerformanceService.js.map