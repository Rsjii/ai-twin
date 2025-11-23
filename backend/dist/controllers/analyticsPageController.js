"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAnalytics = getAnalytics;
exports.getAdminAnalytics = getAdminAnalytics;
exports.getAdminAnalyticsPage = getAdminAnalyticsPage;
exports.getEventExplorerPage = getEventExplorerPage;
exports.getAnalyticsDetails = getAnalyticsDetails;
const database_1 = require("../config/database");
const logger_1 = require("../config/logger");
const errors_1 = require("../utils/errors");
const constants_1 = require("../config/constants");
const errorHandler_1 = require("../utils/errorHandler");
async function getAnalytics(req, res) {
    try {
        if (!req.user) {
            return res.redirect('/auth');
        }
        const fullUser = await database_1.userQueries.findByEmail(req.user.email);
        if (!fullUser) {
            return res.redirect('/auth');
        }
        const user = {
            id: fullUser.id,
            email: fullUser.email,
            handle: fullUser.handle,
            name: fullUser.name,
            profileImage: fullUser.profileImage,
        };
        const twinResult = await database_1.db.query('SELECT id FROM "Twin" WHERE "userId" = $1 LIMIT 1', [req.user.id]);
        const userTwinId = twinResult.rows.length > 0 ? twinResult.rows[0].id : '';
        res.render('analytics', {
            title: 'Analytics Dashboard - AI Twin',
            user: user,
            pathname: '/analytics',
            userTwinId: userTwinId,
            csrfToken: res.locals['csrfToken']
        });
    }
    catch (error) {
        logger_1.logger.error('Analytics page error:', {
            error: error instanceof Error ? error.message : 'Unknown error',
            userId: req.user?.id,
            path: req.path
        });
        (0, errorHandler_1.handleControllerError)(error, 'Failed to load analytics');
    }
}
async function getAdminAnalytics(req, res) {
    try {
        if (!req.user || !req.user.email || !constants_1.ADMIN_EMAILS.includes(req.user.email)) {
            return res.status(404).render('404', {
                title: 'Page Not Found',
            });
        }
        const fullUser = await database_1.userQueries.findByEmail(req.user.email);
        if (!fullUser) {
            return res.redirect('/auth');
        }
        res.render('admin-analytics', {
            title: 'Admin Analytics Dashboard - AI Twin',
            user: {
                id: fullUser.id,
                email: fullUser.email,
                handle: fullUser.handle,
                name: fullUser.name,
                profileImage: fullUser.profileImage
            },
            csrfToken: res.locals['csrfToken']
        });
    }
    catch (error) {
        logger_1.logger.error('Admin analytics page error:', {
            error: error instanceof Error ? error.message : 'Unknown error',
            userId: req.user?.id,
            path: req.path
        });
        (0, errorHandler_1.handleControllerError)(error, 'Failed to load admin analytics');
    }
}
async function getAdminAnalyticsPage(req, res) {
    try {
        if (!req.user || !req.user.email || !constants_1.ADMIN_EMAILS.includes(req.user.email)) {
            return res.status(404).render('404', {
                title: 'Page Not Found',
            });
        }
        const { type } = req.params;
        const validTypes = ['users', 'twins', 'chats', 'messages'];
        if (!validTypes.includes(type)) {
            throw errors_1.createError.notFound('Invalid page type');
        }
        const fullUser = await database_1.userQueries.findByEmail(req.user.email);
        if (!fullUser) {
            return res.redirect('/auth');
        }
        res.render(`admin-analytics-${type}`, {
            title: `Admin Analytics - ${type.charAt(0).toUpperCase() + type.slice(1)} - AI Twin`,
            user: {
                id: fullUser.id,
                email: fullUser.email,
                handle: fullUser.handle,
                name: fullUser.name,
                profileImage: fullUser.profileImage
            },
            pageType: type,
            csrfToken: res.locals['csrfToken']
        });
    }
    catch (error) {
        logger_1.logger.error('Admin analytics page error:', {
            error: error instanceof Error ? error.message : 'Unknown error',
            userId: req.user?.id,
            path: req.path
        });
        (0, errorHandler_1.handleControllerError)(error, 'Failed to load admin analytics page');
    }
}
async function getEventExplorerPage(req, res) {
    try {
        if (!req.user || !req.user.email || !constants_1.ADMIN_EMAILS.includes(req.user.email)) {
            return res.status(404).render('404', {
                title: 'Page Not Found',
            });
        }
        const fullUser = await database_1.userQueries.findByEmail(req.user.email);
        if (!fullUser) {
            return res.redirect('/auth');
        }
        res.render('admin-analytics-events', {
            title: 'Admin Analytics - Events Explorer - AI Twin',
            user: {
                id: fullUser.id,
                email: fullUser.email,
                handle: fullUser.handle,
                name: fullUser.name,
                profileImage: fullUser.profileImage
            },
            csrfToken: res.locals['csrfToken']
        });
    }
    catch (error) {
        logger_1.logger.error('Event explorer page error:', {
            error: error instanceof Error ? error.message : 'Unknown error',
            userId: req.user?.id,
            path: req.path
        });
        (0, errorHandler_1.handleControllerError)(error, 'Failed to load event explorer page');
    }
}
async function getAnalyticsDetails(req, res) {
    try {
        const { type, twinId, page = 1, limit = 50, search = '' } = req.query;
        const userTwins = await database_1.db.query('SELECT id FROM "Twin" WHERE "userId" = $1', [req.user.id]);
        const twinIds = userTwins.rows.map(t => t.id);
        let targetTwinId = null;
        if (twinId) {
            if (twinIds.includes(twinId)) {
                targetTwinId = twinId;
            }
            else {
                return res.status(403).json({ error: 'Access denied' });
            }
        }
        let data = [];
        let total = 0;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        if (type === 'likers') {
            const result = await database_1.db.query(`SELECT u.id, u.name, u.handle, u."profileImage", tl."createdAt" as likedAt
         FROM "TwinLike" tl
         JOIN "User" u ON tl."userId" = u.id
         WHERE tl."twinId" = ANY($1::text[])
         ${search ? `AND (u.name ILIKE $2 OR u.handle ILIKE $2)` : ''}
         ORDER BY tl."createdAt" DESC
         LIMIT $${search ? '3' : '2'} OFFSET $${search ? '4' : '3'}`, search ? [twinIds, `%${search}%`, limit, offset] : [twinIds, limit, offset]);
            data = result.rows;
            const countResult = await database_1.db.query(`SELECT COUNT(*) FROM "TwinLike" WHERE "twinId" = ANY($1::text[])`, [twinIds]);
            total = parseInt(countResult.rows[0].count);
        }
        else if (type === 'followers') {
            const result = await database_1.db.query(`SELECT u.id, u.name, u.handle, u."profileImage", tf."createdAt" as followedAt
     FROM "TwinFollow" tf
     JOIN "User" u ON tf."userId" = u.id
     WHERE tf."twinId" = ANY($1::text[])
     ${search ? `AND (u.name ILIKE $2 OR u.handle ILIKE $2)` : ''}
     ORDER BY tf."createdAt" DESC
     LIMIT $${search ? '3' : '2'} OFFSET $${search ? '4' : '3'}`, search ? [twinIds, `%${search}%`, limit, offset] : [twinIds, limit, offset]);
            data = result.rows;
            const countResult = await database_1.db.query(`SELECT COUNT(*) FROM "TwinFollow" WHERE "twinId" = ANY($1::text[])`, [twinIds]);
            total = parseInt(countResult.rows[0].count);
        }
        else if (type === 'chatters') {
            const result = await database_1.db.query(`SELECT DISTINCT
      u.id,
      u.name,
      u.handle,
      u."profileImage",
      MAX(c."createdAt") as "lastChatAt",
      MIN(c."createdAt") as "firstChatAt",
      COUNT(DISTINCT c.id) as "chatCount",
      COUNT(DISTINCT m.id) as "messageCount"
     FROM "Chat" c
     JOIN "User" u ON c."userId" = u.id
     LEFT JOIN "Message" m ON c.id = m."chatId"
     WHERE c."twinId" = ANY($1::text[])
     ${search ? `AND (u.name ILIKE $2 OR u.handle ILIKE $2)` : ''}
     GROUP BY u.id, u.name, u.handle, u."profileImage"
     ORDER BY "lastChatAt" DESC
     LIMIT $${search ? '3' : '2'} OFFSET $${search ? '4' : '3'}`, search ? [twinIds, `%${search}%`, limit, offset] : [twinIds, limit, offset]);
            data = result.rows;
            const countResult = await database_1.db.query(`SELECT COUNT(DISTINCT c."userId") FROM "Chat" c WHERE c."twinId" = ANY($1::text[])`, [twinIds]);
            total = parseInt(countResult.rows[0].count);
        }
        res.render('analytics-details', {
            title: `Analytics Details - ${type}`,
            user: req.user,
            type: type,
            data: data,
            pagination: { page: parseInt(page), limit: parseInt(limit), total },
            csrfToken: res.locals['csrfToken']
        });
    }
    catch (error) {
        logger_1.logger.error('Get analytics details error:', error);
        (0, errorHandler_1.handleControllerError)(error, 'Failed to load analytics details');
    }
}
//# sourceMappingURL=analyticsPageController.js.map