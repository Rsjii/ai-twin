"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateAILearning = updateAILearning;
const database_1 = require("../config/database");
async function updateAILearning(chatId, rating, suggestion, tonePreference) {
    try {
        const chatResult = await database_1.db.query(`
      SELECT "twinId" FROM "Chat" WHERE id = $1
    `, [chatId]);
        if (chatResult.rows.length === 0)
            return;
        const twinId = chatResult.rows[0].twinId;
        await database_1.db.query(`
      INSERT INTO "AILearning" ("twinId", "userId", "learningData", "lastUpdated")
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT ("twinId") DO UPDATE SET
        "learningData" = $3,
        "lastUpdated" = NOW()
    `, [twinId, chatId, JSON.stringify({
                rating,
                suggestion,
                tonePreference,
                timestamp: new Date().toISOString()
            })]);
    }
    catch (error) {
        console.error('Update AI learning error:', error);
    }
}
//# sourceMappingURL=aiLearningService.js.map