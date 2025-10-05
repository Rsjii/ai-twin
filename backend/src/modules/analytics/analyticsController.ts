import { Request, Response } from 'express';
import { prisma } from '../../config/prisma';
import { logger } from '../../config/logger';
import { AuthenticatedRequest } from '../../middleware/auth';

export const getMetricsSummary = async (req: Request, res: Response) => {
  try {
    // Get counts for all major metrics
    const [
      totalUsers,
      totalTwins,
      totalChats,
      totalMessages,
      totalInvites,
      totalEvents,
      recentSignups,
      recentTwins,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.twin.count(),
      prisma.chat.count(),
      prisma.message.count(),
      prisma.invite.count(),
      prisma.event.count(),
      prisma.user.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
          },
        },
      }),
      prisma.twin.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
          },
        },
      }),
    ]);

    // Get event type breakdown
    const eventTypes = await prisma.event.groupBy({
      by: ['type'],
      _count: {
        type: true,
      },
    });

    const eventBreakdown = eventTypes.reduce((acc, event) => {
      acc[event.type] = event._count.type;
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

export const getUserAnalytics = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Get user's analytics
    const [
      userTwins,
      userChats,
      userMessages,
      userInvitesSent,
      userInvitesReceived,
      userEvents,
    ] = await Promise.all([
      prisma.twin.count({
        where: { userId: req.user.id },
      }),
      prisma.chat.count({
        where: { userId: req.user.id },
      }),
      prisma.message.count({
        where: {
          chat: {
            userId: req.user.id,
          },
        },
      }),
      prisma.invite.count({
        where: { inviterId: req.user.id },
      }),
      prisma.invite.count({
        where: { acceptedBy: req.user.id },
      }),
      prisma.event.count({
        where: { userId: req.user.id },
      }),
    ]);

    // Get user's event breakdown
    const userEventTypes = await prisma.event.groupBy({
      by: ['type'],
      where: { userId: req.user.id },
      _count: {
        type: true,
      },
    });

    const userEventBreakdown = userEventTypes.reduce((acc, event) => {
      acc[event.type] = event._count.type;
      return acc;
    }, {} as Record<string, number>);

    res.json({
      user: {
        id: req.user.id,
        email: req.user.email,
        handle: req.user.handle,
      },
      analytics: {
        twins: userTwins,
        chats: userChats,
        messages: userMessages,
        invitesSent: userInvitesSent,
        invitesReceived: userInvitesReceived,
        events: userEvents,
      },
      eventBreakdown: userEventBreakdown,
    });
  } catch (error) {
    logger.error('Get user analytics error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
