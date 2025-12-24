import { Request, Response } from 'express';
import { db } from '../../config/database';
import { logger } from '../../config/logger';
import { ADMIN_EMAILS, QUERY_LIMITS } from '../../config/constants';
import { sanitizeUser, sanitizeTwin, sanitizeChat, sanitizeMessage, sanitizeEvent, sanitizeInvite, tokenizeId } from '../../utils/idTokenization';
import { detokenizeId } from '../../utils/idTokenization';

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

    // ⚡ FAST_MODE: Skip heavy queries temporarily until indexes are added
    const FAST_MODE = true;

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
      
      // Engagement metrics - SKIP IN FAST_MODE (very heavy)
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
      recentEventsResult,
      
      // NEW: Activation metrics queries - SKIP IN FAST_MODE (heavy EXISTS queries)
      signupsResult,
      signupsWithTwin24hResult,
      signupsWithChat24hResult,
      signupsWithApproval72hResult,
      
      // NEW: Retention metrics queries - SKIP IN FAST_MODE (very heavy)
      retentionD1Result,
      retentionD7Result,
      retentionD30Result,
      cohortDataResult,
      
      // NEW: Virality metrics queries - SKIP IN FAST_MODE (heavy)
      totalInvitesSentResult,
      totalInvitesAcceptedResult,
      invitesPerActiveUserResult,
      sharesPerActiveUserResult,
      inviteConversionRateResult,
      dauResult,
      wauResult,
      mauResult
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
      
      // Engagement metrics - FAST_MODE: Return dummy values
      FAST_MODE 
        ? Promise.resolve({ rows: [{ avg: '0' }] })
        : db.query('SELECT AVG(message_count) as avg FROM (SELECT COUNT(*) as message_count FROM "Message" GROUP BY "chatId") as subquery'),
      FAST_MODE
        ? Promise.resolve({ rows: [{ avg: '0' }] })
        : db.query('SELECT AVG(chat_count) as avg FROM (SELECT COUNT(*) as chat_count FROM "Chat" GROUP BY "userId") as subquery'),
      FAST_MODE
        ? Promise.resolve({ rows: [{ avg: '0' }] })
        : db.query('SELECT AVG(event_count) as avg FROM (SELECT COUNT(*) as event_count FROM "Event" GROUP BY "userId") as subquery'),
      
      // Top performing content
      db.query(`SELECT t.id, t."userId", t."styleVector", t."sampleReply", t."instructions", t."isPublic", t."publicHandle", t."bio", t."profileImage", t."verified", t."likeCount", t."followCount", t."chatCount", t."createdAt", u.handle as userHandle, u.name as userName FROM "Twin" t JOIN "User" u ON t."userId" = u.id ORDER BY t."likeCount" DESC, t."chatCount" DESC LIMIT ${QUERY_LIMITS.RECENT_ITEMS}`),
      db.query(`SELECT u.id, u.email, u."passwordHash", u.handle, u.name, u.dob, u.phone, u.bio, u.active, u."referralCode", u."createdAt", u."profileImage", COUNT(e.id) as eventCount FROM "User" u LEFT JOIN "Event" e ON u.id = e."userId" GROUP BY u.id ORDER BY eventCount DESC LIMIT ${QUERY_LIMITS.RECENT_ITEMS}`),
      
      // Event breakdown
      db.query('SELECT type, COUNT(*) as count FROM "Event" GROUP BY type ORDER BY count DESC'),
      
      // Recent activity
      db.query(`SELECT id, email, handle, name, "createdAt", active FROM "User" ORDER BY "createdAt" DESC LIMIT ${QUERY_LIMITS.RECENT_ITEMS}`),      
      db.query(`SELECT t.id, t."userId", t."styleVector", t."sampleReply", t."instructions", t."isPublic", t."publicHandle", t."bio", t."profileImage", t."verified", t."likeCount", t."followCount", t."chatCount", t."createdAt", u.handle as userHandle FROM "Twin" t JOIN "User" u ON t."userId" = u.id ORDER BY t."createdAt" DESC LIMIT ${QUERY_LIMITS.RECENT_ITEMS}`),
      db.query(`SELECT c.id, c."userId", c."twinId", c."createdAt", u.handle as userHandle FROM "Chat" c JOIN "User" u ON c."userId" = u.id ORDER BY c."createdAt" DESC LIMIT ${QUERY_LIMITS.RECENT_ITEMS}`),
      db.query(`SELECT e.id, e."userId", e.type, e.meta, e."createdAt", u.handle as userHandle FROM "Event" e LEFT JOIN "User" u ON e."userId" = u.id ORDER BY e."createdAt" DESC LIMIT ${QUERY_LIMITS.RECENT_ACTIVITY}`),
      
      // NEW: Activation metrics - FAST_MODE: Return dummy zeros
      FAST_MODE
        ? Promise.resolve({ rows: [{ count: '0' }] })
        : db.query('SELECT COUNT(*) as count FROM "Event" WHERE type = $1', ['signup']),
      FAST_MODE
        ? Promise.resolve({ rows: [{ count: '0' }] })
        : db.query(`
          SELECT COUNT(DISTINCT s."userId") as count
          FROM "Event" s
          WHERE s.type = 'signup'
          AND EXISTS (
            SELECT 1 FROM "Event" t
            WHERE t."userId" = s."userId"
            AND t.type = 'twin_created'
            AND t."createdAt" BETWEEN s."createdAt" AND s."createdAt" + INTERVAL '24 hours'
          )
        `),
      FAST_MODE
        ? Promise.resolve({ rows: [{ count: '0' }] })
        : db.query(`
          SELECT COUNT(DISTINCT s."userId") as count
          FROM "Event" s
          WHERE s.type = 'signup'
          AND EXISTS (
            SELECT 1 FROM "Event" c
            WHERE c."userId" = s."userId"
            AND c.type IN ('chat_started', 'chat_created')
            AND c."createdAt" BETWEEN s."createdAt" AND s."createdAt" + INTERVAL '24 hours'
          )
        `),
      FAST_MODE
        ? Promise.resolve({ rows: [{ count: '0' }] })
        : db.query(`
          SELECT COUNT(DISTINCT s."userId") as count
          FROM "Event" s
          WHERE s.type = 'signup'
          AND EXISTS (
            SELECT 1 FROM "Event" m
            WHERE m."userId" = s."userId"
            AND m.type = 'message_approved'
            AND m."createdAt" BETWEEN s."createdAt" AND s."createdAt" + INTERVAL '72 hours'
          )
        `),
      
      // NEW: Retention metrics - FAST_MODE: Return dummy zeros
      FAST_MODE
        ? Promise.resolve({ rows: [{ count: '0' }] })
        : db.query(`
          SELECT COUNT(DISTINCT s."userId") as count
          FROM "Event" s
          WHERE s.type = 'signup'
          AND s."createdAt" >= NOW() - INTERVAL '30 days'
          AND EXISTS (
            SELECT 1 FROM "Event" e
            WHERE e."userId" = s."userId"
            AND e."createdAt" > s."createdAt"
            AND e."createdAt" <= s."createdAt" + INTERVAL '1 day'
            AND e.type != 'signup'
          )
        `),
      FAST_MODE
        ? Promise.resolve({ rows: [{ count: '0' }] })
        : db.query(`
          SELECT COUNT(DISTINCT s."userId") as count
          FROM "Event" s
          WHERE s.type = 'signup'
          AND s."createdAt" >= NOW() - INTERVAL '37 days'
          AND EXISTS (
            SELECT 1 FROM "Event" e
            WHERE e."userId" = s."userId"
            AND e."createdAt" > s."createdAt"
            AND e."createdAt" <= s."createdAt" + INTERVAL '7 days'
            AND e.type != 'signup'
          )
        `),
      FAST_MODE
        ? Promise.resolve({ rows: [{ count: '0' }] })
        : db.query(`
          SELECT COUNT(DISTINCT s."userId") as count
          FROM "Event" s
          WHERE s.type = 'signup'
          AND s."createdAt" >= NOW() - INTERVAL '60 days'
          AND EXISTS (
            SELECT 1 FROM "Event" e
            WHERE e."userId" = s."userId"
            AND e."createdAt" > s."createdAt"
            AND e."createdAt" <= s."createdAt" + INTERVAL '30 days'
            AND e.type != 'signup'
          )
        `),
      FAST_MODE
        ? Promise.resolve({ rows: [] })
        : db.query(`
          SELECT 
            DATE_TRUNC('month', s."createdAt") as cohort_month,
            COUNT(DISTINCT s."userId") as signups,
            COUNT(DISTINCT CASE 
              WHEN e."createdAt" > s."createdAt" 
              AND e."createdAt" <= s."createdAt" + INTERVAL '1 day'
              THEN e."userId" END) as d1_retained,
            COUNT(DISTINCT CASE 
              WHEN e."createdAt" > s."createdAt" 
              AND e."createdAt" <= s."createdAt" + INTERVAL '7 days'
              THEN e."userId" END) as d7_retained,
            COUNT(DISTINCT CASE 
              WHEN e."createdAt" > s."createdAt" 
              AND e."createdAt" <= s."createdAt" + INTERVAL '30 days'
              THEN e."userId" END) as d30_retained
          FROM "Event" s
          LEFT JOIN "Event" e ON s."userId" = e."userId" AND e.type != 'signup'
          WHERE s.type = 'signup'
          AND s."createdAt" >= NOW() - INTERVAL '90 days'
          GROUP BY DATE_TRUNC('month', s."createdAt")
          ORDER BY cohort_month DESC
          LIMIT 6
        `),
      
      // NEW: Virality metrics - FAST_MODE: Return dummy zeros
      FAST_MODE
        ? Promise.resolve({ rows: [{ count: '0' }] })
        : db.query('SELECT COUNT(*) as count FROM "Event" WHERE type = $1', ['invite_sent']),
      FAST_MODE
        ? Promise.resolve({ rows: [{ count: '0' }] })
        : db.query('SELECT COUNT(*) as count FROM "Event" WHERE type = $1', ['invite_accepted']),
      FAST_MODE
        ? Promise.resolve({ rows: [{ active_users: '0', invites_sent: '0' }] })
        : db.query(`
          SELECT 
            COUNT(DISTINCT i."userId") as active_users,
            COUNT(*) FILTER (WHERE i.type = 'invite_sent') as invites_sent
          FROM "Event" i
          WHERE i."createdAt" >= NOW() - INTERVAL '30 days'
          AND i.type IN ('invite_sent', 'invite_accepted')
        `),
      FAST_MODE
        ? Promise.resolve({ rows: [{ active_users: '0', shares: '0' }] })
        : db.query(`
          SELECT 
            COUNT(DISTINCT s."userId") as active_users,
            COUNT(*) FILTER (WHERE s.type IN ('twin_shared', 'share_clicked', 'profile_shared')) as shares
          FROM "Event" s
          WHERE s."createdAt" >= NOW() - INTERVAL '30 days'
          AND s.type IN ('twin_shared', 'share_clicked', 'profile_shared')
        `),
      FAST_MODE
        ? Promise.resolve({ rows: [{ sent: '0', accepted: '0' }] })
        : db.query(`
          SELECT 
            COUNT(*) FILTER (WHERE type = 'invite_sent') as sent,
            COUNT(*) FILTER (WHERE type = 'invite_accepted') as accepted
          FROM "Event"
          WHERE type IN ('invite_sent', 'invite_accepted')
        `),
      db.query('SELECT COUNT(DISTINCT "userId") as count FROM "Event" WHERE "createdAt" >= CURRENT_DATE'),
      db.query('SELECT COUNT(DISTINCT "userId") as count FROM "Event" WHERE "createdAt" >= NOW() - INTERVAL \'7 days\''),
      db.query('SELECT COUNT(DISTINCT "userId") as count FROM "Event" WHERE "createdAt" >= NOW() - INTERVAL \'30 days\'')
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
      newUsersThisMonth: parseInt(newUsersThisMonthResult.rows[0].count),
      dau: parseInt(dauResult.rows[0].count),
      wau: parseInt(wauResult.rows[0].count),
      mau: parseInt(mauResult.rows[0].count)
    };

    const engagement = {
      avgMessagesPerChat: parseFloat(avgMessagesPerChatResult.rows[0].avg || 0),
      avgChatsPerUser: parseFloat(avgChatsPerUserResult.rows[0].avg || 0),
      avgEventsPerUser: parseFloat(avgEventsPerUserResult.rows[0].avg || 0)
    };

    // ✅ Sanitize topContent
    const topContent = {
      topTwins: topTwinsResult.rows.map(twin => sanitizeTwin(twin)),
      mostActiveUsers: mostActiveUsersResult.rows.map(user => sanitizeUser(user, true)) // includeEmail=true for admin
    };

    const eventBreakdown = eventTypesResult.rows.reduce((acc, event) => {
      acc[event.type] = parseInt(event.count);
      return acc;
    }, {} as Record<string, number>);

    // ✅ Sanitize recentActivity
    const recentActivity = {
      recentSignups: recentSignupsResult.rows.map(user => sanitizeUser(user, true)), // includeEmail=true for admin
      recentTwins: recentTwinsResult.rows.map(twin => sanitizeTwin(twin)),
      recentChats: recentChatsResult.rows.map(chat => sanitizeChat(chat)),
      recentEvents: recentEventsResult.rows.map(event => sanitizeEvent(event))
    };

    // NEW: Process activation metrics
    const totalSignups = parseInt(signupsResult.rows[0].count);
    const signupsWithTwin24h = parseInt(signupsWithTwin24hResult.rows[0].count);
    const signupsWithChat24h = parseInt(signupsWithChat24hResult.rows[0].count);
    const signupsWithApproval72h = parseInt(signupsWithApproval72hResult.rows[0].count);
    
    const activation = {
      signups: totalSignups,
      createdTwinWithin24h: signupsWithTwin24h,
      startedChatWithin24h: signupsWithChat24h,
      approvedMessageWithin72h: signupsWithApproval72h,
      twinCreationRate: totalSignups > 0 ? ((signupsWithTwin24h / totalSignups) * 100).toFixed(2) : '0',
      firstChatRate: totalSignups > 0 ? ((signupsWithChat24h / totalSignups) * 100).toFixed(2) : '0',
      firstApprovalRate: totalSignups > 0 ? ((signupsWithApproval72h / totalSignups) * 100).toFixed(2) : '0'
    };

    // NEW: Process retention metrics
    const totalSignupsForRetention = parseInt(signupsResult.rows[0].count);
    const d1Retained = parseInt(retentionD1Result.rows[0].count);
    const d7Retained = parseInt(retentionD7Result.rows[0].count);
    const d30Retained = parseInt(retentionD30Result.rows[0].count);
    
    const retention = {
      d1: {
        retained: d1Retained,
        rate: totalSignupsForRetention > 0 ? ((d1Retained / totalSignupsForRetention) * 100).toFixed(2) : '0'
      },
      d7: {
        retained: d7Retained,
        rate: totalSignupsForRetention > 0 ? ((d7Retained / totalSignupsForRetention) * 100).toFixed(2) : '0'
      },
      d30: {
        retained: d30Retained,
        rate: totalSignupsForRetention > 0 ? ((d30Retained / totalSignupsForRetention) * 100).toFixed(2) : '0'
      },
      cohorts: cohortDataResult.rows.map(row => ({
        month: row.cohort_month,
        signups: parseInt(row.signups),
        d1Retained: parseInt(row.d1_retained),
        d7Retained: parseInt(row.d7_retained),
        d30Retained: parseInt(row.d30_retained),
        d1Rate: parseInt(row.signups) > 0 ? ((parseInt(row.d1_retained) / parseInt(row.signups)) * 100).toFixed(2) : '0',
        d7Rate: parseInt(row.signups) > 0 ? ((parseInt(row.d7_retained) / parseInt(row.signups)) * 100).toFixed(2) : '0',
        d30Rate: parseInt(row.signups) > 0 ? ((parseInt(row.d30_retained) / parseInt(row.signups)) * 100).toFixed(2) : '0'
      }))
    };

    // NEW: Process virality metrics
    const totalInvitesSent = parseInt(totalInvitesSentResult.rows[0].count);
    const totalInvitesAccepted = parseInt(totalInvitesAcceptedResult.rows[0].count);
    const activeUsersForInvites = parseInt(invitesPerActiveUserResult.rows[0].active_users) || 1;
    const invitesSent = parseInt(invitesPerActiveUserResult.rows[0].invites_sent);
    const activeUsersForShares = parseInt(sharesPerActiveUserResult.rows[0].active_users) || 1;
    const shares = parseInt(sharesPerActiveUserResult.rows[0].shares);
    const invitesSentForConversion = parseInt(inviteConversionRateResult.rows[0].sent) || 1;
    const invitesAcceptedForConversion = parseInt(inviteConversionRateResult.rows[0].accepted);
    
    const virality = {
      totalInvitesSent,
      totalInvitesAccepted,
      invitesPerActiveUser: (invitesSent / activeUsersForInvites).toFixed(2),
      sharesPerActiveUser: (shares / activeUsersForShares).toFixed(2),
      inviteConversionRate: invitesSentForConversion > 0 
        ? ((invitesAcceptedForConversion / invitesSentForConversion) * 100).toFixed(2) 
        : '0'
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
        growthRates,
        // NEW: Add new metrics
        activation,
        retention,
        virality
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
        avgEngagement: engagement.avgMessagesPerChat,
        // NEW: Add key activation/virality metrics to summary
        activationRate: activation.twinCreationRate,
        d7RetentionRate: retention.d7.rate,
        inviteConversionRate: virality.inviteConversionRate
      }
    };

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
    
 // ✅ Detokenize the publicId
 const decoded = detokenizeId(userId);
 if (!decoded || decoded.type !== 'user') {
   return res.status(400).json({ error: 'Invalid user token' });
 }
 const actualUserId = decoded.id;
 
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
   db.query('SELECT id, email, "passwordHash", handle, name, dob, phone, bio, active, "referralCode", "createdAt", "profileImage" FROM "User" WHERE id = $1', [actualUserId]),
   db.query('SELECT id, "userId", "styleVector", "sampleReply", "instructions", "isPublic", "publicHandle", "bio", "profileImage", "verified", "likeCount", "followCount", "chatCount", "createdAt" FROM "Twin" WHERE "userId" = $1', [actualUserId]),
   db.query('SELECT id, "userId", "twinId", "createdAt" FROM "Chat" WHERE "userId" = $1', [actualUserId]),
   db.query('SELECT COUNT(*) as count FROM "Message" m JOIN "Chat" c ON m."chatId" = c.id WHERE c."userId" = $1', [actualUserId]),
   db.query('SELECT id, "userId", type, meta, "createdAt" FROM "Event" WHERE "userId" = $1 ORDER BY "createdAt" DESC', [actualUserId]),
   db.query('SELECT id, code, "inviterId", "acceptedBy", "createdAt" FROM "Invite" WHERE "inviterId" = $1 OR "acceptedBy" = $1', [actualUserId]),
   db.query('SELECT type, COUNT(*) as count, DATE("createdAt") as date FROM "Event" WHERE "userId" = $1 GROUP BY type, DATE("createdAt") ORDER BY date DESC', [actualUserId])
 ]);    

    const user = userResult.rows[0];
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // ✅ Sanitize all user data before returning
    const userAnalytics = {
      user: sanitizeUser(user, true), // includeEmail=true for admin
      stats: {
        twins: userTwinsResult.rows.length,
        chats: userChatsResult.rows.length,
        messages: parseInt(userMessagesResult.rows[0].count),
        events: userEventsResult.rows.length,
        invites: userInvitesResult.rows.length
      },
      twins: userTwinsResult.rows.map(twin => sanitizeTwin(twin)),
      chats: userChatsResult.rows.map(chat => sanitizeChat(chat)),
      events: userEventsResult.rows.map(event => sanitizeEvent(event)),
      invites: userInvitesResult.rows.map(invite => sanitizeInvite(invite)),
      activity: userActivityResult.rows // This is just aggregated stats, no IDs
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
    const { userId } = req.params; // This will now be a publicId token
    
    // ✅ Detokenize the publicId
    const decoded = detokenizeId(userId);
    if (!decoded || decoded.type !== 'user') {
      return res.status(400).json({ error: 'Invalid user token' });
    }
    const actualUserId = decoded.id;

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
      db.query('SELECT id, email, "passwordHash", handle, name, dob, phone, bio, active, "referralCode", "createdAt", "profileImage" FROM "User" WHERE id = $1', [actualUserId]),
      db.query('SELECT id, "userId", "styleVector", "sampleReply", "instructions", "isPublic", "publicHandle", "bio", "profileImage", "verified", "likeCount", "followCount", "chatCount", "createdAt" FROM "Twin" WHERE "userId" = $1 ORDER BY "createdAt" DESC', [actualUserId]),
      db.query('SELECT c.id, c."userId", c."twinId", c."createdAt", t.id as twinId FROM "Chat" c LEFT JOIN "Twin" t ON c."twinId" = t.id WHERE c."userId" = $1 ORDER BY c."createdAt" DESC', [actualUserId]),
      db.query('SELECT COUNT(*) as count FROM "Message" m JOIN "Chat" c ON m."chatId" = c.id WHERE c."userId" = $1', [actualUserId]),
      db.query(`SELECT id, "userId", type, meta, "createdAt" FROM "Event" WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT ${QUERY_LIMITS.ANALYTICS_DETAILS}`, [actualUserId]),
      db.query('SELECT id, code, "inviterId", "acceptedBy", "createdAt" FROM "Invite" WHERE "inviterId" = $1 OR "acceptedBy" = $1 ORDER BY "createdAt" DESC', [actualUserId]),
      db.query(`SELECT type, COUNT(*) as count, DATE("createdAt") as date FROM "Event" WHERE "userId" = $1 GROUP BY type, DATE("createdAt") ORDER BY date DESC LIMIT ${QUERY_LIMITS.ANALYTICS_TIMELINE}`, [actualUserId]),
      db.query('SELECT AVG(chat_count) as avg_chats, AVG(message_count) as avg_messages FROM (SELECT COUNT(c.id) as chat_count, COUNT(m.id) as message_count FROM "Chat" c LEFT JOIN "Message" m ON c.id = m."chatId" WHERE c."userId" = $1 GROUP BY c.id) as subquery', [actualUserId]),
      db.query(`SELECT DATE("createdAt") as date, COUNT(*) as events FROM "Event" WHERE "userId" = $1 GROUP BY DATE("createdAt") ORDER BY date DESC LIMIT ${QUERY_LIMITS.ANALYTICS_TIMELINE}`, [actualUserId])
    ]);

    const user = userResult.rows[0];
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

const detailedUserInfo = {
  user: sanitizeUser(user, true), // includeEmail=true for admin
  stats: {
    twins: userTwinsResult.rows.length,
    chats: userChatsResult.rows.length,
    messages: parseInt(userMessagesResult.rows[0].count),
    events: userEventsResult.rows.length,
    invites: userInvitesResult.rows.length,
    avgChatsPerDay: parseFloat(userEngagementResult.rows[0].avg_chats || 0),
    avgMessagesPerDay: parseFloat(userEngagementResult.rows[0].avg_messages || 0)
  },
  twins: userTwinsResult.rows.map(twin => sanitizeTwin(twin)),
  chats: userChatsResult.rows.map(chat => sanitizeChat(chat)),
  events: userEventsResult.rows.map(event => sanitizeEvent(event)),
  invites: userInvitesResult.rows.map(invite => sanitizeInvite(invite)),
  activity: userActivityResult.rows, // This is just aggregated stats, no IDs
  timeline: userTimelineResult.rows // This is just aggregated stats, no IDs
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
    const { userId } = req.params; // This will now be a publicId token
    
    // ✅ Detokenize the publicId
    const decoded = detokenizeId(userId);
    if (!decoded || decoded.type !== 'user') {
      return res.status(400).json({ error: 'Invalid user token' });
    }
    const actualUserId = decoded.id;

    // Check if user exists
    const userResult = await db.query('SELECT id, email, "passwordHash", handle, name, dob, phone, bio, active, "referralCode", "createdAt", "profileImage" FROM "User" WHERE id = $1', [actualUserId]);
    if (!userResult.rows[0]) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Delete user and all related data (cascade)
    await db.query('DELETE FROM "User" WHERE id = $1', [actualUserId]);

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
    
    // Define alias-specific time filters to avoid ambiguous column errors
    let userTimeFilter = '';
    let twinTimeFilter = '';
    let chatTimeFilter = '';
    let messageTimeFilter = '';
    let eventTimeFilter = '';
    let interval = '';
    
    switch (period) {
      case 'today':
        userTimeFilter = 'u."createdAt" >= CURRENT_DATE AND u."createdAt" < CURRENT_DATE + INTERVAL \'1 day\'';
        twinTimeFilter = 't."createdAt" >= CURRENT_DATE AND t."createdAt" < CURRENT_DATE + INTERVAL \'1 day\'';
        chatTimeFilter = 'c."createdAt" >= CURRENT_DATE AND c."createdAt" < CURRENT_DATE + INTERVAL \'1 day\'';
        messageTimeFilter = 'm."createdAt" >= CURRENT_DATE AND m."createdAt" < CURRENT_DATE + INTERVAL \'1 day\'';
        eventTimeFilter = 'e."createdAt" >= CURRENT_DATE AND e."createdAt" < CURRENT_DATE + INTERVAL \'1 day\'';
        interval = '1 hour';
        break;
      case 'week':
        userTimeFilter = 'u."createdAt" >= NOW() - INTERVAL \'7 days\'';
        twinTimeFilter = 't."createdAt" >= NOW() - INTERVAL \'7 days\'';
        chatTimeFilter = 'c."createdAt" >= NOW() - INTERVAL \'7 days\'';
        messageTimeFilter = 'm."createdAt" >= NOW() - INTERVAL \'7 days\'';
        eventTimeFilter = 'e."createdAt" >= NOW() - INTERVAL \'7 days\'';
        interval = '1 day';
        break;
      case 'month':
        userTimeFilter = 'u."createdAt" >= NOW() - INTERVAL \'30 days\'';
        twinTimeFilter = 't."createdAt" >= NOW() - INTERVAL \'30 days\'';
        chatTimeFilter = 'c."createdAt" >= NOW() - INTERVAL \'30 days\'';
        messageTimeFilter = 'm."createdAt" >= NOW() - INTERVAL \'30 days\'';
        eventTimeFilter = 'e."createdAt" >= NOW() - INTERVAL \'30 days\'';
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
      // Single-table count queries (no aliases needed)
      db.query(period === 'today' 
        ? `SELECT COUNT(*) as count FROM "User" WHERE "createdAt" >= CURRENT_DATE AND "createdAt" < CURRENT_DATE + INTERVAL '1 day'`
        : period === 'week'
        ? `SELECT COUNT(*) as count FROM "User" WHERE "createdAt" >= NOW() - INTERVAL '7 days'`
        : `SELECT COUNT(*) as count FROM "User" WHERE "createdAt" >= NOW() - INTERVAL '30 days'`),
      db.query(period === 'today'
        ? `SELECT COUNT(*) as count FROM "Twin" WHERE "createdAt" >= CURRENT_DATE AND "createdAt" < CURRENT_DATE + INTERVAL '1 day'`
        : period === 'week'
        ? `SELECT COUNT(*) as count FROM "Twin" WHERE "createdAt" >= NOW() - INTERVAL '7 days'`
        : `SELECT COUNT(*) as count FROM "Twin" WHERE "createdAt" >= NOW() - INTERVAL '30 days'`),
      db.query(period === 'today'
        ? `SELECT COUNT(*) as count FROM "Chat" WHERE "createdAt" >= CURRENT_DATE AND "createdAt" < CURRENT_DATE + INTERVAL '1 day'`
        : period === 'week'
        ? `SELECT COUNT(*) as count FROM "Chat" WHERE "createdAt" >= NOW() - INTERVAL '7 days'`
        : `SELECT COUNT(*) as count FROM "Chat" WHERE "createdAt" >= NOW() - INTERVAL '30 days'`),
      db.query(period === 'today'
        ? `SELECT COUNT(*) as count FROM "Message" WHERE "createdAt" >= CURRENT_DATE AND "createdAt" < CURRENT_DATE + INTERVAL '1 day'`
        : period === 'week'
        ? `SELECT COUNT(*) as count FROM "Message" WHERE "createdAt" >= NOW() - INTERVAL '7 days'`
        : `SELECT COUNT(*) as count FROM "Message" WHERE "createdAt" >= NOW() - INTERVAL '30 days'`),
      db.query(period === 'today'
        ? `SELECT COUNT(*) as count FROM "Event" WHERE "createdAt" >= CURRENT_DATE AND "createdAt" < CURRENT_DATE + INTERVAL '1 day'`
        : period === 'week'
        ? `SELECT COUNT(*) as count FROM "Event" WHERE "createdAt" >= NOW() - INTERVAL '7 days'`
        : `SELECT COUNT(*) as count FROM "Event" WHERE "createdAt" >= NOW() - INTERVAL '30 days'`),
      
      // Event breakdowns (use alias for clarity)
      db.query(`SELECT EXTRACT(HOUR FROM e."createdAt") as hour, COUNT(*) as count FROM "Event" e WHERE ${eventTimeFilter} GROUP BY EXTRACT(HOUR FROM e."createdAt") ORDER BY hour`),
      db.query(`SELECT DATE(e."createdAt") as date, COUNT(*) as count FROM "Event" e WHERE ${eventTimeFilter} GROUP BY DATE(e."createdAt") ORDER BY date`),
      
      // Top users - filter on Event activity in this period
      db.query(`SELECT u.id, u.email, u."passwordHash", u.handle, u.name, u.dob, u.phone, u.bio, u.active, u."referralCode", u."createdAt", u."profileImage", COUNT(e.id) as eventCount FROM "User" u LEFT JOIN "Event" e ON u.id = e."userId" AND ${eventTimeFilter} GROUP BY u.id ORDER BY eventCount DESC LIMIT ${QUERY_LIMITS.RECENT_ITEMS}`),
      
      // Top twins - filter on Twin creation in this period
      db.query(`SELECT t.id, t."userId", t."styleVector", t."sampleReply", t."instructions", t."isPublic", t."publicHandle", t."bio", t."profileImage", t."verified", t."likeCount", t."followCount", t."chatCount", t."createdAt", u.handle as userHandle FROM "Twin" t JOIN "User" u ON t."userId" = u.id WHERE ${twinTimeFilter} ORDER BY t."likeCount" DESC, t."chatCount" DESC LIMIT ${QUERY_LIMITS.RECENT_ITEMS}`),
      
      // Event type breakdown
      db.query(`SELECT type, COUNT(*) as count FROM "Event" e WHERE ${eventTimeFilter} GROUP BY type ORDER BY count DESC`)
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
        users: topUsersResult.rows.map(user => sanitizeUser(user, true)),
        twins: topTwinsResult.rows.map(twin => sanitizeTwin(twin)),
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
    
    // ✅ Sanitize users before returning
    res.json({
      success: true,
      data: {
        users: usersResult.rows.map(user => sanitizeUser(user, true)), // includeEmail=true for admin
        pagination: {
          total: parseInt(totalUsersResult.rows[0].total),
          limit: parseInt(limit as string),
          offset: parseInt(offset as string)
        }
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
          users: usersListResult.rows.map(user => sanitizeUser(user, true)) // ✅ Add sanitization
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
          popularTwins: popularTwinsResult.rows.map(twin => sanitizeTwin(twin)), // ✅ Add sanitization
          recentTwins: recentTwinsResult.rows.map(twin => sanitizeTwin(twin)) // ✅ Add sanitization
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
          chats: chatStatsResult.rows.map(chat => sanitizeChat(chat)) // ✅ Add sanitization
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
          messages: messageStatsResult.rows.map(msg => sanitizeMessage(msg)) // ✅ Add sanitization
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
    const { page = 1, limit = QUERY_LIMITS.RECENT_ITEMS, search = '', sortBy = 'createdAt', sortOrder = 'DESC' } = req.query;
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
    
    let whereClause = '';
    let queryParams: any[] = [];
    
    if (search) {
      whereClause = 'WHERE u.email ILIKE $1 OR u.handle ILIKE $1';
      queryParams.push(`%${search}%`);
    }
    
    // Enhanced query with counts
    const usersResult = await db.query(`
      SELECT 
        u.id, 
        u.email, 
        u.handle, 
        u."createdAt",
        u."profileImage",
        (SELECT COUNT(*) FROM "Twin" t WHERE t."userId" = u.id) as "twinCount",
        (SELECT COUNT(*) FROM "Chat" c WHERE c."userId" = u.id) as "chatCount",
        (SELECT COUNT(*) FROM "Event" e WHERE e."userId" = u.id) as "eventCount",
        (SELECT COUNT(*) FROM "Message" m 
         JOIN "Chat" c ON m."chatId" = c.id 
         WHERE c."userId" = u.id) as "messageCount",
        (SELECT COUNT(*) > 0 FROM "Event" e 
         WHERE e."userId" = u.id 
         AND e."createdAt" >= NOW() - INTERVAL '24 hours') as active
      FROM "User" u
      ${whereClause}
      ORDER BY ${sortBy === 'twinCount' ? '(SELECT COUNT(*) FROM "Twin" t WHERE t."userId" = u.id)' :
                sortBy === 'chatCount' ? '(SELECT COUNT(*) FROM "Chat" c WHERE c."userId" = u.id)' :
                sortBy === 'eventCount' ? '(SELECT COUNT(*) FROM "Event" e WHERE e."userId" = u.id)' :
                `u."${sortBy}"`} ${sortOrder}
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
    
    // ✅ Sanitize users before returning
    res.json({
      success: true,
      data: {
        users: usersResult.rows.map(user => {
          const sanitized = sanitizeUser(user, true);
          //Add publicId
          sanitized.publicId = tokenizeId(user.id, 'user');
          return sanitized;
        }),
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
    logger.error('Get detailed users page error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
};

// Get detailed twins page data with pagination
export const getDetailedTwinsPage = async (req: Request, res: Response) => {
  try {
    
    const { page = 1, limit = QUERY_LIMITS.RECENT_ITEMS, search = '', sortBy = 'createdAt', sortOrder = 'DESC' } = req.query;
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
    
    let whereClause = '';
    let queryParams: any[] = [];
    
    if (search) {
      whereClause = 'WHERE (u.email ILIKE $1 OR u.handle ILIKE $1 OR t."publicHandle" ILIKE $1)';
      queryParams.push(`%${search}%`);
    }    
    
    // Enhanced query with counts and public fields
    const twinsResult = await db.query(`
      SELECT 
        t.id, 
        t."createdAt",
        t."likeCount",
        t."followCount",
        t."chatCount",
        t."publicHandle",
        t."isPublic",
        u.handle as "userHandle", 
        u.email as "userEmail",
        (SELECT COUNT(*) FROM "Message" m 
         JOIN "Chat" c ON m."chatId" = c.id 
         WHERE c."twinId" = t.id) as "messageCount",
        (SELECT COUNT(*) FROM "Event" e 
         WHERE e."publicTwinId" = t."publicHandle" 
         OR (e.meta->>'twinId')::text = t.id::text) as "eventCount"
      FROM "Twin" t
      JOIN "User" u ON t."userId" = u.id
      ${whereClause}
      ORDER BY ${sortBy === 'likeCount' ? 't."likeCount"' :
                sortBy === 'followCount' ? 't."followCount"' :
                sortBy === 'chatCount' ? 't."chatCount"' :
                `t."${sortBy}"`} ${sortOrder}
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
    
    
    // ✅ Sanitize twins before returning
    res.json({
      success: true,
      data: {
        twins: twinsResult.rows.map(twin => {
          const sanitized = sanitizeTwin(twin);
          sanitized.publicId = tokenizeId(twin.id, 'twin');
          return sanitized;
        }), // ✅ Add sanitization
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
    logger.error('Get detailed twins page error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
};

// Get detailed chats page data with pagination
export const getDetailedChatsPage = async (req: Request, res: Response) => {
  try {
    
    const { page = 1, limit = QUERY_LIMITS.RECENT_ITEMS, search = '', sortBy = 'createdAt', sortOrder = 'DESC', startDate = '', endDate = '' } = req.query;
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
    
    let whereClause = '';
    let queryParams: any[] = [];
    
    if (search) {
      whereClause = 'WHERE (u.email ILIKE $1 OR u.handle ILIKE $1 OR t."publicHandle" ILIKE $1)';
      queryParams.push(`%${search}%`);
    }
    
    // Add date range filter
    if (startDate || endDate) {
      const dateConditions: string[] = [];
      if (startDate) {
        dateConditions.push(`c."createdAt" >= $${queryParams.length + 1}::timestamp`);
        queryParams.push(startDate);
      }
      if (endDate) {
        dateConditions.push(`c."createdAt" <= $${queryParams.length + 1}::timestamp`);
        queryParams.push(endDate);
      }
      whereClause = whereClause 
        ? `${whereClause} AND ${dateConditions.join(' AND ')}`
        : `WHERE ${dateConditions.join(' AND ')}`;
    }
    
    // Enhanced query with twin info and message counts
    const chatsResult = await db.query(`
      SELECT 
        c.id, 
        c."createdAt",
        c."userId",
        c."twinId",
        u.handle as "userHandle", 
        u.email as "userEmail",
        t."publicHandle" as "twinHandle",
        t."isPublic",
        (SELECT COUNT(*) FROM "Message" m WHERE m."chatId" = c.id) as "messageCount",
        (SELECT MAX(m."createdAt") FROM "Message" m WHERE m."chatId" = c.id) as "lastMessageAt"
      FROM "Chat" c
      JOIN "User" u ON c."userId" = u.id
      LEFT JOIN "Twin" t ON c."twinId" = t.id
      ${whereClause}
      ORDER BY ${sortBy === 'messageCount' ? '(SELECT COUNT(*) FROM "Message" m WHERE m."chatId" = c.id)' :
                sortBy === 'lastMessageAt' ? '(SELECT MAX(m."createdAt") FROM "Message" m WHERE m."chatId" = c.id)' :
                `c."${sortBy}"`} ${sortOrder}
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `, [...queryParams, parseInt(limit as string), offset]);
    
    // Get total count (with same filters)
    const totalResult = await db.query(`
      SELECT COUNT(*) as total 
      FROM "Chat" c 
      JOIN "User" u ON c."userId" = u.id 
      LEFT JOIN "Twin" t ON c."twinId" = t.id
      ${whereClause}
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

    
    // ✅ Sanitize chats before returning with publicId
    res.json({
      success: true,
      data: {
        chats: chatsResult.rows.map(chat => {
          const sanitized = sanitizeChat(chat);
          sanitized.publicId = tokenizeId(chat.id, 'chat');
          return sanitized;
        }),
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
    logger.error('Get detailed chats page error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
};

// Get detailed messages page data with pagination
export const getDetailedMessagesPage = async (req: Request, res: Response) => {
  try {
    
    const { page = 1, limit = QUERY_LIMITS.RECENT_ITEMS, search = '', sortBy = 'createdAt', sortOrder = 'DESC', approved = '', sender = '', startDate = '', endDate = '' } = req.query;
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
    
    let whereClause = '';
    let queryParams: any[] = [];
    
    if (search) {
      whereClause = 'WHERE (u.email ILIKE $1 OR u.handle ILIKE $1 OR m.content ILIKE $1 OR t."publicHandle" ILIKE $1)';
      queryParams.push(`%${search}%`);
    }
    
    // Add approved filter
    if (approved === 'true' || approved === 'false') {
      const approvedCondition = `m.approved = $${queryParams.length + 1}::boolean`;
      queryParams.push(approved === 'true');
      whereClause = whereClause 
        ? `${whereClause} AND ${approvedCondition}`
        : `WHERE ${approvedCondition}`;
    }
    
    // Add sender filter
    if (sender === 'human' || sender === 'twin') {
      const senderCondition = `m.sender = $${queryParams.length + 1}`;
      queryParams.push(sender);
      whereClause = whereClause 
        ? `${whereClause} AND ${senderCondition}`
        : `WHERE ${senderCondition}`;
    }
    
    // Add date range filter
    if (startDate || endDate) {
      const dateConditions: string[] = [];
      if (startDate) {
        dateConditions.push(`m."createdAt" >= $${queryParams.length + 1}::timestamp`);
        queryParams.push(startDate);
      }
      if (endDate) {
        dateConditions.push(`m."createdAt" <= $${queryParams.length + 1}::timestamp`);
        queryParams.push(endDate);
      }
      whereClause = whereClause 
        ? `${whereClause} AND ${dateConditions.join(' AND ')}`
        : `WHERE ${dateConditions.join(' AND ')}`;
    }
    
    // Enhanced query with sender, approved, and twin info
    const messagesResult = await db.query(`
      SELECT 
        m.id, 
        m.content, 
        m."createdAt",
        m.sender,
        m.approved,
        u.handle as "userHandle", 
        u.email as "userEmail",
        u.id as "userId",
        c.id as "chatId",
        c."userId" as "chatUserId",
        t."publicHandle" as "twinHandle",
        t."isPublic"
      FROM "Message" m
      JOIN "Chat" c ON m."chatId" = c.id
      JOIN "User" u ON c."userId" = u.id
      LEFT JOIN "Twin" t ON c."twinId" = t.id
      ${whereClause}
      ORDER BY ${sortBy === 'approved' ? 'm.approved' :
                sortBy === 'sender' ? 'm.sender' :
                `m."${sortBy}"`} ${sortOrder}
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `, [...queryParams, parseInt(limit as string), offset]);    
    
    // Get total count (with same filters)
    const totalResult = await db.query(`
      SELECT COUNT(*) as total 
      FROM "Message" m 
      JOIN "Chat" c ON m."chatId" = c.id 
      JOIN "User" u ON c."userId" = u.id 
      LEFT JOIN "Twin" t ON c."twinId" = t.id
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
    
    
    // ✅ Sanitize messages before returning
    res.json({
      success: true,
      data: {
        messages: messagesResult.rows.map(msg => sanitizeMessage(msg)), // ✅ Add sanitization
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
    logger.error('Get detailed messages page error:', error);
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

// Function to get event analytics:
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
        topUsers: topUsersResult.rows.map(user => sanitizeUser(user, true)),
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
        events: eventsResult.rows.map(event => sanitizeEvent(event)),
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

// Get activity feed - merged timeline of key events
export const getActivityFeed = async (req: Request, res: Response) => {
  try {
    
    const { 
      page = 1, 
      limit = 50, 
      startDate = '', 
      endDate = '', 
      eventTypes = '',
      userId = ''
    } = req.query;
    
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
    const eventTypesArray = eventTypes 
      ? (eventTypes as string).split(',').filter(t => t.trim())
      : ['signup', 'twin_created', 'chat_started', 'message_approved', 'invite_sent', 'invite_accepted', 'profile_shared'];
    
    let whereClause = '';
    let queryParams: any[] = [];
    
    // Event types filter
    if (eventTypesArray.length > 0) {
      const placeholders = eventTypesArray.map((_, i) => `$${i + 1}`).join(', ');
      whereClause = `WHERE e.type IN (${placeholders})`;
      queryParams.push(...eventTypesArray);
    }
    
    // User filter
    if (userId) {
      const userIdCondition = `e."userId" = $${queryParams.length + 1}`;
      queryParams.push(userId);
      whereClause = whereClause 
        ? `${whereClause} AND ${userIdCondition}`
        : `WHERE ${userIdCondition}`;
    }
    
    // Date range filter
    if (startDate || endDate) {
      const dateConditions: string[] = [];
      if (startDate) {
        dateConditions.push(`e."createdAt" >= $${queryParams.length + 1}::timestamp`);
        queryParams.push(startDate);
      }
      if (endDate) {
        dateConditions.push(`e."createdAt" <= $${queryParams.length + 1}::timestamp`);
        queryParams.push(endDate);
      }
      whereClause = whereClause 
        ? `${whereClause} AND ${dateConditions.join(' AND ')}`
        : `WHERE ${dateConditions.join(' AND ')}`;
    }
    
    // Get activity feed - merged events with user info
    const activityResult = await db.query(`
      SELECT 
        e.id,
        e.type,
        e."userId",
        e.meta,
        e."createdAt",
        u.handle as "userHandle",
        u.email as "userEmail",
        u."profileImage" as "userProfileImage",
        t."publicHandle" as "twinHandle",
        t."isPublic" as "twinIsPublic"
      FROM "Event" e
      LEFT JOIN "User" u ON e."userId" = u.id
      LEFT JOIN "Twin" t ON (e.meta->>'twinId')::text = t.id::text 
        OR e."publicTwinId" = t."publicHandle"
      ${whereClause}
      ORDER BY e."createdAt" DESC
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `, [...queryParams, parseInt(limit as string), offset]);
    
    // Get total count
    const totalResult = await db.query(`
      SELECT COUNT(*) as total 
      FROM "Event" e
      ${whereClause}
    `, queryParams);
    
    // Get summary stats
    const summaryResult = await db.query(`
      SELECT 
        COUNT(*) FILTER (WHERE e.type = 'signup') as signups,
        COUNT(*) FILTER (WHERE e.type = 'twin_created') as twinsCreated,
        COUNT(*) FILTER (WHERE e.type = 'chat_started') as chatsStarted,
        COUNT(*) FILTER (WHERE e.type = 'message_approved') as messagesApproved,
        COUNT(*) FILTER (WHERE e.type IN ('invite_sent', 'invite_accepted')) as invites,
        COUNT(*) FILTER (WHERE e.type IN ('twin_shared', 'profile_shared')) as shares
      FROM "Event" e
      ${whereClause}
    `, queryParams);
    
    
    res.json({
      success: true,
      data: {
        activities: activityResult.rows.map(activity => {
          const sanitized = sanitizeEvent(activity);
          // Add formatted description
          sanitized.description = formatActivityDescription(activity);
          return sanitized;
        }),
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
    logger.error('Get activity feed error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
};

// Helper function to format activity descriptions
function formatActivityDescription(activity: any): string {
  const { type, userHandle, userEmail, twinHandle, meta } = activity;
  const userName = userHandle || userEmail || 'Unknown User';
  
  switch (type) {
    case 'signup':
      return `${userName} signed up`;
    case 'twin_created':
      return `${userName} created twin @${twinHandle || 'unknown'}`;
    case 'chat_started':
      return `${userName} started chat with @${twinHandle || 'unknown'}`;
    case 'message_approved':
      return `${userName} approved message in chat`;
    case 'invite_sent':
      return `${userName} sent invite`;
    case 'invite_accepted':
      return `${userName} accepted invite`;
    case 'profile_shared':
    case 'twin_shared':
      return `${userName} shared ${twinHandle ? `@${twinHandle}` : 'profile'}`;
    default:
      return `${userName} performed ${type}`;
  }
}