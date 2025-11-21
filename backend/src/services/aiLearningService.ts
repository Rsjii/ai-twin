import { db } from '../config/database';

/**
 * Update AI learning data based on user feedback
 * @param chatId - The chat ID
 * @param rating - User rating ('positive' or 'negative')
 * @param suggestion - User's suggestion/feedback
 * @param tonePreference - Preferred tone
 */
export async function updateAILearning(
  chatId: string, 
  rating: string, 
  suggestion: string, 
  tonePreference: string
): Promise<void> {
  try {
    // Get the twin ID from the chat
    const chatResult = await db.query(`
      SELECT "twinId" FROM "Chat" WHERE id = $1
    `, [chatId]);
    
    if (chatResult.rows.length === 0) return;
    
    const twinId = chatResult.rows[0].twinId;
    
    // Store learning data
    const utcTimestamp = new Date().toISOString();
    await db.query(`
      INSERT INTO "AILearning" ("twinId", "userId", "learningData", "lastUpdated")
      VALUES ($1, $2, $3, $4::timestamptz)
      ON CONFLICT ("twinId") DO UPDATE SET
        "learningData" = $3,
        "lastUpdated" = $4::timestamptz
    `, [twinId, chatId, JSON.stringify({
      rating,
      suggestion,
      tonePreference,
      timestamp: utcTimestamp
    }), utcTimestamp]);
  } catch (error) {
    console.error('Update AI learning error:', error);
    // Don't throw - allow request to continue even if learning update fails
  }
}

