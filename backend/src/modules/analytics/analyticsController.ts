import { Request, Response } from 'express';
import { db } from '../../config/database';
import { logger } from '../../config/logger';

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

export const debugUserData = async (req: Request, res: Response) => {
  try {
    console.log('=== DEBUG USER DATA ===');
    console.log('req.user:', req.user);
    console.log('req.session:', req.session);
    
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
    
    console.log('User ID:', userId);

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

    console.log('User data from DB:', user);

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
    console.error('Debug user data error:', error);
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
      const eventId = 'c' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
      await db.query(
        'INSERT INTO "Event" (id, "userId", type, meta) VALUES ($1, $2, $3, $4)',
        [eventId, userId, event.type, JSON.stringify(event.meta)]
      );
    }

    res.json({
      success: true,
      message: 'Sample data created successfully'
    });
  } catch (error) {
    console.error('Create sample data error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getUserAnalytics = async (req: Request, res: Response) => {
  try {
    console.log('=== ANALYTICS DEBUG ===');
    console.log('req.user:', req.user);
    console.log('req.session:', req.session);
    
    let userId: string | null = null;
    
    // Try JWT authentication first
    if (req.user) {
      if (req.user.id) {
        userId = req.user.id;
        console.log('User ID from JWT (id field):', userId);
      } else if (req.user.userId) {
        userId = req.user.userId;
        console.log('User ID from JWT (userId field):', userId);
      }
    }
    // Fallback to session authentication
    else if (req.session && req.session.userId) {
      userId = req.session.userId;
      console.log('User ID from session:', userId);
    }
    
    if (!userId) {
      console.log('No user found in request');
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Check if user exists in database
    let userExists;
    try {
      const userResult = await db.query('SELECT id FROM "User" WHERE id = $1', [userId]);
      userExists = userResult.rows[0];
      console.log('User exists check result:', userExists);
    } catch (dbError) {
      console.error('Database error checking user:', dbError);
      return res.status(500).json({ error: 'Database connection error' });
    }

    if (!userExists) {
      console.log('User not found in database, creating basic record...');
      try {
        // Create a basic user record if it doesn't exist
        await db.query(
          'INSERT INTO "User" (id, email, handle, active) VALUES ($1, $2, $3, $4)',
          [userId, req.user?.email || 'unknown@example.com', req.user?.handle || 'unknown', true]
        );
        console.log('User record created successfully');
      } catch (createError) {
        console.error('Error creating user record:', createError);
        return res.status(500).json({ error: 'Failed to create user record' });
      }
    }

    // Get user's analytics
    let userTwins, userChats, userMessages, userInvitesSent, userInvitesReceived, userEvents;
    
    try {
      console.log('Fetching analytics data for user:', userId);
      const [
        twinsResult,
        chatsResult,
        messagesResult,
        invitesSentResult,
        invitesReceivedResult,
        eventsResult
      ] = await Promise.all([
        db.query('SELECT COUNT(*) as count FROM "Twin" WHERE "userId" = $1', [userId]),
        db.query('SELECT COUNT(*) as count FROM "Chat" WHERE "userId" = $1', [userId]),
        db.query('SELECT COUNT(*) as count FROM "Message" m JOIN "Chat" c ON m."chatId" = c.id WHERE c."userId" = $1', [userId]),
        db.query('SELECT COUNT(*) as count FROM "Invite" WHERE "inviterId" = $1', [userId]),
        db.query('SELECT COUNT(*) as count FROM "Invite" WHERE "acceptedBy" = $1', [userId]),
        db.query('SELECT COUNT(*) as count FROM "Event" WHERE "userId" = $1', [userId]),
      ]);

      userTwins = parseInt(twinsResult.rows[0].count);
      userChats = parseInt(chatsResult.rows[0].count);
      userMessages = parseInt(messagesResult.rows[0].count);
      userInvitesSent = parseInt(invitesSentResult.rows[0].count);
      userInvitesReceived = parseInt(invitesReceivedResult.rows[0].count);
      userEvents = parseInt(eventsResult.rows[0].count);

      console.log('Analytics data fetched successfully:', {
        userTwins, userChats, userMessages, userInvitesSent, userInvitesReceived, userEvents
      });
    } catch (analyticsError) {
      console.error('Error fetching analytics data:', analyticsError);
      return res.status(500).json({ error: 'Failed to fetch analytics data' });
    }

    // Get user's event breakdown
    let userEventBreakdown: Record<string, number> = {};
    let formattedActivity: Array<{description: string, timestamp: Date, metadata: any}> = [];
    
    try {
      console.log('Fetching event breakdown for user:', userId);
      const userEventTypesResult = await db.query(
        'SELECT type, COUNT(*) as count FROM "Event" WHERE "userId" = $1 GROUP BY type',
        [userId]
      );

      userEventBreakdown = userEventTypesResult.rows.reduce((acc, event) => {
        acc[event.type] = parseInt(event.count);
        return acc;
      }, {} as Record<string, number>);
      console.log('Event breakdown fetched:', userEventBreakdown);

      // Get recent activity (last 10 events)
      const recentActivityResult = await db.query(
        'SELECT type, "createdAt", meta FROM "Event" WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT 10',
        [userId]
      );

      // Format recent activity for frontend
      formattedActivity = recentActivityResult.rows.map(event => ({
        description: `${event.type} activity`,
        timestamp: event.createdAt,
        metadata: event.meta,
      }));
      console.log('Recent activity fetched:', formattedActivity.length, 'events');
    } catch (eventError) {
      console.error('Error fetching event data:', eventError);
      // Continue with empty data rather than failing completely
    }

    const responseData = {
      success: true,
      user: {
        id: userId,
        email: req.user?.email || 'Unknown',
        handle: req.user?.handle || 'Unknown',
      },
      analytics: {
        totalViews: userEvents || 0, // Using events as a proxy for views
        totalLikes: userInvitesReceived || 0, // Using received invites as likes
        totalFollowers: userInvitesSent || 0, // Using sent invites as followers
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

    console.log('Sending analytics response:', JSON.stringify(responseData, null, 2));
    res.json(responseData);
  } catch (error) {
    logger.error('Get user analytics error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
