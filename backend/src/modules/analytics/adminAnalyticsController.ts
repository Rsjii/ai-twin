import { Request, Response } from 'express';
import { adminAnalyticsDb } from '../../config/db'; // ✅ Use admin analytics DB (production DB when running locally)
import { logger } from '../../config/logger';
import { ADMIN_EMAILS, QUERY_LIMITS } from '../../config/constants';
import { sanitizeUser, sanitizeTwin, sanitizeChat, sanitizeMessage, sanitizeEvent, sanitizeInvite, tokenizeId, detokenizeId } from '../../utils/idTokenization';

// ✅ Helper function to clamp pagination limits (reusable across all functions)
function clampPagination(page: any, limit: any, defaultLimit: number = QUERY_LIMITS.RECENT_ITEMS) {
  const rawPage = Number(page) || 1;
  const rawLimit = Number(limit) || defaultLimit;
  
  const safePage = Math.max(rawPage, 1);
  const safeLimit = Math.min(
    Math.max(rawLimit, 1),
    QUERY_LIMITS.MAX_PAGE_SIZE,
  );
  
  const offset = (safePage - 1) * safeLimit;
  
  return { safePage, safeLimit, offset };
}

// ✅ Helper functions to detokenize IDs (for filters that accept tokenized IDs)
function maybeDetokenizeUserId(input: string): string {
  const d = detokenizeId(input);
  if (d && d.type === 'user') return d.id;
  return input;
}

function maybeDetokenizeChatId(input: string): string {
  const d = detokenizeId(input);
  if (d && d.type === 'chat') return d.id;
  return input;
}

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
      recentEventsResult,
      
      // NEW: Activation metrics queries
      signupsResult,
      signupsWithTwin24hResult,
      signupsWithChat24hResult,
      signupsWithApproval72hResult,
      
      // NEW: Retention metrics queries
      retentionD1Result,
      retentionD7Result,
      retentionD30Result,
      cohortDataResult,
      
      // NEW: Virality metrics queries
      totalInvitesSentResult,
      totalInvitesAcceptedResult,
      invitesPerActiveUserResult,
      sharesPerActiveUserResult,
      inviteConversionRateResult,
      dauResult,
      wauResult,
      mauResult,
      tokenLifetimeResult,
      tokenTodayResult,
      tokenDailyLifetimeResult,
      tokenDailyTodayResult,
      tokenDailyWeekResult,
      tokenDailyMonthResult,
      topTokenUsersResult
    ] = await Promise.all([
      // Lifetime metrics
      adminAnalyticsDb.query('SELECT COUNT(*) as count FROM "User"'),
      adminAnalyticsDb.query('SELECT COUNT(*) as count FROM "Twin"'),
      adminAnalyticsDb.query('SELECT COUNT(*) as count FROM "Chat"'),
      adminAnalyticsDb.query('SELECT COUNT(*) as count FROM "Message"'),
      adminAnalyticsDb.query('SELECT COUNT(*) as count FROM "Event"'),
      adminAnalyticsDb.query('SELECT COUNT(*) as count FROM "Invite"'),
      
      // Daily metrics (today) - optimized to use index-friendly range queries
      adminAnalyticsDb.query('SELECT COUNT(*) as count FROM "User" WHERE "createdAt" >= CURRENT_DATE AND "createdAt" < CURRENT_DATE + INTERVAL \'1 day\''),
      adminAnalyticsDb.query('SELECT COUNT(*) as count FROM "Twin" WHERE "createdAt" >= CURRENT_DATE AND "createdAt" < CURRENT_DATE + INTERVAL \'1 day\''),
      adminAnalyticsDb.query('SELECT COUNT(*) as count FROM "Chat" WHERE "createdAt" >= CURRENT_DATE AND "createdAt" < CURRENT_DATE + INTERVAL \'1 day\''),
      adminAnalyticsDb.query('SELECT COUNT(*) as count FROM "Message" WHERE "createdAt" >= CURRENT_DATE AND "createdAt" < CURRENT_DATE + INTERVAL \'1 day\''),
      adminAnalyticsDb.query('SELECT COUNT(*) as count FROM "Event" WHERE "createdAt" >= CURRENT_DATE AND "createdAt" < CURRENT_DATE + INTERVAL \'1 day\''),
      
      // Weekly metrics (last 7 days)
      adminAnalyticsDb.query('SELECT COUNT(*) as count FROM "User" WHERE "createdAt" >= NOW() - INTERVAL \'7 days\''),
      adminAnalyticsDb.query('SELECT COUNT(*) as count FROM "Twin" WHERE "createdAt" >= NOW() - INTERVAL \'7 days\''),
      adminAnalyticsDb.query('SELECT COUNT(*) as count FROM "Chat" WHERE "createdAt" >= NOW() - INTERVAL \'7 days\''),
      adminAnalyticsDb.query('SELECT COUNT(*) as count FROM "Message" WHERE "createdAt" >= NOW() - INTERVAL \'7 days\''),
      adminAnalyticsDb.query('SELECT COUNT(*) as count FROM "Event" WHERE "createdAt" >= NOW() - INTERVAL \'7 days\''),
      
      // Monthly metrics (last 30 days)
      adminAnalyticsDb.query('SELECT COUNT(*) as count FROM "User" WHERE "createdAt" >= NOW() - INTERVAL \'30 days\''),
      adminAnalyticsDb.query('SELECT COUNT(*) as count FROM "Twin" WHERE "createdAt" >= NOW() - INTERVAL \'30 days\''),
      adminAnalyticsDb.query('SELECT COUNT(*) as count FROM "Chat" WHERE "createdAt" >= NOW() - INTERVAL \'30 days\''),
      adminAnalyticsDb.query('SELECT COUNT(*) as count FROM "Message" WHERE "createdAt" >= NOW() - INTERVAL \'30 days\''),
      adminAnalyticsDb.query('SELECT COUNT(*) as count FROM "Event" WHERE "createdAt" >= NOW() - INTERVAL \'30 days\''),
      
      // User activity metrics
      adminAnalyticsDb.query('SELECT COUNT(DISTINCT "userId") as count FROM "Event" WHERE "createdAt" >= NOW() - INTERVAL \'1 day\''),
      adminAnalyticsDb.query('SELECT COUNT(*) as count FROM "User" WHERE "createdAt" >= CURRENT_DATE AND "createdAt" < CURRENT_DATE + INTERVAL \'1 day\''),
      adminAnalyticsDb.query('SELECT COUNT(*) as count FROM "User" WHERE "createdAt" >= NOW() - INTERVAL \'7 days\''),
      adminAnalyticsDb.query('SELECT COUNT(*) as count FROM "User" WHERE "createdAt" >= NOW() - INTERVAL \'30 days\''),
      
      // Engagement metrics
      adminAnalyticsDb.query('SELECT AVG(message_count) as avg FROM (SELECT COUNT(*) as message_count FROM "Message" GROUP BY "chatId") as subquery'),
      adminAnalyticsDb.query('SELECT AVG(chat_count) as avg FROM (SELECT COUNT(*) as chat_count FROM "Chat" GROUP BY "userId") as subquery'),
      adminAnalyticsDb.query('SELECT AVG(event_count) as avg FROM (SELECT COUNT(*) as event_count FROM "Event" GROUP BY "userId") as subquery'),
      
      // Top performing content
      adminAnalyticsDb.query(`SELECT t.id, t."userId", t."styleVector", t."sampleReply", t."instructions", t."isPublic", t."publicHandle", t."bio", t."profileImage", t."verified", t."likeCount", t."followCount", t."chatCount", t."createdAt", u.handle as userHandle, u.name as userName FROM "Twin" t JOIN "User" u ON t."userId" = u.id ORDER BY t."likeCount" DESC, t."chatCount" DESC LIMIT ${QUERY_LIMITS.RECENT_ITEMS}`),
      adminAnalyticsDb.query(`SELECT u.id, u.email, u.handle, u.name, u.dob, u.phone, u.bio, u.active, u."referralCode", u."createdAt", u."profileImage", COUNT(e.id) as eventCount FROM "User" u LEFT JOIN "Event" e ON u.id = e."userId" GROUP BY u.id ORDER BY eventCount DESC LIMIT ${QUERY_LIMITS.RECENT_ITEMS}`),
      
      // Event breakdown
      adminAnalyticsDb.query('SELECT type, COUNT(*) as count FROM "Event" GROUP BY type ORDER BY count DESC'),
      
      // Recent activity
      adminAnalyticsDb.query(`SELECT id, email, handle, name, "createdAt", active FROM "User" ORDER BY "createdAt" DESC LIMIT ${QUERY_LIMITS.RECENT_ITEMS}`),      
      adminAnalyticsDb.query(`SELECT t.id, t."userId", t."styleVector", t."sampleReply", t."instructions", t."isPublic", t."publicHandle", t."bio", t."profileImage", t."verified", t."likeCount", t."followCount", t."chatCount", t."createdAt", u.handle as userHandle FROM "Twin" t JOIN "User" u ON t."userId" = u.id ORDER BY t."createdAt" DESC LIMIT ${QUERY_LIMITS.RECENT_ITEMS}`),
      adminAnalyticsDb.query(`SELECT c.id, c."userId", c."twinId", c."createdAt", u.handle as userHandle FROM "Chat" c JOIN "User" u ON c."userId" = u.id ORDER BY c."createdAt" DESC LIMIT ${QUERY_LIMITS.RECENT_ITEMS}`),
      adminAnalyticsDb.query(`SELECT e.id, e."userId", e.type, e.meta, e."createdAt", u.handle as userHandle FROM "Event" e LEFT JOIN "User" u ON e."userId" = u.id ORDER BY e."createdAt" DESC LIMIT ${QUERY_LIMITS.RECENT_ACTIVITY}`),
      
      // NEW: Activation metrics
      // Total signups
      adminAnalyticsDb.query('SELECT COUNT(*) as count FROM "Event" WHERE type = $1', ['signup']),
      
      // Signups who created twin within 24h
      adminAnalyticsDb.query(`
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
      
      // Signups who started chat within 24h
      adminAnalyticsDb.query(`
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
      
      // Signups who approved message within 72h
      adminAnalyticsDb.query(`
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
      
      // NEW: Retention metrics
      // D1 Retention: Users who signed up and came back within 1 day
      adminAnalyticsDb.query(`
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
      
      // D7 Retention: Users who signed up and came back within 7 days
      adminAnalyticsDb.query(`
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
      
      // D30 Retention: Users who signed up and came back within 30 days
      adminAnalyticsDb.query(`
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
      
      // Cohort data: Monthly cohorts with retention
      adminAnalyticsDb.query(`
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
      
      // NEW: Virality metrics
      // Total invites sent
      adminAnalyticsDb.query('SELECT COUNT(*) as count FROM "Event" WHERE type = $1', ['invite_sent']),
      
      // Total invites accepted
      adminAnalyticsDb.query('SELECT COUNT(*) as count FROM "Event" WHERE type = $1', ['invite_accepted']),
      
      // Invites per active user (last 30 days)
      adminAnalyticsDb.query(`
        SELECT 
          COUNT(DISTINCT i."userId") as active_users,
          COUNT(*) FILTER (WHERE i.type = 'invite_sent') as invites_sent
        FROM "Event" i
        WHERE i."createdAt" >= NOW() - INTERVAL '30 days'
        AND i.type IN ('invite_sent', 'invite_accepted')
      `),
      
      // Shares per active user (last 30 days)
      adminAnalyticsDb.query(`
        SELECT 
          COUNT(DISTINCT s."userId") as active_users,
          COUNT(*) FILTER (WHERE s.type IN ('twin_shared', 'share_clicked', 'profile_shared')) as shares
        FROM "Event" s
        WHERE s."createdAt" >= NOW() - INTERVAL '30 days'
        AND s.type IN ('twin_shared', 'share_clicked', 'profile_shared')
      `),
      
      // Invite conversion rate (invites accepted / invites sent)
      adminAnalyticsDb.query(`
        SELECT 
          COUNT(*) FILTER (WHERE type = 'invite_sent') as sent,
          COUNT(*) FILTER (WHERE type = 'invite_accepted') as accepted
        FROM "Event"
        WHERE type IN ('invite_sent', 'invite_accepted')
      `),
      // ✅ FIX: DAU/WAU/MAU - Count distinct users with activity (not just signups)
      // DAU: Unique users active in last 24 hours
      adminAnalyticsDb.query(`
        SELECT COUNT(DISTINCT "userId") as count 
        FROM "Event" 
        WHERE "createdAt" >= NOW() - INTERVAL '24 hours'
        AND "userId" IS NOT NULL
      `),
      // WAU: Unique users active in last 7 days
      adminAnalyticsDb.query(`
        SELECT COUNT(DISTINCT "userId") as count 
        FROM "Event" 
        WHERE "createdAt" >= NOW() - INTERVAL '7 days'
        AND "userId" IS NOT NULL
      `),
      // MAU: Unique users active in last 30 days
      adminAnalyticsDb.query(`
        SELECT COUNT(DISTINCT "userId") as count 
        FROM "Event" 
        WHERE "createdAt" >= NOW() - INTERVAL '30 days'
        AND "userId" IS NOT NULL
      `),
      
      // NEW: Token usage metrics (from ai_runs)
      adminAnalyticsDb.query('SELECT SUM(tokens_in + tokens_out) as total FROM ai_runs'),
      adminAnalyticsDb.query('SELECT SUM(tokens_in + tokens_out) as total FROM ai_runs WHERE ts >= CURRENT_DATE'),
      
      // NEW: Token usage from TokenUsageDaily (user-wise tracking)
      adminAnalyticsDb.query('SELECT SUM("tokensUsed") as total FROM "TokenUsageDaily" WHERE "actorType" = \'user\''),
      adminAnalyticsDb.query('SELECT SUM("tokensUsed") as total FROM "TokenUsageDaily" WHERE "actorType" = \'user\' AND day = CURRENT_DATE'),
      adminAnalyticsDb.query('SELECT SUM("tokensUsed") as total FROM "TokenUsageDaily" WHERE "actorType" = \'user\' AND day >= CURRENT_DATE - INTERVAL \'7 days\''),
      adminAnalyticsDb.query('SELECT SUM("tokensUsed") as total FROM "TokenUsageDaily" WHERE "actorType" = \'user\' AND day >= CURRENT_DATE - INTERVAL \'30 days\''),
      
      // Top token users (today)
      adminAnalyticsDb.query(`
        SELECT "userId", SUM("tokensUsed") as total 
        FROM "TokenUsageDaily" 
        WHERE "actorType" = 'user' AND day = CURRENT_DATE AND "userId" IS NOT NULL
        GROUP BY "userId" 
        ORDER BY total DESC 
        LIMIT 10
      `)
    ]);

    // Process results
    const lifetime = {
      users: parseInt(totalUsersResult.rows[0].count),
      twins: parseInt(totalTwinsResult.rows[0].count),
      chats: parseInt(totalChatsResult.rows[0].count),
      messages: parseInt(totalMessagesResult.rows[0].count),
      events: parseInt(totalEventsResult.rows[0].count),
      invites: parseInt(totalInvitesResult.rows[0].count),
      tokens: parseInt(tokenLifetimeResult?.rows[0]?.total || 0),
      tokensDaily: parseInt(tokenDailyLifetimeResult?.rows[0]?.total || 0) // From TokenUsageDaily
    };

    const daily = {
      users: parseInt(dailyUsersResult.rows[0].count),
      twins: parseInt(dailyTwinsResult.rows[0].count),
      chats: parseInt(dailyChatsResult.rows[0].count),
      messages: parseInt(dailyMessagesResult.rows[0].count),
      events: parseInt(dailyEventsResult.rows[0].count),
      tokens: parseInt(tokenTodayResult?.rows[0]?.total || 0),
      tokensDaily: parseInt(tokenDailyTodayResult?.rows[0]?.total || 0) // From TokenUsageDaily
    };

    const weekly = {
      users: parseInt(weeklyUsersResult.rows[0].count),
      twins: parseInt(weeklyTwinsResult.rows[0].count),
      chats: parseInt(weeklyChatsResult.rows[0].count),
      messages: parseInt(weeklyMessagesResult.rows[0].count),
      events: parseInt(weeklyEventsResult.rows[0].count),
      tokensDaily: parseInt(tokenDailyWeekResult?.rows[0]?.total || 0) // From TokenUsageDaily
    };

    const monthly = {
      users: parseInt(monthlyUsersResult.rows[0].count),
      twins: parseInt(monthlyTwinsResult.rows[0].count),
      chats: parseInt(monthlyChatsResult.rows[0].count),
      messages: parseInt(monthlyMessagesResult.rows[0].count),
      events: parseInt(monthlyEventsResult.rows[0].count),
      tokensDaily: parseInt(tokenDailyMonthResult?.rows[0]?.total || 0) // From TokenUsageDaily
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
      mostActiveUsers: mostActiveUsersResult.rows.map(user => sanitizeUser(user, true)), // includeEmail=true for admin
      topTokenUsers: topTokenUsersResult.rows.map(row => ({
        userId: row.userId ? tokenizeId(row.userId, 'user') : null,
        tokensUsed: parseInt(row.total || 0)
      }))
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
   userActivityResult,
   userTokenUsageLifetimeResult,
   userTokenUsageTodayResult,
   userTokenUsageWeekResult,
   userTokenUsageMonthResult,
   userTokenUsageDailyResult
 ] = await Promise.all([
  adminAnalyticsDb.query('SELECT id, email, handle, name, dob, phone, bio, active, "referralCode", "createdAt", "profileImage" FROM "User" WHERE id = $1', [actualUserId]),
  adminAnalyticsDb.query('SELECT id, "userId", "styleVector", "sampleReply", "instructions", "isPublic", "publicHandle", "bio", "profileImage", "verified", "likeCount", "followCount", "chatCount", "createdAt" FROM "Twin" WHERE "userId" = $1', [actualUserId]),
  adminAnalyticsDb.query('SELECT id, "userId", "twinId", "createdAt" FROM "Chat" WHERE "userId" = $1', [actualUserId]),
  adminAnalyticsDb.query('SELECT COUNT(*) as count FROM "Message" m JOIN "Chat" c ON m."chatId" = c.id WHERE c."userId" = $1', [actualUserId]),
  adminAnalyticsDb.query('SELECT id, "userId", type, meta, "createdAt" FROM "Event" WHERE "userId" = $1 ORDER BY "createdAt" DESC', [actualUserId]),
  adminAnalyticsDb.query('SELECT id, code, "inviterId", "acceptedBy", "createdAt" FROM "Invite" WHERE "inviterId" = $1 OR "acceptedBy" = $1', [actualUserId]),
  adminAnalyticsDb.query('SELECT type, COUNT(*) as count, DATE("createdAt") as date FROM "Event" WHERE "userId" = $1 GROUP BY type, DATE("createdAt") ORDER BY date DESC', [actualUserId]),
  // Token usage queries
  adminAnalyticsDb.query('SELECT SUM("tokensUsed") as total FROM "TokenUsageDaily" WHERE "userId" = $1', [actualUserId]),
  adminAnalyticsDb.query('SELECT SUM("tokensUsed") as total FROM "TokenUsageDaily" WHERE "userId" = $1 AND day = CURRENT_DATE', [actualUserId]),
  adminAnalyticsDb.query('SELECT SUM("tokensUsed") as total FROM "TokenUsageDaily" WHERE "userId" = $1 AND day >= CURRENT_DATE - INTERVAL \'7 days\'', [actualUserId]),
  adminAnalyticsDb.query('SELECT SUM("tokensUsed") as total FROM "TokenUsageDaily" WHERE "userId" = $1 AND day >= CURRENT_DATE - INTERVAL \'30 days\'', [actualUserId]),
  adminAnalyticsDb.query('SELECT day, "tokensUsed" FROM "TokenUsageDaily" WHERE "userId" = $1 ORDER BY day DESC LIMIT 30', [actualUserId])
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
        invites: userInvitesResult.rows.length,
        tokens: {
          lifetime: parseInt(userTokenUsageLifetimeResult?.rows[0]?.total || 0),
          today: parseInt(userTokenUsageTodayResult?.rows[0]?.total || 0),
          week: parseInt(userTokenUsageWeekResult?.rows[0]?.total || 0),
          month: parseInt(userTokenUsageMonthResult?.rows[0]?.total || 0),
          daily: userTokenUsageDailyResult.rows.map(row => ({
            day: row.day,
            tokensUsed: parseInt(row.tokensUsed || 0)
          }))
        }
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
      adminAnalyticsDb.query('SELECT id, email, handle, name, dob, phone, bio, active, "referralCode", "createdAt", "profileImage" FROM "User" WHERE id = $1', [actualUserId]),
      adminAnalyticsDb.query('SELECT id, "userId", "styleVector", "sampleReply", "instructions", "isPublic", "publicHandle", "bio", "profileImage", "verified", "likeCount", "followCount", "chatCount", "createdAt" FROM "Twin" WHERE "userId" = $1 ORDER BY "createdAt" DESC', [actualUserId]),
      adminAnalyticsDb.query('SELECT c.id, c."userId", c."twinId", c."createdAt", t.id as twinId FROM "Chat" c LEFT JOIN "Twin" t ON c."twinId" = t.id WHERE c."userId" = $1 ORDER BY c."createdAt" DESC', [actualUserId]),
      adminAnalyticsDb.query('SELECT COUNT(*) as count FROM "Message" m JOIN "Chat" c ON m."chatId" = c.id WHERE c."userId" = $1', [actualUserId]),
      adminAnalyticsDb.query(`SELECT id, "userId", type, meta, "createdAt" FROM "Event" WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT ${QUERY_LIMITS.ANALYTICS_DETAILS}`, [actualUserId]),
      adminAnalyticsDb.query('SELECT id, code, "inviterId", "acceptedBy", "createdAt" FROM "Invite" WHERE "inviterId" = $1 OR "acceptedBy" = $1 ORDER BY "createdAt" DESC', [actualUserId]),
      adminAnalyticsDb.query(`SELECT type, COUNT(*) as count, DATE("createdAt") as date FROM "Event" WHERE "userId" = $1 GROUP BY type, DATE("createdAt") ORDER BY date DESC LIMIT ${QUERY_LIMITS.ANALYTICS_TIMELINE}`, [actualUserId]),
      adminAnalyticsDb.query('SELECT AVG(chat_count) as avg_chats, AVG(message_count) as avg_messages FROM (SELECT COUNT(c.id) as chat_count, COUNT(m.id) as message_count FROM "Chat" c LEFT JOIN "Message" m ON c.id = m."chatId" WHERE c."userId" = $1 GROUP BY c.id) as subquery', [actualUserId]),
      adminAnalyticsDb.query(`SELECT DATE("createdAt") as date, COUNT(*) as events FROM "Event" WHERE "userId" = $1 GROUP BY DATE("createdAt") ORDER BY date DESC LIMIT ${QUERY_LIMITS.ANALYTICS_TIMELINE}`, [actualUserId])
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
    const userResult = await adminAnalyticsDb.query('SELECT id, email, "passwordHash", handle, name, dob, phone, bio, active, "referralCode", "createdAt", "profileImage" FROM "User" WHERE id = $1', [actualUserId]);
    if (!userResult.rows[0]) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Delete user and all related data (cascade)
    await adminAnalyticsDb.query('DELETE FROM "User" WHERE id = $1', [actualUserId]);

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
    
    let userTimeFilter = '';
    let twinTimeFilter = '';
    let chatTimeFilter = '';
    let messageTimeFilter = '';
    let eventTimeFilter = '';
    let interval = '';
    
    switch (period) {
      case 'today':
        // Use alias-specific filters for each table
        userTimeFilter = 'u."createdAt" >= CURRENT_DATE AND u."createdAt" < CURRENT_DATE + INTERVAL \'1 day\'';
        twinTimeFilter = 't."createdAt" >= CURRENT_DATE AND t."createdAt" < CURRENT_DATE + INTERVAL \'1 day\'';
        chatTimeFilter = 'c."createdAt" >= CURRENT_DATE AND c."createdAt" < CURRENT_DATE + INTERVAL \'1 day\' AND c."messageCount" > 0';
        messageTimeFilter = 'm."createdAt" >= CURRENT_DATE AND m."createdAt" < CURRENT_DATE + INTERVAL \'1 day\'';
        eventTimeFilter = 'e."createdAt" >= CURRENT_DATE AND e."createdAt" < CURRENT_DATE + INTERVAL \'1 day\'';
        interval = '1 hour';
        break;
      case 'week':
        userTimeFilter = 'u."createdAt" >= NOW() - INTERVAL \'7 days\'';
        twinTimeFilter = 't."createdAt" >= NOW() - INTERVAL \'7 days\'';
        chatTimeFilter = 'c."createdAt" >= NOW() - INTERVAL \'7 days\' AND c."messageCount" > 0';
        messageTimeFilter = 'm."createdAt" >= NOW() - INTERVAL \'7 days\'';
        eventTimeFilter = 'e."createdAt" >= NOW() - INTERVAL \'7 days\'';
        interval = '1 day';
        break;
      case 'month':
        userTimeFilter = 'u."createdAt" >= NOW() - INTERVAL \'30 days\'';
        twinTimeFilter = 't."createdAt" >= NOW() - INTERVAL \'30 days\'';
        chatTimeFilter = 'c."createdAt" >= NOW() - INTERVAL \'30 days\' AND c."messageCount" > 0';
        messageTimeFilter = 'm."createdAt" >= NOW() - INTERVAL \'30 days\'';
        eventTimeFilter = 'e."createdAt" >= NOW() - INTERVAL \'30 days\'';
        interval = '1 day';
        break;
      default:
        return res.status(400).json({ error: 'Invalid period. Use: today, week, month' });
    }

    // Calculate date range for entitiesDaily query
    let startDate: string;
    let endDate: string = new Date().toISOString().split('T')[0];
    
    switch (period) {
      case 'today':
        startDate = new Date().toISOString().split('T')[0];
        break;
      case 'week':
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        startDate = weekAgo.toISOString().split('T')[0];
        break;
      case 'month':
        const monthAgo = new Date();
        monthAgo.setDate(monthAgo.getDate() - 30);
        startDate = monthAgo.toISOString().split('T')[0];
        break;
      default:
        startDate = endDate;
    }

    // Get detailed time-based analytics with alias-specific filters
    const [
      usersResult,
      twinsResult,
      chatsResult,
      messagesResult,
      eventsResult,
      hourlyBreakdownResult,
      dailyBreakdownResult,
      entitiesDailyResult,
      topUsersResult,
      topTwinsResult,
      eventBreakdownResult
    ] = await Promise.all([
      // Count queries with alias-specific filters
      adminAnalyticsDb.query(`SELECT COUNT(*) as count FROM "User" u WHERE ${userTimeFilter}`),
      adminAnalyticsDb.query(`SELECT COUNT(*) as count FROM "Twin" t WHERE ${twinTimeFilter}`),
      adminAnalyticsDb.query(`SELECT COUNT(*) as count FROM "Chat" c WHERE ${chatTimeFilter}`),
      adminAnalyticsDb.query(`SELECT COUNT(*) as count FROM "Message" m WHERE ${messageTimeFilter}`),
      adminAnalyticsDb.query(`SELECT COUNT(*) as count FROM "Event" e WHERE ${eventTimeFilter}`),
      
      // Hourly breakdown with alias
      adminAnalyticsDb.query(`SELECT EXTRACT(HOUR FROM e."createdAt") as hour, COUNT(*) as count FROM "Event" e WHERE ${eventTimeFilter} GROUP BY EXTRACT(HOUR FROM e."createdAt") ORDER BY hour`),
      
      // Daily breakdown with alias
      adminAnalyticsDb.query(`SELECT DATE(e."createdAt") as date, COUNT(*) as count FROM "Event" e WHERE ${eventTimeFilter} GROUP BY DATE(e."createdAt") ORDER BY date`),
      
      // Entities daily breakdown (users, twins, chats per day)
      adminAnalyticsDb.query(`
        SELECT 
          d::date as date,
          COUNT(DISTINCT u.id) FILTER (WHERE DATE(u."createdAt") = d::date) as users,
          COUNT(DISTINCT t.id) FILTER (WHERE DATE(t."createdAt") = d::date) as twins,
          COUNT(DISTINCT c.id) FILTER (WHERE DATE(c."createdAt") = d::date) as chats
        FROM generate_series(
          '${startDate}'::date,
          '${endDate}'::date,
          '1 day'::interval
        ) d
        LEFT JOIN "User" u ON DATE(u."createdAt") = d::date AND ${userTimeFilter}
        LEFT JOIN "Twin" t ON DATE(t."createdAt") = d::date AND ${twinTimeFilter}
        LEFT JOIN "Chat" c ON DATE(c."createdAt") = d::date AND ${chatTimeFilter}
        GROUP BY d::date
        ORDER BY d::date
      `),
      
      // Top users with alias-specific filter
      adminAnalyticsDb.query(`SELECT u.id, u.email, u.handle, u.name, u.dob, u.phone, u.bio, u.active, u."referralCode", u."createdAt", u."profileImage", COUNT(e.id) as eventCount 
                FROM "User" u 
                LEFT JOIN "Event" e ON u.id = e."userId" AND ${eventTimeFilter}
                WHERE ${userTimeFilter}
                GROUP BY u.id 
                ORDER BY eventCount DESC 
                LIMIT ${QUERY_LIMITS.RECENT_ITEMS}`),
      
      // Top twins with alias-specific filter
      adminAnalyticsDb.query(`SELECT t.id, t."userId", t."styleVector", t."sampleReply", t."instructions", t."isPublic", t."publicHandle", t."bio", t."profileImage", t."verified", t."likeCount", t."followCount", t."chatCount", t."createdAt", u.handle as userHandle 
                FROM "Twin" t 
                JOIN "User" u ON t."userId" = u.id 
                WHERE ${twinTimeFilter}
                ORDER BY t."likeCount" DESC, t."chatCount" DESC 
                LIMIT ${QUERY_LIMITS.RECENT_ITEMS}`),
      
      // Event breakdown with alias
      adminAnalyticsDb.query(`SELECT e.type, COUNT(*) as count FROM "Event" e WHERE ${eventTimeFilter} GROUP BY e.type ORDER BY count DESC`)
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
        daily: dailyBreakdownResult.rows,
        entitiesDaily: entitiesDailyResult.rows.map(row => ({
          date: row.date,
          users: parseInt(row.users) || 0,
          twins: parseInt(row.twins) || 0,
          chats: parseInt(row.chats) || 0
        }))
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
    const { search, page = 1, limit = QUERY_LIMITS.DEFAULT_PAGE_SIZE } = req.query;
    
    // Clamp limit: 1..MAX_PAGE_SIZE
    const { safePage, safeLimit, offset } = clampPagination(page, limit, QUERY_LIMITS.DEFAULT_PAGE_SIZE);
    
    let whereClause = '';
    let queryParams: any[] = [];
    
    if (search) {
      whereClause = 'WHERE u.email ILIKE $1 OR u.handle ILIKE $1';
      queryParams.push(`%${search}%`);
    }
    
    const usersResult = await adminAnalyticsDb.query(`
      SELECT u.id, u.email, u.handle, u.name, u.dob, u.phone, u.bio, u.active, u."referralCode", u."createdAt", u."profileImage", 
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
    `, [...queryParams, safeLimit, offset]);
    
    const totalUsersResult = await adminAnalyticsDb.query(`
      SELECT COUNT(*) as total FROM "User" u ${whereClause}
    `, queryParams);
    
    // ✅ Sanitize users before returning
    res.json({
      success: true,
      data: {
        users: usersResult.rows.map(user => sanitizeUser(user, true)), // includeEmail=true for admin
        pagination: {
          total: parseInt(totalUsersResult.rows[0].total),
          currentPage: safePage,
          totalPages: Math.ceil(parseInt(totalUsersResult.rows[0].total) / safeLimit),
          itemsPerPage: safeLimit
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
          adminAnalyticsDb.query('SELECT COUNT(*) as count FROM "User"'),
          adminAnalyticsDb.query('SELECT COUNT(*) as count FROM "User" WHERE "lastLoginAt" >= NOW() - INTERVAL \'24 hours\''),
          adminAnalyticsDb.query('SELECT COUNT(*) as count FROM "User" WHERE "createdAt" >= NOW() - INTERVAL \'7 days\''),
          adminAnalyticsDb.query(`SELECT u.id, u.email, u.handle, u.name, u.dob, u.phone, u.bio, u.active, u."referralCode", u."createdAt", u."profileImage", COUNT(DISTINCT t.id) as twinCount, COUNT(DISTINCT c.id) as chatCount FROM "User" u LEFT JOIN "Twin" t ON u.id = t."userId" LEFT JOIN "Chat" c ON u.id = c."userId" AND c."messageCount" > 0 GROUP BY u.id ORDER BY u."createdAt" DESC LIMIT ${QUERY_LIMITS.ANALYTICS_DETAILS}`)
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
          adminAnalyticsDb.query('SELECT COUNT(*) as count FROM "Twin"'),
          adminAnalyticsDb.query(`SELECT t.id, t."userId", t."styleVector", t."sampleReply", t."instructions", t."isPublic", t."publicHandle", t."bio", t."profileImage", t."verified", t."likeCount", t."followCount", t."chatCount", t."createdAt", u.handle as userHandle, u.email as userEmail FROM "Twin" t JOIN "User" u ON t."userId" = u.id ORDER BY t."likeCount" DESC, t."chatCount" DESC LIMIT ${QUERY_LIMITS.ANALYTICS_DETAILS}`),
          adminAnalyticsDb.query(`SELECT t.id, t."userId", t."styleVector", t."sampleReply", t."instructions", t."isPublic", t."publicHandle", t."bio", t."profileImage", t."verified", t."likeCount", t."followCount", t."chatCount", t."createdAt", u.handle as userHandle, u.email as userEmail FROM "Twin" t JOIN "User" u ON t."userId" = u.id ORDER BY t."createdAt" DESC LIMIT ${QUERY_LIMITS.ANALYTICS_DETAILS}`)
        ]);
        
        data = {
          totalTwins: parseInt(totalTwinsResult.rows[0].count),
          popularTwins: popularTwinsResult.rows.map(twin => sanitizeTwin(twin)), // ✅ Add sanitization
          recentTwins: recentTwinsResult.rows.map(twin => sanitizeTwin(twin)) // ✅ Add sanitization
        };
        break;
        
      case 'chats':
        const [totalChatsResult, activeChatsResult, chatStatsResult] = await Promise.all([
          adminAnalyticsDb.query('SELECT COUNT(*) as count FROM "Chat"'),
          adminAnalyticsDb.query('SELECT COUNT(*) as count FROM "Chat" WHERE "createdAt" >= NOW() - INTERVAL \'24 hours\''),
          adminAnalyticsDb.query(`SELECT c.id, c."userId", c."twinId", c."createdAt", u.handle as userHandle, u.email as userEmail, t.id as twinId FROM "Chat" c JOIN "User" u ON c."userId" = u.id LEFT JOIN "Twin" t ON c."twinId" = t.id ORDER BY c."createdAt" DESC LIMIT ${QUERY_LIMITS.ANALYTICS_DETAILS}`)
        ]);
        
        data = {
          totalChats: parseInt(totalChatsResult.rows[0].count),
          activeChats: parseInt(activeChatsResult.rows[0].count),
          chats: chatStatsResult.rows.map(chat => sanitizeChat(chat)) // ✅ Add sanitization
        };
        break;
        
      case 'messages':
        const [totalMessagesResult, recentMessagesResult, messageStatsResult] = await Promise.all([
          adminAnalyticsDb.query('SELECT COUNT(*) as count FROM "Message"'),
          adminAnalyticsDb.query('SELECT COUNT(*) as count FROM "Message" WHERE "createdAt" >= NOW() - INTERVAL \'24 hours\''),
          adminAnalyticsDb.query(`SELECT m.id, m."chatId", m.sender, m.content, m.approved, m."createdAt", u.handle as userHandle FROM "Message" m JOIN "Chat" c ON m."chatId" = c.id JOIN "User" u ON c."userId" = u.id ORDER BY m."createdAt" DESC LIMIT ${QUERY_LIMITS.ANALYTICS_DETAILS}`)
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
    const { page = 1, limit = QUERY_LIMITS.RECENT_ITEMS, search = '', sortBy = 'createdAt', sortOrder = 'DESC', fromDate = '', toDate = '', minEvents = '' } = req.query;
    
    // Clamp limit: 1..MAX_PAGE_SIZE
    const { safePage, safeLimit, offset } = clampPagination(page, limit);
    
    let whereClause = '';
    let queryParams: any[] = [];
    const conditions: string[] = [];
    
    if (search) {
      conditions.push('(u.email ILIKE $' + (queryParams.length + 1) + ' OR u.handle ILIKE $' + (queryParams.length + 1) + ')');
      queryParams.push(`%${search}%`);
    }
    
    if (fromDate) {
      conditions.push('u."createdAt" >= $' + (queryParams.length + 1));
      queryParams.push(fromDate);
    }
    
    if (toDate) {
      conditions.push('u."createdAt" <= $' + (queryParams.length + 1));
      queryParams.push(toDate);
    }
    
    if (conditions.length > 0) {
      whereClause = 'WHERE ' + conditions.join(' AND ');
    }
    
    // Whitelist sortBy to prevent SQL injection
    const allowedSortBy = ['createdAt', 'email', 'handle', 'twinCount', 'chatCount', 'messageCount', 'eventCount', 'lastActivity'];
    const safeSortBy = allowedSortBy.includes(sortBy as string) ? sortBy as string : 'createdAt';
    const safeSortOrder = (sortOrder as string).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    
    // Enhanced query with all counts and lastActivity
    const usersResult = await adminAnalyticsDb.query(`
      SELECT 
        u.id, 
        u.email, 
        u.handle, 
        u."createdAt",
        u.active,
        COALESCE(COUNT(DISTINCT t.id), 0)::int as "twinCount",
        COALESCE(COUNT(DISTINCT c.id), 0)::int as "chatCount",
        COALESCE(COUNT(DISTINCT m.id), 0)::int as "messageCount",
        COALESCE(COUNT(DISTINCT e.id), 0)::int as "eventCount",
        MAX(e."createdAt") as "lastActivity"
      FROM "User" u
      LEFT JOIN "Twin" t ON u.id = t."userId"
      LEFT JOIN "Chat" c ON u.id = c."userId"
      LEFT JOIN "Message" m ON c.id = m."chatId"
      LEFT JOIN "Event" e ON u.id = e."userId"
      ${whereClause}
      GROUP BY u.id, u.email, u.handle, u."createdAt", u.active
      ORDER BY ${
        safeSortBy === 'twinCount' ? 'COUNT(DISTINCT t.id)' :
        safeSortBy === 'chatCount' ? 'COUNT(DISTINCT c.id)' :
        safeSortBy === 'messageCount' ? 'COUNT(DISTINCT m.id)' :
        safeSortBy === 'eventCount' ? 'COUNT(DISTINCT e.id)' :
        safeSortBy === 'lastActivity' ? 'MAX(e."createdAt")' :
        `u."${safeSortBy}"`
      } ${safeSortOrder}
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `, [...queryParams, safeLimit, offset]);    
    
    // Get total count
    const totalResult = await adminAnalyticsDb.query(`
      SELECT COUNT(*) as total FROM "User" u ${whereClause}
    `, queryParams);
    
    // Get summary with active users today
    const summaryResult = await adminAnalyticsDb.query(`
      SELECT 
        COUNT(*) as "totalUsers",
        COUNT(CASE WHEN u."createdAt" >= NOW() - INTERVAL '24 hours' THEN 1 END) as "newToday",
        COUNT(CASE WHEN u."createdAt" >= NOW() - INTERVAL '7 days' THEN 1 END) as "newThisWeek",
        COUNT(CASE WHEN u."createdAt" >= NOW() - INTERVAL '30 days' THEN 1 END) as "newThisMonth",
        (
          SELECT COUNT(DISTINCT "userId")
          FROM "Event"
          WHERE "createdAt" >= NOW() - INTERVAL '24 hours'
            AND "userId" IS NOT NULL
        ) as "activeToday"
      FROM "User" u
    `);
    
    
    // ✅ Sanitize users before returning
    res.json({
      success: true,
      data: {
        users: usersResult.rows.map(user => {
          const sanitized = sanitizeUser(user, true); // adds publicId, handle, email
          // re-attach safe numeric fields that sanitizeUser doesn't keep
          sanitized.twinCount = user.twinCount ?? 0;
          sanitized.chatCount = user.chatCount ?? 0;
          sanitized.messageCount = user.messageCount ?? 0;
          sanitized.eventCount = user.eventCount ?? 0;
          sanitized.lastActivity = user.lastActivity || null;
          sanitized.active = user.active;
          return sanitized;
        }),
        pagination: {
          currentPage: safePage,
          totalPages: Math.ceil(parseInt(totalResult.rows[0].total) / safeLimit),
          totalItems: parseInt(totalResult.rows[0].total),
          itemsPerPage: safeLimit
        },
        summary: summaryResult.rows[0]
      }
    });    
  } catch (error) {
    logger.error('Error in getDetailedUsersPage', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
};

// Get detailed twins page data with pagination
export const getDetailedTwinsPage = async (req: Request, res: Response) => {
  try {
    
    const { page = 1, limit = QUERY_LIMITS.RECENT_ITEMS, search = '', sortBy = 'createdAt', sortOrder = 'DESC', fromDate = '', toDate = '', isPublic = '', minLikes = '', minChats = '' } = req.query;
    
    // Clamp limit: 1..MAX_PAGE_SIZE
    const { safePage, safeLimit, offset } = clampPagination(page, limit);
    
    let whereClause = '';
    let queryParams: any[] = [];
    const conditions: string[] = [];
    
    if (search) {
      conditions.push('(u.email ILIKE $' + (queryParams.length + 1) + ' OR u.handle ILIKE $' + (queryParams.length + 1) + ' OR t."publicHandle" ILIKE $' + (queryParams.length + 1) + ')');
      queryParams.push(`%${search}%`);
    }
    
    if (fromDate) {
      conditions.push('t."createdAt" >= $' + (queryParams.length + 1));
      queryParams.push(fromDate);
    }
    
    if (toDate) {
      conditions.push('t."createdAt" <= $' + (queryParams.length + 1));
      queryParams.push(toDate);
    }
    
    if (isPublic !== '') {
      conditions.push('t."isPublic" = $' + (queryParams.length + 1));
      queryParams.push(isPublic === 'true');
    }
    
    if (minLikes) {
      conditions.push('t."likeCount" >= $' + (queryParams.length + 1));
      queryParams.push(parseInt(minLikes as string));
    }
    
    if (minChats) {
      conditions.push('t."chatCount" >= $' + (queryParams.length + 1));
      queryParams.push(parseInt(minChats as string));
    }
    
    if (conditions.length > 0) {
      whereClause = 'WHERE ' + conditions.join(' AND ');
    }
    
    // Whitelist sortBy (✅ FIX: removed eventCount)
    const allowedSortBy = ['createdAt', 'likeCount', 'chatCount', 'followCount', 'messageCount', 'name'];
    const safeSortBy = allowedSortBy.includes(sortBy as string) ? sortBy as string : 'createdAt';
    const safeSortOrder = (sortOrder as string).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    
    // Enhanced query with all metrics (✅ FIX: removed Event join + eventCount)
    const twinsResult = await adminAnalyticsDb.query(`
      SELECT 
        t.id,
        t."userId",
        t."publicHandle",
        t."sampleReply" as name,
        t."isPublic",
        t."likeCount",
        t."followCount",
        t."chatCount",
        t."createdAt",
        u.handle as "userHandle",
        u.email as "userEmail",
        COALESCE(COUNT(DISTINCT m.id), 0)::int as "messageCount"
      FROM "Twin" t
      JOIN "User" u ON t."userId" = u.id
      LEFT JOIN "Chat" c ON t.id = c."twinId"
      LEFT JOIN "Message" m ON c.id = m."chatId"
      ${whereClause}
      GROUP BY t.id, t."userId", t."publicHandle", t."sampleReply", t."isPublic", t."likeCount", t."followCount", t."chatCount", t."createdAt", u.handle, u.email
      ORDER BY ${
        safeSortBy === 'messageCount' ? 'COUNT(DISTINCT m.id)' :
        safeSortBy === 'name' ? 't."sampleReply"' :
        `t."${safeSortBy}"`
      } ${safeSortOrder}
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `, [...queryParams, safeLimit, offset]);    
    
    // Get total count
    const totalResult = await adminAnalyticsDb.query(`
      SELECT COUNT(*) as total FROM "Twin" t JOIN "User" u ON t."userId" = u.id ${whereClause}
    `, queryParams);
    
// Get summary (✅ FIX: summary respects same filters + join User because search uses u.email/u.handle)
const summaryResult = await adminAnalyticsDb.query(`
  SELECT 
    COUNT(*) as "totalTwins",
    COUNT(*) FILTER (WHERE t."createdAt" >= NOW() - INTERVAL '24 hours') as "newToday",
    COUNT(*) FILTER (WHERE t."createdAt" >= NOW() - INTERVAL '7 days') as "newThisWeek",
    COUNT(*) FILTER (WHERE t."createdAt" >= NOW() - INTERVAL '30 days') as "newThisMonth",
    COALESCE(AVG(t."likeCount"), 0)::numeric(10,2) as "avgLikes",
    COALESCE(AVG(t."chatCount"), 0)::numeric(10,2) as "avgChats"
  FROM "Twin" t
  JOIN "User" u ON t."userId" = u.id
  ${whereClause}
`, queryParams);    
    
    
    // ✅ Sanitize twins before returning
    res.json({
      success: true,
      data: {
        twins: twinsResult.rows.map(twin => {
          const sanitized = sanitizeTwin(twin); // adds publicId + publicUserId
          // re-attach safe analytics fields (✅ FIX: removed eventCount)
          sanitized.messageCount = twin.messageCount ?? 0;
          // owner identifiers are already inside sanitizeTwin: userHandle, userEmail
          return sanitized;
        }),
        pagination: {
          currentPage: safePage,
          totalPages: Math.ceil(parseInt(totalResult.rows[0].total) / safeLimit),
          totalItems: parseInt(totalResult.rows[0].total),
          itemsPerPage: safeLimit
        },
        summary: summaryResult.rows[0]
      }
    });    
    
  } catch (error) {
    logger.error('Error in getDetailedTwinsPage', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Get detailed chats page data with pagination
export const getDetailedChatsPage = async (req: Request, res: Response) => {
  try {
    
    const { page = 1, limit = QUERY_LIMITS.RECENT_ITEMS, search = '', sortBy = 'createdAt', sortOrder = 'DESC', fromDate = '', toDate = '', twinHandle = '' } = req.query;
    
    // Clamp limit: 1..MAX_PAGE_SIZE
    const { safePage, safeLimit, offset } = clampPagination(page, limit);
    
    let whereClause = '';
    let queryParams: any[] = [];
    const conditions: string[] = ['c."messageCount" > 0']; // ✅ FIX: Exclude 0-message chats
    
    if (search) {
      conditions.push('(u.email ILIKE $' + (queryParams.length + 1) + ' OR u.handle ILIKE $' + (queryParams.length + 1) + ')');
      queryParams.push(`%${search}%`);
    }
    
    if (fromDate) {
      conditions.push('c."createdAt" >= $' + (queryParams.length + 1));
      queryParams.push(fromDate);
    }
    
    if (toDate) {
      conditions.push('c."createdAt" <= $' + (queryParams.length + 1));
      queryParams.push(toDate);
    }
    
    if (twinHandle) {
      conditions.push('t."publicHandle" ILIKE $' + (queryParams.length + 1));
      queryParams.push(`%${twinHandle}%`);
    }
    
    if (conditions.length > 0) {
      whereClause = 'WHERE ' + conditions.join(' AND ');
    }
    
    // Whitelist sortBy
    const allowedSortBy = ['createdAt', 'messageCount', 'lastMessageAt'];
    const safeSortBy = allowedSortBy.includes(sortBy as string) ? sortBy as string : 'createdAt';
    const safeSortOrder = (sortOrder as string).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    
    // Enhanced query with message count, last message, twin info
    const chatsResult = await adminAnalyticsDb.query(`
      SELECT 
        c.id,
        c."userId",
        c."twinId",
        c."createdAt",
        u.handle as "userHandle",
        u.email as "userEmail",
        t."publicHandle" as "twinHandle",
        t."sampleReply" as "twinName",
        t."isPublic",
        (SELECT COUNT(*) FROM "Message" m WHERE m."chatId" = c.id) as "messageCount",
        (SELECT MAX(m."createdAt") FROM "Message" m WHERE m."chatId" = c.id) as "lastMessageAt"
      FROM "Chat" c
      JOIN "User" u ON c."userId" = u.id
      LEFT JOIN "Twin" t ON c."twinId" = t.id
      ${whereClause}
      ORDER BY ${
        safeSortBy === 'messageCount' ? '(SELECT COUNT(*) FROM "Message" m WHERE m."chatId" = c.id)' :
        safeSortBy === 'lastMessageAt' ? '(SELECT MAX(m."createdAt") FROM "Message" m WHERE m."chatId" = c.id)' :
        `c."${safeSortBy}"`
      } ${safeSortOrder}
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `, [...queryParams, safeLimit, offset]);    
    
    // Get total count (✅ FIX: include Twin join because whereClause may reference t."publicHandle")
    const totalResult = await adminAnalyticsDb.query(`
      SELECT COUNT(*) as total
      FROM "Chat" c
      JOIN "User" u ON c."userId" = u.id
      LEFT JOIN "Twin" t ON c."twinId" = t.id
      ${whereClause}
    `, queryParams);
    
// Get summary (✅ FIX: summary respects same filters)
const summaryResult = await adminAnalyticsDb.query(`
  WITH filtered_chats AS (
    SELECT c.id, c."createdAt"
    FROM "Chat" c
    JOIN "User" u ON c."userId" = u.id
    LEFT JOIN "Twin" t ON c."twinId" = t.id
    ${whereClause}
  ),
  msg_counts AS (
    SELECT m."chatId" as chat_id, COUNT(*)::int as msg_count
    FROM "Message" m
    JOIN filtered_chats fc ON fc.id = m."chatId"
    GROUP BY m."chatId"
  )
  SELECT
    (SELECT COUNT(*) FROM filtered_chats) as "totalChats",
    (SELECT COUNT(*) FROM filtered_chats WHERE "createdAt" >= NOW() - INTERVAL '24 hours') as "newToday",
    (SELECT COUNT(*) FROM filtered_chats WHERE "createdAt" >= NOW() - INTERVAL '7 days') as "newThisWeek",
    (SELECT COUNT(*) FROM filtered_chats WHERE "createdAt" >= NOW() - INTERVAL '30 days') as "newThisMonth",
    COALESCE((SELECT AVG(msg_count)::numeric(10,2) FROM msg_counts), 0) as "avgMessagesPerChat"
`, queryParams);

    
    // ✅ Sanitize chats before returning
    res.json({
      success: true,
      data: {
        chats: chatsResult.rows.map(chat => {
          const sanitized = sanitizeChat(chat); // adds publicId, publicUserId, publicTwinId
          // re-attach safe analytics/display fields
          sanitized.userHandle = chat.userHandle;
          sanitized.userEmail = chat.userEmail;
          sanitized.twinHandle = chat.twinHandle;
          sanitized.twinName = chat.twinName;
          sanitized.isPublic = chat.isPublic;
          sanitized.messageCount = parseInt(chat.messageCount ?? 0);
          sanitized.lastMessageAt = chat.lastMessageAt;
          return sanitized;
        }),
        pagination: {
          currentPage: safePage,
          totalPages: Math.ceil(parseInt(totalResult.rows[0].total) / safeLimit),
          totalItems: parseInt(totalResult.rows[0].total),
          itemsPerPage: safeLimit
        },
        summary: summaryResult.rows[0]
      }
    });

  } catch (error) {
    const { logger } = await import('../../config/logger');
    logger.error('Error in getDetailedChatsPage', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
};

// Get detailed messages page data with pagination
export const getDetailedMessagesPage = async (req: Request, res: Response) => {
  try {
    
    const { page = 1, limit = QUERY_LIMITS.RECENT_ITEMS, search = '', sortBy = 'createdAt', sortOrder = 'DESC', fromDate = '', toDate = '', sender = '', approved = '', twinHandle = '' } = req.query;
    
    // Clamp limit: 1..MAX_PAGE_SIZE
    const { safePage, safeLimit, offset } = clampPagination(page, limit);
    
    let whereClause = '';
    let queryParams: any[] = [];
    const conditions: string[] = [];
    
    if (search) {
      conditions.push('(u.email ILIKE $' + (queryParams.length + 1) + ' OR u.handle ILIKE $' + (queryParams.length + 1) + ' OR m.content ILIKE $' + (queryParams.length + 1) + ')');
      queryParams.push(`%${search}%`);
    }
    
    if (fromDate) {
      conditions.push('m."createdAt" >= $' + (queryParams.length + 1));
      queryParams.push(fromDate);
    }
    
    if (toDate) {
      conditions.push('m."createdAt" <= $' + (queryParams.length + 1));
      queryParams.push(toDate);
    }
    
    if (sender) {
      conditions.push('m.sender = $' + (queryParams.length + 1));
      queryParams.push(sender);
    }
    
    if (approved !== '') {
      conditions.push('m.approved = $' + (queryParams.length + 1));
      queryParams.push(approved === 'true');
    }
    
    if (twinHandle) {
      conditions.push('t."publicHandle" ILIKE $' + (queryParams.length + 1));
      queryParams.push(`%${twinHandle}%`);
    }
    
    if (conditions.length > 0) {
      whereClause = 'WHERE ' + conditions.join(' AND ');
    }
    
    // Whitelist sortBy
    const allowedSortBy = ['createdAt', 'content', 'sender', 'approved'];
    const safeSortBy = allowedSortBy.includes(sortBy as string) ? sortBy as string : 'createdAt';
    const safeSortOrder = (sortOrder as string).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    
    // Enhanced query with sender, approved, twin info, userId
    const messagesResult = await adminAnalyticsDb.query(`
      SELECT 
        m.id,
        m."chatId",
        m.sender,
        m.content,
        m.approved,
        m."createdAt",
        u.id as "userId",
        u.handle as "userHandle",
        u.email as "userEmail",
        t."publicHandle" as "twinHandle",
        t."sampleReply" as "twinName"
      FROM "Message" m
      JOIN "Chat" c ON m."chatId" = c.id
      JOIN "User" u ON c."userId" = u.id
      LEFT JOIN "Twin" t ON c."twinId" = t.id
      ${whereClause}
   ORDER BY ${
        safeSortBy === 'content' ? 'm.content' :
        safeSortBy === 'sender' ? 'm.sender' :
        safeSortBy === 'approved' ? 'm.approved' :
        `m."${safeSortBy}"`
      } ${safeSortOrder}      
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `, [...queryParams, safeLimit, offset]);    
    
    // Get total count (✅ FIX: include Twin join because whereClause may reference t."publicHandle")
    const totalResult = await adminAnalyticsDb.query(`
      SELECT COUNT(*) as total
      FROM "Message" m
      JOIN "Chat" c ON m."chatId" = c.id
      JOIN "User" u ON c."userId" = u.id
      LEFT JOIN "Twin" t ON c."twinId" = t.id
      ${whereClause}
    `, queryParams);
    
// Get summary (✅ FIX: summary respects same filters)
const summaryResult = await adminAnalyticsDb.query(`
  WITH filtered_messages AS (
    SELECT m.*
    FROM "Message" m
    JOIN "Chat" c ON m."chatId" = c.id
    JOIN "User" u ON c."userId" = u.id
    LEFT JOIN "Twin" t ON c."twinId" = t.id
    ${whereClause}
  )
  SELECT
    COUNT(*) as "totalMessages",
    COUNT(*) FILTER (WHERE "createdAt" >= NOW() - INTERVAL '24 hours') as "newToday",
    COUNT(*) FILTER (WHERE "createdAt" >= NOW() - INTERVAL '7 days') as "newThisWeek",
    COUNT(*) FILTER (WHERE "createdAt" >= NOW() - INTERVAL '30 days') as "newThisMonth",
    COALESCE(AVG(LENGTH(content))::numeric(10,2), 0) as "avgMessageLength"
  FROM filtered_messages
`, queryParams);    
    
    
    // ✅ Sanitize messages before returning and add publicUserId
    res.json({
      success: true,
      data: {
        messages: messagesResult.rows.map(msg => {
          const sanitized = sanitizeMessage(msg);
          // Add publicUserId since sanitizeMessage doesn't handle userId
          if (msg.userId) {
            sanitized.publicUserId = tokenizeId(msg.userId, 'user');
          }
          // Keep userHandle and userEmail for display
          sanitized.userHandle = msg.userHandle;
          sanitized.userEmail = msg.userEmail;
          sanitized.twinHandle = msg.twinHandle;
          sanitized.twinName = msg.twinName;
          return sanitized;
        }),
        pagination: {
          currentPage: safePage,
          totalPages: Math.ceil(parseInt(totalResult.rows[0].total) / safeLimit),
          totalItems: parseInt(totalResult.rows[0].total),
          itemsPerPage: safeLimit
        },
        summary: summaryResult.rows[0]
      }
    });
    
  } catch (error) {
    logger.error('Error in getDetailedMessagesPage', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
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
      adminAnalyticsDb.query('SELECT NOW() as current_time, version() as db_version'),
      adminAnalyticsDb.query('SELECT COUNT(*) as error_count FROM "Event" WHERE type = \'error\' AND "createdAt" >= NOW() - INTERVAL \'24 hours\''),
      adminAnalyticsDb.query('SELECT AVG(EXTRACT(EPOCH FROM ("createdAt" - LAG("createdAt") OVER (ORDER BY "createdAt")))) as avg_response_time FROM "Event" WHERE "createdAt" >= NOW() - INTERVAL \'1 hour\'')
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

// function to get event analytics:
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
      adminAnalyticsDb.query(`
        SELECT type, COUNT(*) as count
        FROM "Event"
        ${timeFilter}
        GROUP BY type
        ORDER BY count DESC
      `),
      adminAnalyticsDb.query(`
        SELECT EXTRACT(HOUR FROM "createdAt") as hour, COUNT(*) as count
        FROM "Event"
        ${timeFilter}
        GROUP BY EXTRACT(HOUR FROM "createdAt")
        ORDER BY hour
      `),
      adminAnalyticsDb.query(`
        SELECT DATE("createdAt") as date, COUNT(*) as count
        FROM "Event"
        ${timeFilter}
        GROUP BY DATE("createdAt")
        ORDER BY date DESC
        LIMIT 30
      `),
      adminAnalyticsDb.query(`
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
    
    // Clamp limit: 1..MAX_PAGE_SIZE
    const { safePage, safeLimit, offset } = clampPagination(page, limit, 50);
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
    
    // User filter - ✅ Support tokenized userId
    if (userId) {
      const actualUserId = maybeDetokenizeUserId(String(userId));
      conditions.push(`e."userId" = $${paramIndex}`);
      params.push(actualUserId);
      paramIndex++;
    }
    
    // Meta filter (JSONB query) - ✅ FIX: Whitelist keys to prevent SQL injection
    if (metaFilter) {
      // Support for simple key:value filters like "wv:event" or "source:dashboard"
      const metaFilterStr =
        typeof metaFilter === 'string'
          ? metaFilter
          : Array.isArray(metaFilter)
            ? String(metaFilter[0] || '')
            : '';
      const [key, value] = metaFilterStr.split(':');
      
      // ✅ Only allow known keys (prevents injection)
      const allowedMetaKeys = new Set([
        'wv',
        'source',
        'twinId',
        'chatId',
        'mode',
        'reason',
        'publicTwinId',
        'publicChatId',
        'twinHandle',
      ]);
      
      if (key && value) {
        const safeKey = key.trim();
        const safeValue = value.trim();
        
        if (allowedMetaKeys.has(safeKey)) {
          conditions.push(`e.meta->>'${safeKey}' = $${paramIndex}`);
          params.push(safeValue);
          paramIndex++;
        }
      }
    }
    
    const whereClause = conditions.length > 0 
      ? `WHERE ${conditions.join(' AND ')}`
      : '';
    
    // Get events with user info
    const eventsResult = await adminAnalyticsDb.query(`
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
    `, [...params, safeLimit, offset]);
    
    // Get total count
    const countResult = await adminAnalyticsDb.query(`
      SELECT COUNT(*) as total
      FROM "Event" e
      ${whereClause}
    `, params);
    
    // Get event type breakdown for filter dropdown
    const typesResult = await adminAnalyticsDb.query(`
      SELECT DISTINCT type
      FROM "Event"
      ORDER BY type
    `);
    
    res.json({
      success: true,
      data: {
        events: eventsResult.rows.map(event => sanitizeEvent(event)),
        pagination: {
          currentPage: safePage,
          totalPages: Math.ceil(parseInt(countResult.rows[0].total) / safeLimit),
          totalItems: parseInt(countResult.rows[0].total),
          itemsPerPage: safeLimit
        },
        eventTypes: typesResult.rows.map(r => r.type)
      }
    });
    
  } catch (error) {
    logger.error('Event explorer error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get chat messages for admin (bypasses user ownership check)
export const getAdminChatMessages = async (req: Request, res: Response) => {
  try {
    const { chatId } = req.params;
    
    // Detokenize if needed
    const decoded = detokenizeId(chatId);
    const actualChatId = decoded && decoded.type === 'chat' ? decoded.id : chatId;
    
    // Get messages for this chat (admin can see all)
    const messagesResult = await adminAnalyticsDb.query(`
      SELECT id, "chatId", sender, content, approved, "createdAt"
      FROM "Message"
      WHERE "chatId" = $1
      ORDER BY "createdAt" ASC
    `, [actualChatId]);
    
    res.json({
      success: true,
      messages: messagesResult.rows.map(msg => sanitizeMessage(msg))
    });
    
  } catch (error) {
    logger.error('Admin get chat messages error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get single message details for admin
export const getAdminMessageDetails = async (req: Request, res: Response) => {
  try {
    const { messageId } = req.params;
    
    // Detokenize if needed
    const decoded = detokenizeId(messageId);
    const actualMessageId = decoded ? decoded.id : messageId;
    
    const messageResult = await adminAnalyticsDb.query(`
      SELECT m.id, m."chatId", m.sender, m.content, m.approved, m."createdAt",
             u.id as "userId", u.handle as "userHandle", u.email as "userEmail",
             t."publicHandle" as "twinHandle", t."sampleReply" as "twinName"
      FROM "Message" m
      JOIN "Chat" c ON m."chatId" = c.id
      JOIN "User" u ON c."userId" = u.id
      LEFT JOIN "Twin" t ON c."twinId" = t.id
      WHERE m.id = $1
    `, [actualMessageId]);
    
    if (messageResult.rows.length === 0) {
      return res.status(404).json({ error: 'Message not found' });
    }
    
    res.json({
      success: true,
      data: sanitizeMessage(messageResult.rows[0])
    });
    
  } catch (error) {
    logger.error('Admin get message details error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get activity feed with filters, pagination and summary
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
    
    // Clamp limit: 1..MAX_PAGE_SIZE
    const { safePage, safeLimit, offset } = clampPagination(page, limit, 50);
    const eventTypesArray = eventTypes && typeof eventTypes === 'string'
    ? eventTypes.split(',').filter(t => t.trim())
    : []; // no type filter by default
        
    let whereClause = '';
    let queryParams: any[] = [];
    
    // Event types filter
    if (eventTypesArray.length > 0) {
      const placeholders = eventTypesArray.map((_, i) => `$${i + 1}`).join(', ');
      whereClause = `WHERE e.type IN (${placeholders})`;
      queryParams.push(...eventTypesArray);
    }
    
    // User filter - ✅ Support tokenized userId
    if (userId) {
      const actualUserId = maybeDetokenizeUserId(String(userId));
      const userIdCondition = `e."userId" = $${queryParams.length + 1}`;
      queryParams.push(actualUserId);
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
    
    // Activity list
    const activityResult = await adminAnalyticsDb.query(`
      SELECT 
        e.id,
        e.type,
        e."userId",
        e.meta,
        e."createdAt",
        u.handle as "userHandle",
        u.email as "userEmail",
        u."profileImage" as "userProfileImage",
        COALESCE(e.meta->>'twinHandle', t."publicHandle") as "twinHandle",
        t."isPublic" as "twinIsPublic"
      FROM "Event" e
      LEFT JOIN "User" u ON e."userId" = u.id
      LEFT JOIN "Twin" t
        ON (e.meta->>'twinId')::text = t.id::text
      ${whereClause}
      ORDER BY e."createdAt" DESC
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `, [...queryParams, safeLimit, offset]);
    
    // Total count
    const totalResult = await adminAnalyticsDb.query(`
      SELECT COUNT(*) as total 
      FROM "Event" e
      ${whereClause}
    `, queryParams);
    
    // Summary stats
    const summaryResult = await adminAnalyticsDb.query(`
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

    // Daily counts for chart
    const dailyCountsResult = await adminAnalyticsDb.query(`
      SELECT 
        DATE(e."createdAt") as date,
        COUNT(*) as total
      FROM "Event" e
      ${whereClause}
      GROUP BY DATE(e."createdAt")
      ORDER BY DATE(e."createdAt")
    `, queryParams);
    
    
    res.json({
      success: true,
      data: {
        activities: activityResult.rows.map(activity => {
          const sanitized = sanitizeEvent(activity);
          sanitized.description = formatActivityDescription(activity);
          return sanitized;
        }),
        pagination: {
          currentPage: safePage,
          totalPages: Math.ceil(parseInt(totalResult.rows[0].total) / safeLimit),
          totalItems: parseInt(totalResult.rows[0].total),
          itemsPerPage: safeLimit
        },
        summary: summaryResult.rows[0],
        dailyCounts: dailyCountsResult.rows
      }
    });
    
  } catch (error) {
    logger.error('Get activity feed error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: (error as Error).message 
    });
  }
};

// Helper to format activity description
function formatActivityDescription(activity: any): string {
  const { type, userHandle, userEmail, twinHandle } = activity;
  const userName = userHandle || userEmail || 'Unknown User';
  
  switch (type) {
    case 'signup':
      return `${userName} signed up`;
    case 'twin_created':
      return `${userName} created twin @${twinHandle || 'unknown'}`;
    case 'chat_started':
      return `${userName} started chat with @${twinHandle || 'unknown'}`;
    case 'message_approved':
      return `${userName} approved a message`;
    case 'invite_sent':
      return `${userName} sent an invite`;
    case 'invite_accepted':
      return `${userName} accepted an invite`;
    case 'profile_shared':
    case 'twin_shared':
      return `${userName} shared ${twinHandle ? `@${twinHandle}` : 'a profile'}`;
    default:
      return `${userName} performed ${type}`;
  }
}

// ✅ Token Analytics Endpoint
export const getTokenAnalytics = async (req: Request, res: Response) => {
  try {
    const { period = 'day', userId, chatId, limit = 50 } = req.query;
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 1000);
    
    // ✅ FIX: Use explicit UTC date calculations for period filter
    let periodFilter = '';
    let periodParams: any[] = [];
    let paramCount = 1;
    
    // Get current UTC date for consistent filtering
    const now = new Date();
    const utcDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    
    if (period === 'day') {
      periodFilter = `AND e."createdAt" >= $${paramCount}::timestamptz`;
      periodParams.push(utcDate.toISOString());
      paramCount++;
    } else if (period === 'week') {
      const weekAgo = new Date(utcDate);
      weekAgo.setUTCDate(weekAgo.getUTCDate() - 7);
      periodFilter = `AND e."createdAt" >= $${paramCount}::timestamptz`;
      periodParams.push(weekAgo.toISOString());
      paramCount++;
    } else if (period === 'month') {
      const monthAgo = new Date(utcDate);
      monthAgo.setUTCDate(monthAgo.getUTCDate() - 30);
      periodFilter = `AND e."createdAt" >= $${paramCount}::timestamptz`;
      periodParams.push(monthAgo.toISOString());
      paramCount++;
    }
    
    // Build WHERE clause for userId/chatId filters - ✅ Support tokenized IDs
    let whereClause = `WHERE e.type = 'llm_usage' ${periodFilter}`;
    if (userId) {
      const actualUserId = maybeDetokenizeUserId(String(userId));
      whereClause += ` AND e."userId" = $${paramCount}`;
      periodParams.push(actualUserId);
      paramCount++;
    }
    if (chatId) {
      const actualChatId = maybeDetokenizeChatId(String(chatId));
      whereClause += ` AND e.meta->>'chatId' = $${paramCount}`;
      periodParams.push(actualChatId);
      paramCount++;
    }
    
    // ✅ ADD: Debug logging
    logger.info('Token analytics query:', {
      period,
      whereClause,
      paramCount: periodParams.length,
      userId,
      chatId
    });
    
    // 1. Overall Summary (All Users)
    const overallSummary = await adminAnalyticsDb.query(`
      SELECT 
        COUNT(*) as message_count,
        COALESCE(SUM((e.meta->>'totalTokens')::int), 0) as total_tokens,
        COALESCE(SUM((e.meta->>'inputTokens')::int), 0) as input_tokens,
        COALESCE(SUM((e.meta->>'outputTokens')::int), 0) as output_tokens,
        COALESCE(AVG((e.meta->>'totalTokens')::int), 0) as avg_tokens_per_message,
        COUNT(CASE WHEN e.meta->>'reason' IS NOT NULL THEN 1 END) as blocked_count
      FROM "Event" e
      ${whereClause}
    `, periodParams);
    
    // ✅ ADD: Debug result
    logger.info('Overall summary result:', overallSummary.rows[0]);
    
    // 2. Per User Summary
    const perUserQuery = userId 
      ? `SELECT 
          e."userId",
          COUNT(*) as message_count,
          COALESCE(SUM((e.meta->>'totalTokens')::int), 0) as total_tokens,
          COALESCE(SUM((e.meta->>'inputTokens')::int), 0) as input_tokens,
          COALESCE(SUM((e.meta->>'outputTokens')::int), 0) as output_tokens,
          COALESCE(AVG((e.meta->>'totalTokens')::int), 0) as avg_tokens_per_message,
          COUNT(CASE WHEN e.meta->>'reason' IS NOT NULL THEN 1 END) as blocked_count
        FROM "Event" e
        ${whereClause}
        GROUP BY e."userId"
        ORDER BY total_tokens DESC
        LIMIT $${paramCount}`
      : `SELECT 
          e."userId",
          COUNT(*) as message_count,
          COALESCE(SUM((e.meta->>'totalTokens')::int), 0) as total_tokens,
          COALESCE(SUM((e.meta->>'inputTokens')::int), 0) as input_tokens,
          COALESCE(SUM((e.meta->>'outputTokens')::int), 0) as output_tokens,
          COALESCE(AVG((e.meta->>'totalTokens')::int), 0) as avg_tokens_per_message,
          COUNT(CASE WHEN e.meta->>'reason' IS NOT NULL THEN 1 END) as blocked_count
        FROM "Event" e
        ${whereClause}
        GROUP BY e."userId"
        ORDER BY total_tokens DESC
        LIMIT $${paramCount}`;
    
    const perUserParams = [...periodParams, safeLimit];
    const perUserSummary = await adminAnalyticsDb.query(perUserQuery, perUserParams);
    
    // 3. Per Chat Summary
    const perChatQuery = chatId
      ? `SELECT 
          e.meta->>'chatId' as chat_id,
          COUNT(*) as message_count,
          COALESCE(SUM((e.meta->>'totalTokens')::int), 0) as total_tokens,
          COALESCE(SUM((e.meta->>'inputTokens')::int), 0) as input_tokens,
          COALESCE(SUM((e.meta->>'outputTokens')::int), 0) as output_tokens,
          COALESCE(AVG((e.meta->>'totalTokens')::int), 0) as avg_tokens_per_message
        FROM "Event" e
        ${whereClause}
        GROUP BY e.meta->>'chatId'
        ORDER BY total_tokens DESC
        LIMIT $${paramCount}`
      : `SELECT 
          e.meta->>'chatId' as chat_id,
          COUNT(*) as message_count,
          COALESCE(SUM((e.meta->>'totalTokens')::int), 0) as total_tokens,
          COALESCE(SUM((e.meta->>'inputTokens')::int), 0) as input_tokens,
          COALESCE(SUM((e.meta->>'outputTokens')::int), 0) as output_tokens,
          COALESCE(AVG((e.meta->>'totalTokens')::int), 0) as avg_tokens_per_message
        FROM "Event" e
        ${whereClause}
        GROUP BY e.meta->>'chatId'
        ORDER BY total_tokens DESC
        LIMIT $${paramCount}`;
    
    const perChatParams = [...periodParams, safeLimit];
    const perChatSummary = await adminAnalyticsDb.query(perChatQuery, perChatParams);
    
    // 4. Per Message Details (Recent)
    const perMessageQuery = `SELECT 
      e.id,
      e."createdAt",
      e."userId",
      e.meta->>'chatId' as chat_id,
      e.meta->>'twinId' as twin_id,
      e.meta->>'mode' as mode,
      e.meta->>'messageId' as message_id,
      COALESCE((e.meta->>'inputTokens')::int, 0) as input_tokens,
      COALESCE((e.meta->>'outputTokens')::int, 0) as output_tokens,
      COALESCE((e.meta->>'totalTokens')::int, 0) as total_tokens,
      e.meta->>'reason' as reason
    FROM "Event" e
    ${whereClause}
    ORDER BY e."createdAt" DESC
    LIMIT $${paramCount}`;
    
    const perMessageParams = [...periodParams, safeLimit];
    const perMessageDetails = await adminAnalyticsDb.query(perMessageQuery, perMessageParams);
    
    // ✅ ADD: Debug message details
    logger.info('Per message details count:', perMessageDetails.rows.length);
    if (perMessageDetails.rows.length > 0) {
      logger.info('Sample message:', perMessageDetails.rows[0]);
    }
    
    // 5. Daily Breakdown (Last 30 days) - ✅ FIX: Use explicit date calculation
    const thirtyDaysAgo = new Date(utcDate);
    thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);
    const dailyBreakdown = await adminAnalyticsDb.query(`
      SELECT 
        DATE(e."createdAt") as date,
        COUNT(*) as message_count,
        COALESCE(SUM((e.meta->>'totalTokens')::int), 0) as total_tokens,
        COALESCE(SUM((e.meta->>'inputTokens')::int), 0) as input_tokens,
        COALESCE(SUM((e.meta->>'outputTokens')::int), 0) as output_tokens
      FROM "Event" e
      WHERE e.type = 'llm_usage'
        AND e."createdAt" >= $1::timestamptz
        ${userId ? `AND e."userId" = $2` : ''}
      GROUP BY DATE(e."createdAt")
      ORDER BY date DESC
    `, userId ? [thirtyDaysAgo.toISOString(), userId] : [thirtyDaysAgo.toISOString()]);
    
    // 6. Top Users by Tokens - ✅ FIX: Use periodFilter with params
    const topUsersParams = periodParams.length > 0 ? periodParams : [];
    const topUsersQuery = `SELECT 
      e."userId",
      COUNT(*) as message_count,
      COALESCE(SUM((e.meta->>'totalTokens')::int), 0) as total_tokens
    FROM "Event" e
    WHERE e.type = 'llm_usage'
      AND e."userId" IS NOT NULL
      ${periodFilter}
    GROUP BY e."userId"
    ORDER BY total_tokens DESC
    LIMIT 10`;
    
    const topUsers = await adminAnalyticsDb.query(topUsersQuery, topUsersParams);
    
    // 7. Blocked Messages Breakdown - ✅ FIX: Use periodFilter with params
    const blockedQuery = `SELECT 
      e.meta->>'reason' as reason,
      COUNT(*) as count
    FROM "Event" e
    WHERE e.type = 'llm_usage'
      AND e.meta->>'reason' IS NOT NULL
      ${periodFilter}
    GROUP BY e.meta->>'reason'`;
    
    const blockedBreakdown = await adminAnalyticsDb.query(blockedQuery, periodParams);
    
    res.json({
      success: true,
      period,
      summary: {
        overall: overallSummary.rows[0] || {
          message_count: 0,
          total_tokens: 0,
          input_tokens: 0,
          output_tokens: 0,
          avg_tokens_per_message: 0,
          blocked_count: 0
        },
        perUser: perUserSummary.rows,
        perChat: perChatSummary.rows,
        blocked: blockedBreakdown.rows
      },
      details: {
        messages: perMessageDetails.rows,
        daily: dailyBreakdown.rows,
        topUsers: topUsers.rows
      }
    });
  } catch (error) {
    logger.error('Token analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch token analytics' });
  }
};