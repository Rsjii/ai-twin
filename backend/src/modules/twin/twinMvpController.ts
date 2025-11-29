// backend/src/modules/twin/twinMvpController.ts
import { Request, Response } from 'express';
import { db } from '../../config/database';
import { logger } from '../../config/logger';
import { verifyTwinOwnership } from '../../utils/twinUtils';

/**
 * MVP: Simple usage stats for a twin (no anchors / memories / goals / performance)
 * GET /api/twin/:id/mvp/summary
 * 
 * Returns basic usage metrics:
 * - totalChats: number of chat sessions with this twin
 * - totalMessages: total messages generated across all chats
 */
export const getTwinMvpSummary = async (req: any, res: Response) => {
  try {
    const { id: twinId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    // Verify twin ownership
    await verifyTwinOwnership(twinId, userId);

    // Get simple usage stats
    const result = await db.query(
      `
      SELECT
        COUNT(DISTINCT c.id)        AS total_chats,
        COUNT(m.id)                 AS total_messages
      FROM "Chat" c
      LEFT JOIN "Message" m ON c.id = m."chatId"
      WHERE c."twinId" = $1 AND c."userId" = $2
      `,
      [twinId, userId]
    );

    const row = result.rows[0] || { total_chats: 0, total_messages: 0 };

    res.json({
      success: true,
      summary: {
        totalChats: parseInt(row.total_chats || '0', 10),
        totalMessages: parseInt(row.total_messages || '0', 10),
      },
    });
  } catch (error) {
    logger.error('MVP twin summary API error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};