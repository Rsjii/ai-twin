import { Request, Response } from 'express';
import { db } from '../../config/database';
import { logger } from '../../config/logger';
import { verifyTwinOwnership } from '../../utils/twinUtils';
import { logEvent } from '../../services/eventLogger';
import { QUERY_LIMITS } from '../../config/constants';

export const getMetricsSummary = async (_req: Request, res: Response) => {
  try {
    // Get counts for all major metrics using raw SQL
    const [
      totalUsersResult,
      totalTwinsResult,
      totalChatsResult,
      totalMessagesResult,
      totalInvitesResult,
      totalEventsResult,
      recentSignupsResult,
      recentTwinsResult,
    ] = await Promise.all([
      db.query('SELECT COUNT(*) as count FROM "User"'),
      db.query('SELECT COUNT(*) as count FROM "Twin"'),
      db.query('SELECT COUNT(*) as count FROM "Chat"'),
      db.query('SELECT COUNT(*) as count FROM "Message"'),
      db.query('SELECT COUNT(*) as count FROM "Invite"'),
      db.query('SELECT COUNT(*) as count FROM "Event"'),
      db.query('SELECT COUNT(*) as count FROM "User" WHERE "createdAt" >= NOW() - INTERVAL \'7 days\''),
      db.query('SELECT COUNT(*) as count FROM "Twin" WHERE "createdAt" >= NOW() - INTERVAL \'7 days\''),
    ]);

    const totalUsers = parseInt(totalUsersResult.rows[0].count);
    const totalTwins = parseInt(totalTwinsResult.rows[0].count);
    const totalChats = parseInt(totalChatsResult.rows[0].count);
    const totalMessages = parseInt(totalMessagesResult.rows[0].count);
    const totalInvites = parseInt(totalInvitesResult.rows[0].count);
    const totalEvents = parseInt(totalEventsResult.rows[0].count);
    const recentSignups = parseInt(recentSignupsResult.rows[0].count);
    const recentTwins = parseInt(recentTwinsResult.rows[0].count);

    // Get event type breakdown
    const eventTypesResult = await db.query('SELECT type, COUNT(*) as count FROM "Event" GROUP BY type');
    const eventBreakdown = eventTypesResult.rows.reduce((acc, event) => {
      acc[event.type] = parseInt(event.count);
      return acc;
    }, {} as Record<string, number>);

    res.json({
      summary: {
        totalUsers,
        totalTwins,
        totalChats,
        totalMessages,
        totalInvites,
        totalEvents,
        recentSignups,
        recentTwins,
      },
      eventBreakdown,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Get metrics error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ADD at line 63 in analyticsController.ts
export const getTwinPerformance = async (req: Request, res: Response) => {
  try {
    const { twinId } = req.params;
    
    const metrics = await db.query(`
      SELECT 
        COUNT(c.id) as totalChats,
        COUNT(m.id) as totalMessages,
        AVG(CASE WHEN m.sender = 'twin' THEN 1 ELSE 0 END) as responseRate
      FROM "Chat" c
      LEFT JOIN "Message" m ON c.id = m."chatId"
      WHERE c."twinId" = $1
    `, [twinId]);
    
    res.json({ success: true, metrics: metrics.rows[0] });
  } catch (error) {
    logger.error('Twin performance error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const debugUserData = async (req: Request, res: Response) => {
  try {
    let userId: string | null = null;
    
    // Try JWT authentication first
    if (req.user) {
      if (req.user.id) {
        userId = req.user.id;
      } else if (req.user.userId) {
        userId = req.user.userId;
      }
    }
    // Fallback to session authentication
    else if (req.session && req.session.userId) {
      userId = req.session.userId;
    }
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Get all user data using raw SQL
    const userResult = await db.query('SELECT * FROM "User" WHERE id = $1', [userId]);
    const user = userResult.rows[0];

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get related data counts
    const [twinsResult, chatsResult, eventsResult, invitesSentResult, invitesReceivedResult] = await Promise.all([
      db.query('SELECT COUNT(*) as count FROM "Twin" WHERE "userId" = $1', [userId]),
      db.query('SELECT COUNT(*) as count FROM "Chat" WHERE "userId" = $1', [userId]),
      db.query('SELECT COUNT(*) as count FROM "Event" WHERE "userId" = $1', [userId]),
      db.query('SELECT COUNT(*) as count FROM "Invite" WHERE "inviterId" = $1', [userId]),
      db.query('SELECT COUNT(*) as count FROM "Invite" WHERE "acceptedBy" = $1', [userId]),
    ]);

    res.json({
      success: true,
      user: user,
      counts: {
        twins: parseInt(twinsResult.rows[0].count),
        chats: parseInt(chatsResult.rows[0].count),
        events: parseInt(eventsResult.rows[0].count),
        invitesSent: parseInt(invitesSentResult.rows[0].count),
        invitesReceived: parseInt(invitesReceivedResult.rows[0].count),
      }
    });
  } catch (error) {
    logger.error('Debug user data error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createSampleData = async (req: Request, res: Response) => {
  try {
    let userId: string | null = null;
    
    // Try JWT authentication first
    if (req.user) {
      if (req.user.id) {
        userId = req.user.id;
      } else if (req.user.userId) {
        userId = req.user.userId;
      }
    }
    // Fallback to session authentication
    else if (req.session && req.session.userId) {
      userId = req.session.userId;
    }
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Create some sample events using raw SQL
    const sampleEvents = [
      { type: 'login', meta: { timestamp: new Date() } },
      { type: 'profile_view', meta: { source: 'dashboard' } },
      { type: 'twin_created', meta: { twinName: 'Sample Twin' } },
      { type: 'chat_started', meta: { twinId: 'sample-twin-id' } },
    ];

    for (const event of sampleEvents) {
      await logEvent(userId, event.type, event.meta);
    }

    res.json({
      success: true,
      message: 'Sample data created successfully'
    });
  } catch (error) {
    logger.error('Create sample data error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getUserAnalytics = async (req: Request, res: Response) => {
  try {
    let userId: string | null = null;
    
    // Try JWT authentication first
    if (req.user) {
      if (req.user.id) {
        userId = req.user.id;
      } else if (req.user.userId) {
        userId = req.user.userId;
      }
    }
    // Fallback to session authentication
    else if (req.session && req.session.userId) {
      userId = req.session.userId;
    }
    
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    // User already authenticated via JWT middleware - skip redundant user check
    // Get user's analytics - ALL QUERIES IN PARALLEL (FAST)
    let userTwins = 0, userChats = 0, userMessages = 0, userInvitesSent = 0, userInvitesReceived = 0, userEvents = 0;
    let userEventBreakdown: Record<string, number> = {};
    let formattedActivity: Array<{description: string, timestamp: Date, metadata: any}> = [];
    
    try {
      const [
        twinsResult,
        chatsResult,
        messagesResult,
        invitesSentResult,
        invitesReceivedResult,
        eventsResult,
        userEventTypesResult,
        recentActivityResult
      ] = await Promise.all([
        db.query('SELECT COUNT(*) as count FROM "Twin" WHERE "userId" = $1', [userId]),
        db.query('SELECT COUNT(*) as count FROM "Chat" WHERE "userId" = $1', [userId]),
        db.query('SELECT COUNT(*) as count FROM "Message" m JOIN "Chat" c ON m."chatId" = c.id WHERE c."userId" = $1', [userId]),
        db.query('SELECT COUNT(*) as count FROM "Invite" WHERE "inviterId" = $1', [userId]),
        db.query('SELECT COUNT(*) as count FROM "Invite" WHERE "acceptedBy" = $1', [userId]),
        db.query('SELECT COUNT(*) as count FROM "Event" WHERE "userId" = $1', [userId]),
        db.query('SELECT type, COUNT(*) as count FROM "Event" WHERE "userId" = $1 GROUP BY type', [userId]),
        db.query('SELECT type, "createdAt", meta FROM "Event" WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT ${QUERY_LIMITS.RECENT_ITEMS}', [userId])
      ]);

      // Parse all results
      userTwins = parseInt(twinsResult.rows[0].count);
      userChats = parseInt(chatsResult.rows[0].count);
      userMessages = parseInt(messagesResult.rows[0].count);
      userInvitesSent = parseInt(invitesSentResult.rows[0].count);
      userInvitesReceived = parseInt(invitesReceivedResult.rows[0].count);
      userEvents = parseInt(eventsResult.rows[0].count);

      // Process event breakdown (now from parallel query)
      userEventBreakdown = userEventTypesResult.rows.reduce((acc, event) => {
        acc[event.type] = parseInt(event.count);
        return acc;
      }, {} as Record<string, number>);

      // Process recent activity (now from parallel query)
      formattedActivity = recentActivityResult.rows.map(event => ({
        description: `${event.type} activity`,
        timestamp: event.createdAt,
        metadata: event.meta,
      }));
    } catch (analyticsError) {
      logger.error('Error fetching analytics data:', analyticsError);
      return res.status(500).json({ success: false, error: 'Failed to fetch analytics data' });
    }

    const responseData = {
      success: true,
      user: {
        id: userId,
        email: req.user?.email || 'Unknown',
        handle: req.user?.handle || 'Unknown',
      },
      analytics: {
        totalViews: userEvents || 0,
        totalLikes: userInvitesReceived || 0,
        totalFollowers: userInvitesSent || 0,
        totalChats: userChats || 0,
        twins: userTwins || 0,
        messages: userMessages || 0,
        invitesSent: userInvitesSent || 0,
        invitesReceived: userInvitesReceived || 0,
        events: userEvents || 0,
        recentActivity: formattedActivity || [],
      },
      eventBreakdown: userEventBreakdown || {},
    };

    res.json(responseData);
  } catch (error) {
    logger.error('Get user analytics error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

/**
 * Get twin-specific analytics
 */
export const getTwinAnalytics = async (req: Request, res: Response) => {
  try {
    const { twinId } = req.params;
    const userId = req.user.id;

    // Verify twin ownership
   await verifyTwinOwnership(twinId, userId);

    // Get comprehensive analytics
    const [
      styleMetrics,
      criticScoreTrend,
      correctionsApplied,
      avgResponseTime,
      memoryStats,
      feedbackStats,
      chatStats
    ] = await Promise.all([
      getStyleMetrics(twinId),
      getCriticScoreTrend(twinId),
      getCorrectionsCount(twinId),
      getAvgResponseTime(twinId),
      getMemoryStats(twinId),
      getFeedbackStats(twinId),
      getChatStats(twinId)
    ]);

    res.json({
      success: true,
      analytics: {
        styleMetrics,
        criticScoreTrend,
        correctionsApplied,
        avgResponseTime,
        memoryStats,
        feedbackStats,
        chatStats,
        generatedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Get twin analytics error:', error);
    res.status(500).json({ error: 'Failed to get twin analytics' });
  }
};

async function getStyleMetrics(twinId: string) {
  const result = await db.query(`
    SELECT "styleVector" FROM "Twin" WHERE id = $1
  `, [twinId]);
  
  if (result.rows.length === 0) return null;
  
  const styleVector = result.rows[0].styleVector;
  
  return {
    tone: styleVector.tone || 'casual',
    formalityLevel: styleVector.formality_level || 0.5,
    emojiUsage: styleVector.emoji_usage || 0.3,
    humorStyle: styleVector.humor_style || 'light',
    questionFrequency: styleVector.question_frequency || 0.4,
    responseLength: styleVector.response_length_preference || 'detailed'
  };
}

async function getCriticScoreTrend(twinId: string) {
  const result = await db.query(`
    SELECT 
      DATE(ts) as date,
      AVG(critic_score) as avg_score,
      COUNT(*) as run_count
    FROM ai_runs 
    WHERE twin_id = $1 AND critic_score IS NOT NULL
    AND ts >= NOW() - INTERVAL '30 days'
    GROUP BY DATE(ts)
    ORDER BY date DESC
    LIMIT ${QUERY_LIMITS.ANALYTICS_TIMELINE}
  `, [twinId]);
  
  return result.rows;
}

async function getCorrectionsCount(twinId: string) {
  const result = await db.query(`
    SELECT 
      COUNT(*) as total_corrections,
      COUNT(CASE WHEN delta > 0 THEN 1 END) as positive_corrections,
      COUNT(CASE WHEN delta < 0 THEN 1 END) as negative_corrections,
      AVG(delta) as avg_delta
    FROM style_corrections 
    WHERE twin_id = $1
  `, [twinId]);
  
  return result.rows[0];
}

async function getAvgResponseTime(twinId: string) {
  const result = await db.query(`
    SELECT AVG(latency_ms) as avg_latency
    FROM ai_runs 
    WHERE twin_id = $1 AND latency_ms IS NOT NULL
  `, [twinId]);
  
  return result.rows[0].avg_latency || 0;
}

async function getMemoryStats(twinId: string) {
  const [longTermResult, anchorsResult] = await Promise.all([
    db.query(`
      SELECT 
        category as bucket,
        COUNT(*) as count
      FROM "MemoryLongTerm"
      WHERE "twinId" = $1
      GROUP BY category
    `, [twinId]),
    db.query(`
      SELECT 
        'voice' as bucket,
        COUNT(*) as count
      FROM "style_anchors"
      WHERE twin_id = $1 AND type = 'phrase'
      GROUP BY bucket
    `, [twinId])
  ]);
  
  return [
    ...longTermResult.rows.map(row => ({
      bucket: row.bucket === 'fact' ? 'facts' : row.bucket,
      count: parseInt(row.count),
      public_count: 0
    })),
    ...anchorsResult.rows.map(row => ({
      bucket: row.bucket,
      count: parseInt(row.count),
      public_count: 0
    }))
  ];
}

async function getFeedbackStats(twinId: string) {
  const result = await db.query(`
    SELECT 
      user_rating,
      COUNT(*) as count
    FROM ai_runs 
    WHERE twin_id = $1 AND user_rating IS NOT NULL
    GROUP BY user_rating
  `, [twinId]);
  
  return result.rows;
}

async function getChatStats(twinId: string) {
  const result = await db.query(`
    SELECT 
      COUNT(*) as total_chats,
      COUNT(DISTINCT c.id) as unique_chats,
      AVG(message_count) as avg_messages_per_chat
    FROM "Chat" c
    LEFT JOIN (
      SELECT "chatId", COUNT(*) as message_count
      FROM "Message"
      GROUP BY "chatId"
    ) m ON c.id = m."chatId"
    WHERE c."twinId" = $1
  `, [twinId]);
  
  return result.rows[0];
}

export const getReferralStats = async (req: any, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Get total referrals count
    const totalResult = await db.query(
      'SELECT COUNT(*) as count FROM "Invite" WHERE "inviterId" = $1 AND "acceptedBy" IS NOT NULL',
      [req.user.id]
    );
    const totalReferrals = parseInt(totalResult.rows[0].count);
    
    // Get recent referrals with user details
    const referralsResult = await db.query(
      `SELECT 
         i.*, 
         u.id as user_id, u.email, u.name, u.handle, u."createdAt" as user_created
       FROM "Invite" i
       JOIN "User" u ON i."acceptedBy" = u.id
       WHERE i."inviterId" = $1 AND i."acceptedBy" IS NOT NULL
       ORDER BY i."createdAt" DESC
       LIMIT ${QUERY_LIMITS.RECENT_ITEMS}`,
      [req.user.id]
    );
    
    res.json({
      success: true,
      stats: {
        totalReferrals,
        recentReferrals: referralsResult.rows.map(r => ({
          referredUser: {
            id: r.user_id,
            email: r.email,
            name: r.name,
            handle: r.handle,
            createdAt: r.user_created
          },
          joinedAt: r.createdAt
        }))
      }
    });
  } catch (error) {
    logger.error('Get referral stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};


// Get chatters statistics
export const getChattersStats = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { twinId } = req.query;
    
    if (!twinId) {
      return res.status(400).json({ error: 'Twin ID is required' });
    }

    // Verify user owns the twin
   await verifyTwinOwnership(twinId, req.user.id);

    // Get stats
    const stats = await db.query(`
      SELECT 
        COUNT(DISTINCT c."userId") as "totalChatters",
        COUNT(DISTINCT c.id) as "totalChats",
        COUNT(DISTINCT CASE 
          WHEN c."createdAt" >= NOW() - INTERVAL '7 days' THEN c."userId" 
        END) as "activeThisWeek"
      FROM "Chat" c
      WHERE c."twinId" = $1
    `, [twinId]);

    res.json({
      success: true,
      totalChatters: parseInt(stats.rows[0].totalChatters) || 0,
      totalChats: parseInt(stats.rows[0].totalChats) || 0,
      activeThisWeek: parseInt(stats.rows[0].activeThisWeek) || 0
    });

  } catch (error) {
    logger.error('Get chatters stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};