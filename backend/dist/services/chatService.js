"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateResponseWithTone = generateResponseWithTone;
exports.adjustResponseTone = adjustResponseTone;
const database_1 = require("../config/database");
async function generateResponseWithTone(chatId, tonePreference) {
    try {
        const chatResult = await database_1.db.query(`
      SELECT c."twinId", c."chatVector", t."styleVector", t."systemPrompt" 
      FROM "Chat" c
      JOIN "Twin" t ON c."twinId" = t.id
      WHERE c.id = $1
    `, [chatId]);
        if (chatResult.rows.length === 0) {
            throw new Error('Chat not found');
        }
        const { twinId, chatVector, styleVector, systemPrompt } = chatResult.rows[0];
        const newResponse = `Regenerated response with ${tonePreference} tone for chat ${chatId}`;
        return newResponse;
    }
    catch (error) {
        console.error('Generate response with tone error:', error);
        throw error;
    }
}
async function adjustResponseTone(twinId, responseId, tone) {
    try {
        const twinResult = await database_1.db.query(`
      SELECT "styleVector", "systemPrompt" FROM "Twin" WHERE id = $1
    `, [twinId]);
        if (twinResult.rows.length === 0) {
            throw new Error('Twin not found');
        }
        const { styleVector, systemPrompt } = twinResult.rows[0];
        const adjustedResponse = `Response adjusted to ${tone} tone for response ${responseId}`;
        return adjustedResponse;
    }
    catch (error) {
        console.error('Adjust response tone error:', error);
        throw error;
    }
}
//# sourceMappingURL=chatService.js.map