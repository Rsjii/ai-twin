import { Request, Response } from 'express';
import { db } from '../../config/database';
import { logger } from '../../config/logger';
import { ADMIN_EMAILS, QUERY_LIMITS } from '../../config/constants';

// Admin authentication middleware - returns 404 to hide admin pages
export const requireAdminAuth = (req: Request, res: Response, next: Function) => {
  // Check if user is admin
  if (!req.user || !req.user.email || !ADMIN_EMAILS.includes(req.user.email)) {
    // Return 404 instead of 403 to hide that admin pages exist
    return res.status(404).json({ error: 'Not found' });
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
      
      // Daily metrics (today) - optimized to use index-friendly range queries
      db.query('SELECT COUNT(*) as count FROM "User" WHERE "createdAt" >= CURRENT_DATE AND "createdAt" < CURRENT_DATE + INTERVAL \'1 day\''),
      db.query('SELECT COUNT(*) as count FROM "Twin" WHERE "createdAt" >= CURRENT_DATE AND "createdAt" < CURRENT_DATE + INTERVAL \'1 day\''),
      db.query('SELECT COUNT(*) as count FROM "Chat" WHERE "createdAt" >= CURRENT_DATE AND "createdAt" < CURRENT_DATE + INTERVAL \'1 day\''),
      db.query('SELECT COUNT(*) as count FROM "Message" WHERE "createdAt" >= CURRENT_DATE AND "createdAt" < CURRENT_DATE + INTERVAL \'1 day\''),
      db.query('SELECT COUNT(*) as count FROM "Event" WHERE "createdAt" >= CURRENT_DATE AND "createdAt" < CURRENT_DATE + INTERVAL \'1 day\''),
      
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
      db.query('SELECT COUNT(*) as count FROM "User" WHERE "createdAt" >= CURRENT_DATE AND "createdAt" < CURRENT_DATE + INTERVAL \'1 day\''),
      db.query('SELECT COUNT(*) as count FROM "User" WHERE "createdAt" >= NOW() - INTERVAL \'7 days\''),
      db.query('SELECT COUNT(*) as count FROM "User" WHERE "createdAt" >= NOW() - INTERVAL \'30 days\''),
      
      // Engagement metrics
      db.query('SELECT AVG(message_count) as avg FROM (SELECT COUNT(*) as message_count FROM "Message" GROUP BY "chatId") as subquery'),
      db.query('SELECT AVG(chat_count) as avg FROM (SELECT COUNT(*) as chat_count FROM "Chat" GROUP BY "userId") as subquery'),
      db.query('SELECT AVG(event_count) as avg FROM (SELECT COUNT(*) as event_count FROM "Event" GROUP BY "userId") as subquery'),
      
      // Top performing content
      db.query(`SELECT t.id, t."userId", t."styleVector", t."sampleReply", t."instructions", t."isPublic", t."publicHandle", t."bio", t."profileImage", t."verified", t."likeCount", t."followCount", t."chatCount", t."createdAt", u.handle as userHandle, u.name as userName FROM "Twin" t JOIN "User" u ON t."userId" = u.id ORDER BY t."likeCount" DESC, t."chatCount" DESC LIMIT ${QUERY_LIMITS.RECENT_ITEMS}`),
      db.query(`SELECT u.id, u.email, u."passwordHash", u.handle, u.name, u.dob, u.phone, u.bio, u.active, u."referralCode", u."createdAt", u."profileImage", COUNT(e.id) as eventCount FROM "User" u LEFT JOIN "Event" e ON u.id = e."userId" GROUP BY u.id ORDER BY eventCount DESC LIMIT ${QUERY_LIMITS.RECENT_ITEMS}`),
      
      // Event breakdown
      db.query('SELECT type, COUNT(*) as count FROM "Event" GROUP BY type ORDER BY count DESC'),
      
      // Recent activity
      db.query(`SELECT id, email, handle, name, "createdAt", active FROM "User" ORDER BY "createdAt" DESC LIMIT ${QUERY_LIMITS.RECENT_ITEMS}`),      
      db.query(`SELECT t.id, t."userId", t."styleVector", t."sampleReply", t."instructions", t."isPublic", t."publicHandle", t."bio", t."profileImage", t."verified", t."likeCount", t."followCount", t."chatCount", t."createdAt", u.handle as userHandle FROM "Twin" t JOIN "User" u ON t."userId" = u.id ORDER BY t."createdAt" DESC LIMIT ${QUERY_LIMITS.RECENT_ITEMS}`),
      db.query(`SELECT c.id, c."userId", c."twinId", c."createdAt", u.handle as userHandle FROM "Chat" c JOIN "User" u ON c."userId" = u.id ORDER BY c."createdAt" DESC LIMIT ${QUERY_LIMITS.RECENT_ITEMS}`),
      db.query(`SELECT e.id, e."userId", e.type, e.meta, e."createdAt", u.handle as userHandle FROM "Event" e LEFT JOIN "User" u ON e."userId" = u.id ORDER BY e."createdAt" DESC LIMIT ${QUERY_LIMITS.RECENT_ACTIVITY}`)
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
      db.query('SELECT id, email, "passwordHash", handle, name, dob, phone, bio, active, "referralCode", "createdAt", "profileImage" FROM "User" WHERE id = $1', [userId]),
      db.query('SELECT id, "userId", "styleVector", "sampleReply", "instructions", "isPublic", "publicHandle", "bio", "profileImage", "verified", "likeCount", "followCount", "chatCount", "createdAt" FROM "Twin" WHERE "userId" = $1', [userId]),
      db.query('SELECT id, "userId", "twinId", "createdAt" FROM "Chat" WHERE "userId" = $1', [userId]),
      db.query('SELECT COUNT(*) as count FROM "Message" m JOIN "Chat" c ON m."chatId" = c.id WHERE c."userId" = $1', [userId]),
      db.query('SELECT id, "userId", type, meta, "createdAt" FROM "Event" WHERE "userId" = $1 ORDER BY "createdAt" DESC', [userId]),
      db.query('SELECT id, code, "inviterId", "acceptedBy", "createdAt" FROM "Invite" WHERE "inviterId" = $1 OR "acceptedBy" = $1', [userId]),
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

// Get detailed user information for admin
export const getDetailedUserInfo = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID required' });
    }

    // Get comprehensive user data
    const [
      userResult,
      userTwinsResult,
      userChatsResult,
      userMessagesResult,
      userEventsResult,
      userInvitesResult,
      userActivityResult,
      userEngagementResult,
      userTimelineResult
    ] = await Promise.all([
      db.query('SELECT id, email, "passwordHash", handle, name, dob, phone, bio, active, "referralCode", "createdAt", "profileImage" FROM "User" WHERE id = $1', [userId]),
      db.query('SELECT id, "userId", "styleVector", "sampleReply", "instructions", "isPublic", "publicHandle", "bio", "profileImage", "verified", "likeCount", "followCount", "chatCount", "createdAt" FROM "Twin" WHERE "userId" = $1 ORDER BY "createdAt" DESC', [userId]),
      db.query('SELECT c.id, c."userId", c."twinId", c."createdAt", t.id as twinId FROM "Chat" c LEFT JOIN "Twin" t ON c."twinId" = t.id WHERE c."userId" = $1 ORDER BY c."createdAt" DESC', [userId]),
      db.query('SELECT COUNT(*) as count FROM "Message" m JOIN "Chat" c ON m."chatId" = c.id WHERE c."userId" = $1', [userId]),
      db.query(`SELECT id, "userId", type, meta, "createdAt" FROM "Event" WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT ${QUERY_LIMITS.ANALYTICS_DETAILS}`, [userId]),
      db.query('SELECT id, code, "inviterId", "acceptedBy", "createdAt" FROM "Invite" WHERE "inviterId" = $1 OR "acceptedBy" = $1 ORDER BY "createdAt" DESC', [userId]),
      db.query(`SELECT type, COUNT(*) as count, DATE("createdAt") as date FROM "Event" WHERE "userId" = $1 GROUP BY type, DATE("createdAt") ORDER BY date DESC LIMIT ${QUERY_LIMITS.ANALYTICS_TIMELINE}`, [userId]),
      db.query('SELECT AVG(chat_count) as avg_chats, AVG(message_count) as avg_messages FROM (SELECT COUNT(c.id) as chat_count, COUNT(m.id) as message_count FROM "Chat" c LEFT JOIN "Message" m ON c.id = m."chatId" WHERE c."userId" = $1 GROUP BY c.id) as subquery', [userId]),
      db.query(`SELECT DATE("createdAt") as date, COUNT(*) as events FROM "Event" WHERE "userId" = $1 GROUP BY DATE("createdAt") ORDER BY date DESC LIMIT ${QUERY_LIMITS.ANALYTICS_TIMELINE}`, [userId])
    ]);

    const user = userResult.rows[0];
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const detailedUserInfo = {
      user,
      stats: {
        twins: userTwinsResult.rows.length,
        chats: userChatsResult.rows.length,
        messages: parseInt(userMessagesResult.rows[0].count),
        events: userEventsResult.rows.length,
        invites: userInvitesResult.rows.length,
        avgChatsPerDay: parseFloat(userEngagementResult.rows[0].avg_chats || 0),
        avgMessagesPerDay: parseFloat(userEngagementResult.rows[0].avg_messages || 0)
      },
      twins: userTwinsResult.rows,
      chats: userChatsResult.rows,
      events: userEventsResult.rows,
      invites: userInvitesResult.rows,
      activity: userActivityResult.rows,
      timeline: userTimelineResult.rows
    };

    res.json({
      success: true,
      data: detailedUserInfo
    });

  } catch (error) {
    logger.error('Detailed user info error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Remove user (admin only)
export const removeUser = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID required' });
    }

    // Check if user exists
    const userResult = await db.query('SELECT id, email, "passwordHash", handle, name, dob, phone, bio, active, "referralCode", "createdAt", "profileImage" FROM "User" WHERE id = $1', [userId]);
    if (!userResult.rows[0]) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Delete user and all related data (cascade)
    await db.query('DELETE FROM "User" WHERE id = $1', [userId]);

    res.json({
      success: true,
      message: 'User and all related data removed successfully'
    });

  } catch (error) {
    logger.error('Remove user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get time-based analytics with detailed breakdown
export const getTimeBasedAnalytics = async (req: Request, res: Response) => {
  try {
    const { period } = req.params; // today, week, month
    
    let timeFilter = '';
    let interval = '';
    
    switch (period) {
      case 'today':
        // Optimized: use range query instead of DATE() function for index usage
        timeFilter = '"createdAt" >= CURRENT_DATE AND "createdAt" < CURRENT_DATE + INTERVAL \'1 day\'';
        interval = '1 hour';
        break;
      case 'week':
        timeFilter = '"createdAt" >= NOW() - INTERVAL \'7 days\'';
        interval = '1 day';
        break;
      case 'month':
        timeFilter = '"createdAt" >= NOW() - INTERVAL \'30 days\'';
        interval = '1 day';
        break;
      default:
        return res.status(400).json({ error: 'Invalid period. Use: today, week, month' });
    }

    // Get detailed time-based analytics
    const [
      usersResult,
      twinsResult,
      chatsResult,
      messagesResult,
      eventsResult,
      hourlyBreakdownResult,
      dailyBreakdownResult,
      topUsersResult,
      topTwinsResult,
      eventBreakdownResult
    ] = await Promise.all([
      db.query(`SELECT COUNT(*) as count FROM "User" WHERE ${timeFilter}`),
      db.query(`SELECT COUNT(*) as count FROM "Twin" WHERE ${timeFilter}`),
      db.query(`SELECT COUNT(*) as count FROM "Chat" WHERE ${timeFilter}`),
      db.query(`SELECT COUNT(*) as count FROM "Message" WHERE ${timeFilter}`),
      db.query(`SELECT COUNT(*) as count FROM "Event" WHERE ${timeFilter}`),
      db.query(`SELECT EXTRACT(HOUR FROM "createdAt") as hour, COUNT(*) as count FROM "Event" WHERE ${timeFilter} GROUP BY EXTRACT(HOUR FROM "createdAt") ORDER BY hour`),
      db.query(`SELECT DATE("createdAt") as date, COUNT(*) as count FROM "Event" WHERE ${timeFilter} GROUP BY DATE("createdAt") ORDER BY date`),
      db.query(`SELECT u.id, u.email, u."passwordHash", u.handle, u.name, u.dob, u.phone, u.bio, u.active, u."referralCode", u."createdAt", u."profileImage", COUNT(e.id) as eventCount FROM "User" u LEFT JOIN "Event" e ON u.id = e."userId" WHERE ${timeFilter} GROUP BY u.id ORDER BY eventCount DESC LIMIT ${QUERY_LIMITS.RECENT_ITEMS}`),
      db.query(`SELECT t.id, t."userId", t."styleVector", t."sampleReply", t."instructions", t."isPublic", t."publicHandle", t."bio", t."profileImage", t."verified", t."likeCount", t."followCount", t."chatCount", t."createdAt", u.handle as userHandle FROM "Twin" t JOIN "User" u ON t."userId" = u.id WHERE ${timeFilter} ORDER BY t."likeCount" DESC, t."chatCount" DESC LIMIT ${QUERY_LIMITS.RECENT_ITEMS}`),
      db.query(`SELECT type, COUNT(*) as count FROM "Event" WHERE ${timeFilter} GROUP BY type ORDER BY count DESC`)
    ]);

    const timeBasedAnalytics = {
      period,
      summary: {
        users: parseInt(usersResult.rows[0].count),
        twins: parseInt(twinsResult.rows[0].count),
        chats: parseInt(chatsResult.rows[0].count),
        messages: parseInt(messagesResult.rows[0].count),
        events: parseInt(eventsResult.rows[0].count)
      },
      breakdown: {
        hourly: hourlyBreakdownResult.rows,
        daily: dailyBreakdownResult.rows
      },
      topContent: {
        users: topUsersResult.rows,
        twins: topTwinsResult.rows
      },
      eventBreakdown: eventBreakdownResult.rows.reduce((acc, event) => {
        acc[event.type] = parseInt(event.count);
        return acc;
      }, {} as Record<string, number>)
    };

    res.json({
      success: true,
      data: timeBasedAnalytics
    });

  } catch (error) {
    logger.error('Time-based analytics error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get detailed users list for admin
export const getUsersList = async (req: Request, res: Response) => {
  try {
    const { search, limit = QUERY_LIMITS.DEFAULT_PAGE_SIZE, offset = 0 } = req.query;
    
    let whereClause = '';
    let queryParams: any[] = [];
    
    if (search) {
      whereClause = 'WHERE u.email ILIKE $1 OR u.handle ILIKE $1';
      queryParams.push(`%${search}%`);
    }
    
    const usersResult = await db.query(`
      SELECT u.id, u.email, u."passwordHash", u.handle, u.name, u.dob, u.phone, u.bio, u.active, u."referralCode", u."createdAt", u."profileImage", 
             COUNT(DISTINCT t.id) as twinCount,
             COUNT(DISTINCT c.id) as chatCount,
             COUNT(DISTINCT e.id) as eventCount,
             MAX(e."createdAt") as lastActivity
      FROM "User" u
      LEFT JOIN "Twin" t ON u.id = t."userId"
      LEFT JOIN "Chat" c ON u.id = c."userId"
      LEFT JOIN "Event" e ON u.id = e."userId"
      ${whereClause}
      GROUP BY u.id
      ORDER BY u."createdAt" DESC
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `, [...queryParams, parseInt(limit as string), parseInt(offset as string)]);
    
    const totalUsersResult = await db.query(`
      SELECT COUNT(*) as total FROM "User" u ${whereClause}
    `, queryParams);
    
    res.json({
      success: true,
      data: {
        users: usersResult.rows,
        total: parseInt(totalUsersResult.rows[0].total),
        limit: parseInt(limit as string),
        offset: parseInt(offset as string)
      }
    });
    
  } catch (error) {
    logger.error('Get users list error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get detailed metrics for specific type
export const getDetailedMetrics = async (req: Request, res: Response) => {
  try {
    const { type } = req.params;
    
    let data: any = {};
    
    switch (type) {
      case 'users':
        const [totalUsersResult, activeUsersResult, newUsersResult, usersListResult] = await Promise.all([
          db.query('SELECT COUNT(*) as count FROM "User"'),
          db.query('SELECT COUNT(*) as count FROM "User" WHERE "lastLoginAt" >= NOW() - INTERVAL \'24 hours\''),
          db.query('SELECT COUNT(*) as count FROM "User" WHERE "createdAt" >= NOW() - INTERVAL \'7 days\''),
          db.query(`SELECT u.id, u.email, u."passwordHash", u.handle, u.name, u.dob, u.phone, u.bio, u.active, u."referralCode", u."createdAt", u."profileImage", COUNT(DISTINCT t.id) as twinCount, COUNT(DISTINCT c.id) as chatCount FROM "User" u LEFT JOIN "Twin" t ON u.id = t."userId" LEFT JOIN "Chat" c ON u.id = c."userId" GROUP BY u.id ORDER BY u."createdAt" DESC LIMIT ${QUERY_LIMITS.ANALYTICS_DETAILS}`)
        ]);
        
        data = {
          totalUsers: parseInt(totalUsersResult.rows[0].count),
          activeUsers: parseInt(activeUsersResult.rows[0].count),
          newUsers: parseInt(newUsersResult.rows[0].count),
          users: usersListResult.rows
        };
        break;
        
      case 'twins':
        const [totalTwinsResult, popularTwinsResult, recentTwinsResult] = await Promise.all([
          db.query('SELECT COUNT(*) as count FROM "Twin"'),
          db.query(`SELECT t.id, t."userId", t."styleVector", t."sampleReply", t."instructions", t."isPublic", t."publicHandle", t."bio", t."profileImage", t."verified", t."likeCount", t."followCount", t."chatCount", t."createdAt", u.handle as userHandle, u.email as userEmail FROM "Twin" t JOIN "User" u ON t."userId" = u.id ORDER BY t."likeCount" DESC, t."chatCount" DESC LIMIT ${QUERY_LIMITS.ANALYTICS_DETAILS}`),
          db.query(`SELECT t.id, t."userId", t."styleVector", t."sampleReply", t."instructions", t."isPublic", t."publicHandle", t."bio", t."profileImage", t."verified", t."likeCount", t."followCount", t."chatCount", t."createdAt", u.handle as userHandle, u.email as userEmail FROM "Twin" t JOIN "User" u ON t."userId" = u.id ORDER BY t."createdAt" DESC LIMIT ${QUERY_LIMITS.ANALYTICS_DETAILS}`)
        ]);
        
        data = {
          totalTwins: parseInt(totalTwinsResult.rows[0].count),
          popularTwins: popularTwinsResult.rows,
          recentTwins: recentTwinsResult.rows
        };
        break;
        
      case 'chats':
        const [totalChatsResult, activeChatsResult, chatStatsResult] = await Promise.all([
          db.query('SELECT COUNT(*) as count FROM "Chat"'),
          db.query('SELECT COUNT(*) as count FROM "Chat" WHERE "createdAt" >= NOW() - INTERVAL \'24 hours\''),
          db.query(`SELECT c.id, c."userId", c."twinId", c."createdAt", u.handle as userHandle, u.email as userEmail, t.id as twinId FROM "Chat" c JOIN "User" u ON c."userId" = u.id LEFT JOIN "Twin" t ON c."twinId" = t.id ORDER BY c."createdAt" DESC LIMIT ${QUERY_LIMITS.ANALYTICS_DETAILS}`)
        ]);
        
        data = {
          totalChats: parseInt(totalChatsResult.rows[0].count),
          activeChats: parseInt(activeChatsResult.rows[0].count),
          chats: chatStatsResult.rows
        };
        break;
        
      case 'messages':
        const [totalMessagesResult, recentMessagesResult, messageStatsResult] = await Promise.all([
          db.query('SELECT COUNT(*) as count FROM "Message"'),
          db.query('SELECT COUNT(*) as count FROM "Message" WHERE "createdAt" >= NOW() - INTERVAL \'24 hours\''),
          db.query(`SELECT m.id, m."chatId", m.sender, m.content, m.approved, m."createdAt", u.handle as userHandle FROM "Message" m JOIN "Chat" c ON m."chatId" = c.id JOIN "User" u ON c."userId" = u.id ORDER BY m."createdAt" DESC LIMIT ${QUERY_LIMITS.ANALYTICS_DETAILS}`)
        ]);
        
        data = {
          totalMessages: parseInt(totalMessagesResult.rows[0].count),
          recentMessages: parseInt(recentMessagesResult.rows[0].count),
          messages: messageStatsResult.rows
        };
        break;
        
      default:
        return res.status(400).json({ error: 'Invalid metric type' });
    }
    
    res.json({
      success: true,
      data
    });
    
  } catch (error) {
    logger.error('Get detailed metrics error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get detailed users page data with pagination
export const getDetailedUsersPage = async (req: Request, res: Response) => {
  try {
    console.log('=== GET DETAILED USERS PAGE ===');
    
    const { page = 1, limit = QUERY_LIMITS.RECENT_ITEMS, search = '', sortBy = 'createdAt', sortOrder = 'DESC' } = req.query;
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
    
    let whereClause = '';
    let queryParams: any[] = [];
    
    if (search) {
      whereClause = 'WHERE u.email ILIKE $1 OR u.handle ILIKE $1';
      queryParams.push(`%${search}%`);
    }
    
    // Simple query first
    const usersResult = await db.query(`
      SELECT u.id, u.email, u.handle, u."createdAt"
      FROM "User" u
      ${whereClause}
      ORDER BY u."createdAt" DESC
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `, [...queryParams, parseInt(limit as string), offset]);
    
    // Get total count
    const totalResult = await db.query(`
      SELECT COUNT(*) as total FROM "User" u ${whereClause}
    `, queryParams);
    
// Get summary with active users today
const summaryResult = await db.query(`
  SELECT 
    COUNT(*) as totalUsers,
    COUNT(CASE WHEN "createdAt" >= NOW() - INTERVAL '24 hours' THEN 1 END) as newToday,
    COUNT(CASE WHEN "createdAt" >= NOW() - INTERVAL '7 days' THEN 1 END) as newThisWeek,
    COUNT(CASE WHEN "createdAt" >= NOW() - INTERVAL '30 days' THEN 1 END) as newThisMonth,
    (
      SELECT COUNT(DISTINCT "userId")
      FROM "Event"
      WHERE "createdAt" >= NOW() - INTERVAL '24 hours'
        AND "userId" IS NOT NULL
    ) as activeToday
  FROM "User"
`);    
    
    console.log('Users page data fetched successfully');
    
    res.json({
      success: true,
      data: {
        users: usersResult.rows,
        pagination: {
          currentPage: parseInt(page as string),
          totalPages: Math.ceil(parseInt(totalResult.rows[0].total) / parseInt(limit as string)),
          totalItems: parseInt(totalResult.rows[0].total),
          itemsPerPage: parseInt(limit as string)
        },
        summary: summaryResult.rows[0]
      }
    });
    
  } catch (error) {
    console.error('=== ERROR IN GET DETAILED USERS PAGE ===');
    console.error('Error details:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
};

// Get detailed twins page data with pagination
export const getDetailedTwinsPage = async (req: Request, res: Response) => {
  try {
    console.log('=== GET DETAILED TWINS PAGE ===');
    
    const { page = 1, limit = QUERY_LIMITS.RECENT_ITEMS, search = '', sortBy = 'createdAt', sortOrder = 'DESC' } = req.query;
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
    
    let whereClause = '';
    let queryParams: any[] = [];
    
    if (search) {
      whereClause = 'WHERE u.email ILIKE $1 OR u.handle ILIKE $1';
      queryParams.push(`%${search}%`);
    }
    
    const twinsResult = await db.query(`
      SELECT t.id, t."createdAt",
             u.handle as "userHandle", u.email as "userEmail"
      FROM "Twin" t
      JOIN "User" u ON t."userId" = u.id
      ${whereClause}
      ORDER BY t."createdAt" DESC
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `, [...queryParams, parseInt(limit as string), offset]);
    
    // Get total count
    const totalResult = await db.query(`
      SELECT COUNT(*) as total FROM "Twin" t JOIN "User" u ON t."userId" = u.id ${whereClause}
    `, queryParams);
    
// Get summary with averages
const summaryResult = await db.query(`
  SELECT 
    COUNT(*) as totalTwins,
    COUNT(CASE WHEN t."createdAt" >= NOW() - INTERVAL '24 hours' THEN 1 END) as newToday,
    COUNT(CASE WHEN t."createdAt" >= NOW() - INTERVAL '7 days' THEN 1 END) as newThisWeek,
    COUNT(CASE WHEN t."createdAt" >= NOW() - INTERVAL '30 days' THEN 1 END) as newThisMonth,
    COALESCE(AVG(t."likeCount"), 0)::numeric(10,2) as avgLikes,
    COALESCE(AVG(t."chatCount"), 0)::numeric(10,2) as avgChats
  FROM "Twin" t
`);    
    
    console.log('Twins page data fetched successfully');
    
    res.json({
      success: true,
      data: {
        twins: twinsResult.rows,
        pagination: {
          currentPage: parseInt(page as string),
          totalPages: Math.ceil(parseInt(totalResult.rows[0].total) / parseInt(limit as string)),
          totalItems: parseInt(totalResult.rows[0].total),
          itemsPerPage: parseInt(limit as string)
        },
        summary: summaryResult.rows[0]
      }
    });
    
  } catch (error) {
    console.error('=== ERROR IN GET DETAILED TWINS PAGE ===');
    console.error('Error details:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
};

// Get detailed chats page data with pagination
export const getDetailedChatsPage = async (req: Request, res: Response) => {
  try {
    console.log('=== GET DETAILED CHATS PAGE ===');
    
    const { page = 1, limit = QUERY_LIMITS.RECENT_ITEMS, search = '', sortBy = 'createdAt', sortOrder = 'DESC' } = req.query;
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
    
    let whereClause = '';
    let queryParams: any[] = [];
    
    if (search) {
      whereClause = 'WHERE u.email ILIKE $1 OR u.handle ILIKE $1';
      queryParams.push(`%${search}%`);
    }
    
    // Simple query first
    const chatsResult = await db.query(`
      SELECT c.id, c."createdAt",
             u.handle as "userHandle", u.email as "userEmail"
      FROM "Chat" c
      JOIN "User" u ON c."userId" = u.id
      ${whereClause}
      ORDER BY c."createdAt" DESC
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `, [...queryParams, parseInt(limit as string), offset]);
    
    // Get total count
    const totalResult = await db.query(`
      SELECT COUNT(*) as total FROM "Chat" c JOIN "User" u ON c."userId" = u.id ${whereClause}
    `, queryParams);
    
// Get summary with avg messages per chat (optimized)
const summaryResult = await db.query(`
  SELECT 
    COUNT(DISTINCT c.id) as totalChats,
    COUNT(DISTINCT CASE WHEN c."createdAt" >= NOW() - INTERVAL '24 hours' THEN c.id END) as newToday,
    COUNT(DISTINCT CASE WHEN c."createdAt" >= NOW() - INTERVAL '7 days' THEN c.id END) as newThisWeek,
    COUNT(DISTINCT CASE WHEN c."createdAt" >= NOW() - INTERVAL '30 days' THEN c.id END) as newThisMonth,
    COALESCE(
      (SELECT AVG(msg_count)::numeric(10,2)
       FROM (
         SELECT COUNT(*) as msg_count
         FROM "Message" m
         GROUP BY m."chatId"
       ) msg_stats
      ), 0
    ) as avgMessagesPerChat
  FROM "Chat" c
`);

    console.log('Chats page data fetched successfully');
    
    res.json({
      success: true,
      data: {
        chats: chatsResult.rows,
        pagination: {
          currentPage: parseInt(page as string),
          totalPages: Math.ceil(parseInt(totalResult.rows[0].total) / parseInt(limit as string)),
          totalItems: parseInt(totalResult.rows[0].total),
          itemsPerPage: parseInt(limit as string)
        },
        summary: summaryResult.rows[0]
      }
    });
    
  } catch (error) {
    console.error('=== ERROR IN GET DETAILED CHATS PAGE ===');
    console.error('Error details:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
};

// Get detailed messages page data with pagination
export const getDetailedMessagesPage = async (req: Request, res: Response) => {
  try {
    console.log('=== GET DETAILED MESSAGES PAGE ===');
    
    const { page = 1, limit = QUERY_LIMITS.RECENT_ITEMS, search = '', sortBy = 'createdAt', sortOrder = 'DESC' } = req.query;
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
    
    let whereClause = '';
    let queryParams: any[] = [];
    
    if (search) {
      whereClause = 'WHERE u.email ILIKE $1 OR u.handle ILIKE $1 OR m.content ILIKE $1';
      queryParams.push(`%${search}%`);
    }
    
    // Simple query first
    const messagesResult = await db.query(`
      SELECT m.id, m.content, m."createdAt",
             u.handle as "userHandle", u.email as "userEmail",
             c.id as "chatId"
      FROM "Message" m
      JOIN "Chat" c ON m."chatId" = c.id
      JOIN "User" u ON c."userId" = u.id
      ${whereClause}
      ORDER BY m."createdAt" DESC
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `, [...queryParams, parseInt(limit as string), offset]);
    
    // Get total count
    const totalResult = await db.query(`
      SELECT COUNT(*) as total FROM "Message" m 
      JOIN "Chat" c ON m."chatId" = c.id 
      JOIN "User" u ON c."userId" = u.id 
      ${whereClause}
    `, queryParams);
    
// Get summary with avg message length
const summaryResult = await db.query(`
  SELECT 
    COUNT(*) as totalMessages,
    COUNT(CASE WHEN m."createdAt" >= NOW() - INTERVAL '24 hours' THEN 1 END) as newToday,
    COUNT(CASE WHEN m."createdAt" >= NOW() - INTERVAL '7 days' THEN 1 END) as newThisWeek,
    COUNT(CASE WHEN m."createdAt" >= NOW() - INTERVAL '30 days' THEN 1 END) as newThisMonth,
    COALESCE(AVG(LENGTH(m.content))::numeric(10,2), 0) as avgMessageLength
  FROM "Message" m
`);    
    
    console.log('Messages page data fetched successfully');
    
    res.json({
      success: true,
      data: {
        messages: messagesResult.rows,
        pagination: {
          currentPage: parseInt(page as string),
          totalPages: Math.ceil(parseInt(totalResult.rows[0].total) / parseInt(limit as string)),
          totalItems: parseInt(totalResult.rows[0].total),
          itemsPerPage: parseInt(limit as string)
        },
        summary: summaryResult.rows[0]
      }
    });
    
  } catch (error) {
    console.error('=== ERROR IN GET DETAILED MESSAGES PAGE ===');
    console.error('Error details:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
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

// ADD this function to get event analytics:

export const getEventAnalytics = async (req: Request, res: Response) => {
  try {
    const { period = 'week' } = req.query;
    
    let timeFilter = '';
    if (period === 'today') {
      timeFilter = `WHERE DATE("createdAt") = CURRENT_DATE`;
    } else if (period === 'week') {
      timeFilter = `WHERE "createdAt" >= NOW() - INTERVAL '7 days'`;
    } else if (period === 'month') {
      timeFilter = `WHERE "createdAt" >= NOW() - INTERVAL '30 days'`;
    }
    
    // Get event breakdown
    const [
      eventTypesResult,
      hourlyResult,
      dailyResult,
      topUsersResult
    ] = await Promise.all([
      db.query(`
        SELECT type, COUNT(*) as count
        FROM "Event"
        ${timeFilter}
        GROUP BY type
        ORDER BY count DESC
      `),
      db.query(`
        SELECT EXTRACT(HOUR FROM "createdAt") as hour, COUNT(*) as count
        FROM "Event"
        ${timeFilter}
        GROUP BY EXTRACT(HOUR FROM "createdAt")
        ORDER BY hour
      `),
      db.query(`
        SELECT DATE("createdAt") as date, COUNT(*) as count
        FROM "Event"
        ${timeFilter}
        GROUP BY DATE("createdAt")
        ORDER BY date DESC
        LIMIT 30
      `),
      db.query(`
        SELECT u.id, u.handle, u.name, COUNT(e.id) as eventCount
        FROM "User" u
        JOIN "Event" e ON u.id = e."userId"
        ${timeFilter}
        GROUP BY u.id, u.handle, u.name
        ORDER BY eventCount DESC
        LIMIT 10
      `)
    ]);
    
    res.json({
      success: true,
      analytics: {
        eventTypes: eventTypesResult.rows,
        hourly: hourlyResult.rows,
        daily: dailyResult.rows,
        topUsers: topUsersResult.rows,
        period
      }
    });
  } catch (error) {
    logger.error('Event analytics error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get filtered events list for Event Explorer
export const getEventExplorer = async (req: Request, res: Response) => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      eventType = '', 
      startDate = '', 
      endDate = '', 
      metaFilter = '',
      userId = ''
    } = req.query;
    
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;
    
    // Event type filter
    if (eventType) {
      conditions.push(`e.type = $${paramIndex}`);
      params.push(eventType);
      paramIndex++;
    }
    
    // Date range filter
    if (startDate) {
      conditions.push(`e."createdAt" >= $${paramIndex}::timestamp`);
      params.push(startDate);
      paramIndex++;
    }
    if (endDate) {
      conditions.push(`e."createdAt" <= $${paramIndex}::timestamp`);
      params.push(endDate);
      paramIndex++;
    }
    
    // User filter
    if (userId) {
      conditions.push(`e."userId" = $${paramIndex}`);
      params.push(userId);
      paramIndex++;
    }
    
    // Meta filter (JSONB query)
    if (metaFilter) {
      // Support for simple key:value filters like "wv:event" or "source:dashboard"
      const [key, value] = metaFilter.split(':');
      if (key && value) {
        conditions.push(`e.meta->>'${key}' = $${paramIndex}`);
        params.push(value);
        paramIndex++;
      }
    }
    
    const whereClause = conditions.length > 0 
      ? `WHERE ${conditions.join(' AND ')}`
      : '';
    
    // Get events with user info
    const eventsResult = await db.query(`
      SELECT 
        e.id,
        e."userId",
        e.type,
        e.meta,
        e."createdAt",
        u.handle as "userHandle",
        u.email as "userEmail"
      FROM "Event" e
      LEFT JOIN "User" u ON e."userId" = u.id
      ${whereClause}
      ORDER BY e."createdAt" DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, [...params, parseInt(limit as string), offset]);
    
    // Get total count
    const countResult = await db.query(`
      SELECT COUNT(*) as total
      FROM "Event" e
      ${whereClause}
    `, params);
    
    // Get event type breakdown for filter dropdown
    const typesResult = await db.query(`
      SELECT DISTINCT type
      FROM "Event"
      ORDER BY type
    `);
    
    res.json({
      success: true,
      data: {
        events: eventsResult.rows,
        pagination: {
          currentPage: parseInt(page as string),
          totalPages: Math.ceil(parseInt(countResult.rows[0].total) / parseInt(limit as string)),
          totalItems: parseInt(countResult.rows[0].total),
          itemsPerPage: parseInt(limit as string)
        },
        eventTypes: typesResult.rows.map(r => r.type)
      }
    });
    
  } catch (error) {
    logger.error('Event explorer error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};