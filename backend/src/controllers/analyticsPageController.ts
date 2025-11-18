import { Response } from 'express';
import { db, userQueries } from '../config/database';
import { logger } from '../config/logger';
import { AppError, createError } from '../utils/errors';
import { ADMIN_EMAILS } from '../config/constants';
import { handleControllerError } from '../utils/errorHandler';

/**
 * Analytics dashboard page - User analytics
 */
export async function getAnalytics(req: any, res: Response) {
  try {
    if (!req.user) {
      return res.redirect('/auth');
    }
    
    const fullUser = await userQueries.findByEmail(req.user.email);
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

    //Get user's twin ID
    const twinResult = await db.query(
      'SELECT id FROM "Twin" WHERE "userId" = $1 LIMIT 1',
      [req.user.id]
    );
    const userTwinId = twinResult.rows.length > 0 ? twinResult.rows[0].id : '';
    
    res.render('analytics', {
      title: 'Analytics Dashboard - AI Twin',
      user: user,
      pathname: '/analytics',
      userTwinId: userTwinId,
      csrfToken: res.locals['csrfToken']
    });
  } catch (error) {
    logger.error('Analytics page error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.id,
      path: req.path
    });

    handleControllerError(error, 'Failed to load analytics');
  }
}

/**
 * Admin Analytics dashboard page
 */
export async function getAdminAnalytics(req: any, res: Response) {
  try {
    if (!req.user || !req.user.email || !ADMIN_EMAILS.includes(req.user.email)) {
      throw createError.forbidden('Admin access required');
    }

    const fullUser = await userQueries.findByEmail(req.user.email);
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
  } catch (error) {
    logger.error('Admin analytics page error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.id,
      path: req.path
    });
    
    handleControllerError(error, 'Failed to load admin analytics');
  }
}

/**
 * Admin Analytics detailed page
 */
export async function getAdminAnalyticsPage(req: any, res: Response) {
  try {
    if (!req.user || !req.user.email || !ADMIN_EMAILS.includes(req.user.email)) {
      throw createError.forbidden('Admin access required');
    }

    const { type } = req.params;
    const validTypes = ['users', 'twins', 'chats', 'messages'];
    
    if (!validTypes.includes(type)) {
      throw createError.notFound('Invalid page type');
    }

    const fullUser = await userQueries.findByEmail(req.user.email);
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
  } catch (error) {
    logger.error('Admin analytics page error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.id,
      path: req.path
    });
    
    handleControllerError(error, 'Failed to load admin analytics page');
  }
}

// Add to existing analyticsPageController.ts
export async function getAnalyticsDetails(req: any, res: Response) {
  try {
    const { type, twinId, page = 1, limit = 50, search = '' } = req.query;
    
    // Get user's twin IDs
    const userTwins = await db.query(
      'SELECT id FROM "Twin" WHERE "userId" = $1',
      [req.user.id]
    );
    
    const twinIds = userTwins.rows.map(t => t.id);
    
    // If specific twinId provided, verify user owns it
    let targetTwinId = null;
    if (twinId) {
      if (twinIds.includes(twinId)) {
        targetTwinId = twinId;
      } else {
        return res.status(403).json({ error: 'Access denied' });
      }
    }
    
    // Fetch data based on type
    let data = [];
    let total = 0;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    if (type === 'likers') {
      // Get likers data with pagination
      const result = await db.query(
        `SELECT u.id, u.name, u.handle, u."profileImage", tl."createdAt" as likedAt
         FROM "TwinLike" tl
         JOIN "User" u ON tl."userId" = u.id
         WHERE tl."twinId" = ANY($1::text[])
         ${search ? `AND (u.name ILIKE $2 OR u.handle ILIKE $2)` : ''}
         ORDER BY tl."createdAt" DESC
         LIMIT $${search ? '3' : '2'} OFFSET $${search ? '4' : '3'}`,
        search ? [twinIds, `%${search}%`, limit, offset] : [twinIds, limit, offset]
      );
      data = result.rows;
      
      const countResult = await db.query(
        `SELECT COUNT(*) FROM "TwinLike" WHERE "twinId" = ANY($1::text[])`,
        [twinIds]
      );
      total = parseInt(countResult.rows[0].count);
} else if (type === 'followers') {
  // Get followers data with pagination
  const result = await db.query(
    `SELECT u.id, u.name, u.handle, u."profileImage", tf."createdAt" as followedAt
     FROM "TwinFollow" tf
     JOIN "User" u ON tf."userId" = u.id
     WHERE tf."twinId" = ANY($1::text[])
     ${search ? `AND (u.name ILIKE $2 OR u.handle ILIKE $2)` : ''}
     ORDER BY tf."createdAt" DESC
     LIMIT $${search ? '3' : '2'} OFFSET $${search ? '4' : '3'}`,
    search ? [twinIds, `%${search}%`, limit, offset] : [twinIds, limit, offset]
  );
  data = result.rows;
  
  const countResult = await db.query(
    `SELECT COUNT(*) FROM "TwinFollow" WHERE "twinId" = ANY($1::text[])`,
    [twinIds]
  );
  total = parseInt(countResult.rows[0].count);
} else if (type === 'chatters') {
  // Get chatters data with pagination
  const result = await db.query(
    `SELECT DISTINCT
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
     LIMIT $${search ? '3' : '2'} OFFSET $${search ? '4' : '3'}`,
    search ? [twinIds, `%${search}%`, limit, offset] : [twinIds, limit, offset]
  );
  data = result.rows;
  
  const countResult = await db.query(
    `SELECT COUNT(DISTINCT c."userId") FROM "Chat" c WHERE c."twinId" = ANY($1::text[])`,
    [twinIds]
  );
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
  } catch (error) {
    logger.error('Get analytics details error:', error);
    handleControllerError(error, 'Failed to load analytics details');
  }
}