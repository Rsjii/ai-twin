"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserAnalytics = exports.getMetricsSummary = void 0;
const prisma_1 = require("../../config/prisma");
const logger_1 = require("../../config/logger");
const getMetricsSummary = async (req, res) => {
    try {
        const [totalUsers, totalTwins, totalChats, totalMessages, totalInvites, totalEvents, recentSignups, recentTwins,] = await Promise.all([
            prisma_1.prisma.user.count(),
            prisma_1.prisma.twin.count(),
            prisma_1.prisma.chat.count(),
            prisma_1.prisma.message.count(),
            prisma_1.prisma.invite.count(),
            prisma_1.prisma.event.count(),
            prisma_1.prisma.user.count({
                where: {
                    createdAt: {
                        gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
                    },
                },
            }),
            prisma_1.prisma.twin.count({
                where: {
                    createdAt: {
                        gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
                    },
                },
            }),
        ]);
        const eventTypes = await prisma_1.prisma.event.groupBy({
            by: ['type'],
            _count: {
                type: true,
            },
        });
        const eventBreakdown = eventTypes.reduce((acc, event) => {
            acc[event.type] = event._count.type;
            return acc;
        }, {});
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
    }
    catch (error) {
        logger_1.logger.error('Get metrics error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getMetricsSummary = getMetricsSummary;
const getUserAnalytics = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const [userTwins, userChats, userMessages, userInvitesSent, userInvitesReceived, userEvents,] = await Promise.all([
            prisma_1.prisma.twin.count({
                where: { userId: req.user.id },
            }),
            prisma_1.prisma.chat.count({
                where: { userId: req.user.id },
            }),
            prisma_1.prisma.message.count({
                where: {
                    chat: {
                        userId: req.user.id,
                    },
                },
            }),
            prisma_1.prisma.invite.count({
                where: { inviterId: req.user.id },
            }),
            prisma_1.prisma.invite.count({
                where: { acceptedBy: req.user.id },
            }),
            prisma_1.prisma.event.count({
                where: { userId: req.user.id },
            }),
        ]);
        const userEventTypes = await prisma_1.prisma.event.groupBy({
            by: ['type'],
            where: { userId: req.user.id },
            _count: {
                type: true,
            },
        });
        const userEventBreakdown = userEventTypes.reduce((acc, event) => {
            acc[event.type] = event._count.type;
            return acc;
        }, {});
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
    }
    catch (error) {
        logger_1.logger.error('Get user analytics error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getUserAnalytics = getUserAnalytics;
//# sourceMappingURL=analyticsController.js.map