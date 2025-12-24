import { db } from '../config/database';

/**
 * Generate a new response with a specific tone preference
 * @param chatId - The chat ID
 * @param tonePreference - Desired tone (e.g., 'professional', 'casual')
 * @returns Generated response text
 */
export async function generateResponseWithTone(
  chatId: string, 
  tonePreference: string
): Promise<string> {
  try {
    // Get chat and twin info
    const chatResult = await db.query(`
      SELECT c."twinId", c."chatVector", t."styleVector", t."systemPrompt" 
      FROM "Chat" c
      JOIN "Twin" t ON c."twinId" = t.id
      WHERE c.id = $1
    `, [chatId]);
    
    if (chatResult.rows.length === 0) {
      throw new Error('Chat not found');
    }
    
    const { twinId, chatVector, styleVector, systemPrompt } = chatResult.rows[0];
    
    // Use your existing AI service to generate response
    // This is a placeholder - replace with your actual AI generation logic
    const newResponse = `Regenerated response with ${tonePreference} tone for chat ${chatId}`;
    
    return newResponse;
  } catch (error) {
    throw error;
  }
}

/**
 * Adjust the tone of an existing response
 * @param twinId - The twin ID
 * @param responseId - The response ID to adjust
 * @param tone - Desired tone adjustment
 * @returns Adjusted response text
 */
export async function adjustResponseTone(
  twinId: string, 
  responseId: string, 
  tone: string
): Promise<string> {
  try {
    // Get twin info
    const twinResult = await db.query(`
      SELECT "styleVector", "systemPrompt" FROM "Twin" WHERE id = $1
    `, [twinId]);
    
    if (twinResult.rows.length === 0) {
      throw new Error('Twin not found');
    }
    
    const { styleVector, systemPrompt } = twinResult.rows[0];
    
    // Use your existing AI service to adjust tone
    // This is a placeholder - replace with your actual AI adjustment logic
    const adjustedResponse = `Response adjusted to ${tone} tone for response ${responseId}`;
    
    return adjustedResponse;
  } catch (error) {
    throw error;
  }
}

