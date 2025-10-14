import { Request, Response } from 'express';
import { db } from '../../config/database';
import { logger } from '../../config/logger';

// Admin authentication middleware
export const requireAdminAuth = (req: Request, res: Response, next: Function) => {
  // Check if user is admin (you can modify this logic as needed)
  const adminEmails = ['admin@aitwin.com', 'i@gmail.com']; // Add your admin emails here
  
  if (!req.user || !req.user.email || !adminEmails.includes(req.user.email)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  next();
};

// Get comprehensive admin analytics
export const getAdminAnalytics = async (req: Request, res: Response) => {
  try {
    console.log('=== ADMIN ANALYTICS REQUEST ===');
    console.log('Admin user:', req.user?.email);

    // Get all metrics in parallel
    const [
      // Lifetime metrics
      totalUsersResult,
      totalTwinsResult,
      totalChatsResult,
      totalMessagesResult,
      totalEventsResult,
      totalInvitesResult,
      
      // Daily metrics (today)
      dailyUsersResult,
      dailyTwinsResult,
      dailyChatsResult,
      dailyMessagesResult,
      dailyEventsResult,
      
      // Weekly metrics (last 7 days)
      weeklyUsersResult,
      weeklyTwinsResult,
      weeklyChatsResult,
      weeklyMessagesResult,
      weeklyEventsResult,
      
      // Monthly metrics (last 30 days)
      monthlyUsersResult,
      monthlyTwinsResult,
      monthlyChatsResult,
      monthlyMessagesResult,
      monthlyEventsResult,
      
      // User activity metrics
      activeUsersResult,
      newUsersTodayResult,
      newUsersThisWeekResult,
      newUsersThisMonthResult,
      
      // Engagement metrics
      avgMessagesPerChatResult,
      avgChatsPerUserResult,
      avgEventsPerUserResult,
      
      // Top performing content
      topTwinsResult,
      mostActiveUsersResult,
      
      // Event breakdown
      eventTypesResult,
      
      // Recent activity
      recentSignupsResult,
      recentTwinsResult,
      recentChatsResult,
      recentEventsResult
    ] = await Promise.all([
      // Lifetime metrics
      db.query('SELECT COUNT(*) as count FROM "User"'),
      db.query('SELECT COUNT(*) as count FROM "Twin"'),
      db.query('SELECT COUNT(*) as count FROM "Chat"'),
      db.query('SELECT COUNT(*) as count FROM "Message"'),
      db.query('SELECT COUNT(*) as count FROM "Event"'),
      db.query('SELECT COUNT(*) as count FROM "Invite"'),
      
      // Daily metrics (today)
      db.query('SELECT COUNT(*) as count FROM "User" WHERE DATE("createdAt") = CURRENT_DATE'),
      db.query('SELECT COUNT(*) as count FROM "Twin" WHERE DATE("createdAt") = CURRENT_DATE'),
      db.query('SELECT COUNT(*) as count FROM "Chat" WHERE DATE("createdAt") = CURRENT_DATE'),
      db.query('SELECT COUNT(*) as count FROM "Message" WHERE DATE("createdAt") = CURRENT_DATE'),
      db.query('SELECT COUNT(*) as count FROM "Event" WHERE DATE("createdAt") = CURRENT_DATE'),
      
      // Weekly metrics (last 7 days)
      db.query('SELECT COUNT(*) as count FROM "User" WHERE "createdAt" >= NOW() - INTERVAL \'7 days\''),
      db.query('SELECT COUNT(*) as count FROM "Twin" WHERE "createdAt" >= NOW() - INTERVAL \'7 days\''),
      db.query('SELECT COUNT(*) as count FROM "Chat" WHERE "createdAt" >= NOW() - INTERVAL \'7 days\''),
      db.query('SELECT COUNT(*) as count FROM "Message" WHERE "createdAt" >= NOW() - INTERVAL \'7 days\''),
      db.query('SELECT COUNT(*) as count FROM "Event" WHERE "createdAt" >= NOW() - INTERVAL \'7 days\''),
      
      // Monthly metrics (last 30 days)
      db.query('SELECT COUNT(*) as count FROM "User" WHERE "createdAt" >= NOW() - INTERVAL \'30 days\''),
      db.query('SELECT COUNT(*) as count FROM "Twin" WHERE "createdAt" >= NOW() - INTERVAL \'30 days\''),
      db.query('SELECT COUNT(*) as count FROM "Chat" WHERE "createdAt" >= NOW() - INTERVAL \'30 days\''),
      db.query('SELECT COUNT(*) as count FROM "Message" WHERE "createdAt" >= NOW() - INTERVAL \'30 days\''),
      db.query('SELECT COUNT(*) as count FROM "Event" WHERE "createdAt" >= NOW() - INTERVAL \'30 days\''),
      
      // User activity metrics
      db.query('SELECT COUNT(DISTINCT "userId") as count FROM "Event" WHERE "createdAt" >= NOW() - INTERVAL \'1 day\''),
      db.query('SELECT COUNT(*) as count FROM "User" WHERE DATE("createdAt") = CURRENT_DATE'),
      db.query('SELECT COUNT(*) as count FROM "User" WHERE "createdAt" >= NOW() - INTERVAL \'7 days\''),
      db.query('SELECT COUNT(*) as count FROM "User" WHERE "createdAt" >= NOW() - INTERVAL \'30 days\''),
      
      // Engagement metrics
      db.query('SELECT AVG(message_count) as avg FROM (SELECT COUNT(*) as message_count FROM "Message" GROUP BY "chatId") as subquery'),
      db.query('SELECT AVG(chat_count) as avg FROM (SELECT COUNT(*) as chat_count FROM "Chat" GROUP BY "userId") as subquery'),
      db.query('SELECT AVG(event_count) as avg FROM (SELECT COUNT(*) as event_count FROM "Event" GROUP BY "userId") as subquery'),
      
      // Top performing content
      db.query('SELECT t.*, u.handle as userHandle, u.name as userName FROM "Twin" t JOIN "User" u ON t."userId" = u.id ORDER BY t."likeCount" DESC, t."chatCount" DESC LIMIT 10'),
      db.query('SELECT u.*, COUNT(e.id) as eventCount FROM "User" u LEFT JOIN "Event" e ON u.id = e."userId" GROUP BY u.id ORDER BY eventCount DESC LIMIT 10'),
      
      // Event breakdown
      db.query('SELECT type, COUNT(*) as count FROM "Event" GROUP BY type ORDER BY count DESC'),
      
      // Recent activity
      db.query('SELECT * FROM "User" ORDER BY "createdAt" DESC LIMIT 10'),
      db.query('SELECT t.*, u.handle as userHandle FROM "Twin" t JOIN "User" u ON t."userId" = u.id ORDER BY t."createdAt" DESC LIMIT 10'),
      db.query('SELECT c.*, u.handle as userHandle FROM "Chat" c JOIN "User" u ON c."userId" = u.id ORDER BY c."createdAt" DESC LIMIT 10'),
      db.query('SELECT e.*, u.handle as userHandle FROM "Event" e LEFT JOIN "User" u ON e."userId" = u.id ORDER BY e."createdAt" DESC LIMIT 20')
    ]);

    // Process results
    const lifetime = {
      users: parseInt(totalUsersResult.rows[0].count),
      twins: parseInt(totalTwinsResult.rows[0].count),
      chats: parseInt(totalChatsResult.rows[0].count),
      messages: parseInt(totalMessagesResult.rows[0].count),
      events: parseInt(totalEventsResult.rows[0].count),
      invites: parseInt(totalInvitesResult.rows[0].count)
    };

    const daily = {
      users: parseInt(dailyUsersResult.rows[0].count),
      twins: parseInt(dailyTwinsResult.rows[0].count),
      chats: parseInt(dailyChatsResult.rows[0].count),
      messages: parseInt(dailyMessagesResult.rows[0].count),
      events: parseInt(dailyEventsResult.rows[0].count)
    };

    const weekly = {
      users: parseInt(weeklyUsersResult.rows[0].count),
      twins: parseInt(weeklyTwinsResult.rows[0].count),
      chats: parseInt(weeklyChatsResult.rows[0].count),
      messages: parseInt(weeklyMessagesResult.rows[0].count),
      events: parseInt(weeklyEventsResult.rows[0].count)
    };

    const monthly = {
      users: parseInt(monthlyUsersResult.rows[0].count),
      twins: parseInt(monthlyTwinsResult.rows[0].count),
      chats: parseInt(monthlyChatsResult.rows[0].count),
      messages: parseInt(monthlyMessagesResult.rows[0].count),
      events: parseInt(monthlyEventsResult.rows[0].count)
    };

    const userActivity = {
      activeUsersToday: parseInt(activeUsersResult.rows[0].count),
      newUsersToday: parseInt(newUsersTodayResult.rows[0].count),
      newUsersThisWeek: parseInt(newUsersThisWeekResult.rows[0].count),
      newUsersThisMonth: parseInt(newUsersThisMonthResult.rows[0].count)
    };

    const engagement = {
      avgMessagesPerChat: parseFloat(avgMessagesPerChatResult.rows[0].avg || 0),
      avgChatsPerUser: parseFloat(avgChatsPerUserResult.rows[0].avg || 0),
      avgEventsPerUser: parseFloat(avgEventsPerUserResult.rows[0].avg || 0)
    };

    const topContent = {
      topTwins: topTwinsResult.rows,
      mostActiveUsers: mostActiveUsersResult.rows
    };

    const eventBreakdown = eventTypesResult.rows.reduce((acc, event) => {
      acc[event.type] = parseInt(event.count);
      return acc;
    }, {} as Record<string, number>);

    const recentActivity = {
      recentSignups: recentSignupsResult.rows,
      recentTwins: recentTwinsResult.rows,
      recentChats: recentChatsResult.rows,
      recentEvents: recentEventsResult.rows
    };

    // Calculate growth rates
    const growthRates = {
      daily: {
        users: daily.users > 0 ? ((daily.users / Math.max(weekly.users, 1)) * 100).toFixed(2) : '0',
        twins: daily.twins > 0 ? ((daily.twins / Math.max(weekly.twins, 1)) * 100).toFixed(2) : '0',
        chats: daily.chats > 0 ? ((daily.chats / Math.max(weekly.chats, 1)) * 100).toFixed(2) : '0'
      },
      weekly: {
        users: weekly.users > 0 ? ((weekly.users / Math.max(monthly.users, 1)) * 100).toFixed(2) : '0',
        twins: weekly.twins > 0 ? ((weekly.twins / Math.max(monthly.twins, 1)) * 100).toFixed(2) : '0',
        chats: weekly.chats > 0 ? ((weekly.chats / Math.max(monthly.chats, 1)) * 100).toFixed(2) : '0'
      }
    };

    const responseData = {
      success: true,
      timestamp: new Date().toISOString(),
      metrics: {
        lifetime,
        daily,
        weekly,
        monthly,
        userActivity,
        engagement,
        growthRates
      },
      content: {
        topContent,
        eventBreakdown,
        recentActivity
      },
      summary: {
        totalUsers: lifetime.users,
        totalTwins: lifetime.twins,
        totalChats: lifetime.chats,
        totalMessages: lifetime.messages,
        totalEvents: lifetime.events,
        activeUsersToday: userActivity.activeUsersToday,
        newUsersToday: userActivity.newUsersToday,
        avgEngagement: engagement.avgMessagesPerChat
      }
    };

    console.log('Admin analytics data generated successfully');
    res.json(responseData);

  } catch (error) {
    logger.error('Admin analytics error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get detailed user analytics for admin
export const getAdminUserAnalytics = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID required' });
    }

    // Get detailed user data
    const [
      userResult,
      userTwinsResult,
      userChatsResult,
      userMessagesResult,
      userEventsResult,
      userInvitesResult,
      userActivityResult
    ] = await Promise.all([
      db.query('SELECT * FROM "User" WHERE id = $1', [userId]),
      db.query('SELECT * FROM "Twin" WHERE "userId" = $1', [userId]),
      db.query('SELECT * FROM "Chat" WHERE "userId" = $1', [userId]),
      db.query('SELECT COUNT(*) as count FROM "Message" m JOIN "Chat" c ON m."chatId" = c.id WHERE c."userId" = $1', [userId]),
      db.query('SELECT * FROM "Event" WHERE "userId" = $1 ORDER BY "createdAt" DESC', [userId]),
      db.query('SELECT * FROM "Invite" WHERE "inviterId" = $1 OR "acceptedBy" = $1', [userId]),
      db.query('SELECT type, COUNT(*) as count, DATE("createdAt") as date FROM "Event" WHERE "userId" = $1 GROUP BY type, DATE("createdAt") ORDER BY date DESC', [userId])
    ]);

    const user = userResult.rows[0];
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userAnalytics = {
      user,
      stats: {
        twins: userTwinsResult.rows.length,
        chats: userChatsResult.rows.length,
        messages: parseInt(userMessagesResult.rows[0].count),
        events: userEventsResult.rows.length,
        invites: userInvitesResult.rows.length
      },
      twins: userTwinsResult.rows,
      chats: userChatsResult.rows,
      events: userEventsResult.rows,
      invites: userInvitesResult.rows,
      activity: userActivityResult.rows
    };

    res.json({
      success: true,
      data: userAnalytics
    });

  } catch (error) {
    logger.error('Admin user analytics error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get system health metrics
export const getSystemHealth = async (req: Request, res: Response) => {
  try {
    const [
      dbHealthResult,
      recentErrorsResult,
      performanceResult
    ] = await Promise.all([
      db.query('SELECT NOW() as current_time, version() as db_version'),
      db.query('SELECT COUNT(*) as error_count FROM "Event" WHERE type = \'error\' AND "createdAt" >= NOW() - INTERVAL \'24 hours\''),
      db.query('SELECT AVG(EXTRACT(EPOCH FROM ("createdAt" - LAG("createdAt") OVER (ORDER BY "createdAt")))) as avg_response_time FROM "Event" WHERE "createdAt" >= NOW() - INTERVAL \'1 hour\'')
    ]);

    const systemHealth = {
      database: {
        status: 'healthy',
        currentTime: dbHealthResult.rows[0].current_time,
        version: dbHealthResult.rows[0].db_version
      },
      errors: {
        last24Hours: parseInt(recentErrorsResult.rows[0].error_count)
      },
      performance: {
        avgResponseTime: parseFloat(performanceResult.rows[0].avg_response_time || 0)
      }
    };

    res.json({
      success: true,
      health: systemHealth
    });

  } catch (error) {
    logger.error('System health check error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
